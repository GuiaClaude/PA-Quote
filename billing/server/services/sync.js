import { query, tx, withAdvisoryLock } from '../db.js';
import { FIELDS, WRITABLE_CANDIDATES } from '../domain/fields.js';
import { parseSheet, normInvoice, normName, inVocab, colLetter, normJo } from '../domain/sheetParse.js';
import { fromCents, toCents } from '../lib/money.js';
import { parseSheetDate } from '../lib/dates.js';
import { getIntegrations, logIntegrationError } from '../google/index.js';
import { getSetting } from './settings.js';
import { audit, SYSTEM } from './audit.js';
import { raiseException, autoResolveStale } from './exceptions.js';
import { notifyRole } from './notify.js';

// Exception kinds owned by the sync: auto-resolved when no longer observed after a successful sync.
const SYNC_KINDS = ['missing_jo_number', 'duplicate_jo_in_source', 'removed_from_source', 'unmatched_client', 'row_parse_error',
  'invoice_multi_jo', 'invoice_source_mismatch', 'duplicate_invoice_number', 'invoice_client_mismatch', 'missing_billing_amount',
  'source_paid_amount_mismatch'];

const SOURCE_COLS = Object.entries(FIELDS).filter(([k]) => k !== 'jo_number').map(([k, d]) => [k, d.column]);

function dbValue(field, v) {
  if (v === null || v === undefined) return null;
  return FIELDS[field].type === 'money' ? fromCents(v) : v;
}

/**
 * Synchronize the Job Order List into the application. Fails closed: any problem reading
 * the sheet or validating its headers marks the run failed and changes nothing.
 */
export async function runSync({ trigger = 'manual', actor = SYSTEM } = {}) {
  const res = await withAdvisoryLock('sheet-sync', () => doSync({ trigger, actor }));
  if (!res.locked) return { status: 'skipped', reason: 'Another synchronization is already running' };
  return res.result;
}

async function doSync({ trigger, actor }) {
  const cfg = await getSetting('sheet');
  const { rows: [run] } = await query(
    'INSERT INTO sync_runs(trigger, spreadsheet_id, tab_name, triggered_by) VALUES ($1,$2,$3,$4) RETURNING *',
    [trigger, cfg.spreadsheetId || null, cfg.tabName || null, actor.id ?? null],
  );
  const fail = async (msg) => {
    await query(`UPDATE sync_runs SET status='failed', finished_at=now(), error=$2 WHERE id=$1`, [run.id, msg]);
    await audit(null, actor, 'sync.failed', 'sync_run', run.id, { after: { error: msg } });
    await notifyRole('sysadmin', 'sync_failed', `Google Sheets synchronization failed: ${msg}`, '/settings');
    return { status: 'failed', syncRunId: run.id, error: msg };
  };

  if (!cfg.spreadsheetId || !cfg.tabName) return fail('Spreadsheet ID and authoritative tab are not configured');
  const { sheets } = await getIntegrations();
  if (!sheets) return fail('Google Sheets is not connected/authorized');

  let values;
  try {
    values = await sheets.getValues(cfg.spreadsheetId, cfg.tabName);
  } catch (e) {
    await logIntegrationError('sheets', e.message, { syncRunId: run.id });
    return fail(`Could not read sheet: ${e.message}`);
  }
  const parsed = parseSheet(values, cfg);
  if (!parsed.ok) return fail(`Header/mapping validation failed: ${parsed.headerErrors.join('; ')}`);

  try {
    const stats = await tx(async (db) => applyParsed(db, parsed, cfg, run, actor));
    await query(
      `UPDATE sync_runs SET status='succeeded', finished_at=now(), rows_read=$2, inserted=$3, updated=$4, unchanged=$5, flagged=$6, removed=$7 WHERE id=$1`,
      [run.id, stats.rowsRead, stats.inserted, stats.updated, stats.unchanged, stats.flagged, stats.removed],
    );
    await audit(null, actor, 'sync.succeeded', 'sync_run', run.id, { after: stats });
    return { status: 'succeeded', syncRunId: run.id, ...stats };
  } catch (e) {
    return fail(`Applying changes failed: ${e.message}`);
  }
}

async function applyParsed(db, parsed, cfg, run, actor) {
  const stats = { rowsRead: parsed.rows.length + parsed.issues.length + parsed.duplicates.flat().length, inserted: 0, updated: 0, unchanged: 0, flagged: 0, removed: 0 };
  const runStart = (await db.query('SELECT now() AS t')).rows[0].t;

  for (const issue of parsed.issues) {
    stats.flagged++;
    await raiseException(db, { kind: issue.kind, key: `row:${JSON.stringify(issue.raw)}`, message: issue.message, details: issue });
  }
  const dupJos = new Set();
  for (const group of parsed.duplicates) {
    stats.flagged += group.length;
    const jo = group[0].fields.jo_number;
    dupJos.add(jo.toUpperCase());
    await raiseException(db, {
      kind: 'duplicate_jo_in_source', key: jo.toUpperCase(), severity: 'critical',
      message: `Job Order ${jo} appears on rows ${group.map((g) => g.rowNumber).join(', ')}. Rows are not imported until resolved in the sheet.`,
      details: { rows: group.map((g) => ({ rowNumber: g.rowNumber, fields: g.fields })) },
    });
    // Keep the existing record visible but mark that it was seen (not removed).
    await db.query('UPDATE job_orders SET last_seen_sync_id=$2 WHERE upper(jo_number)=upper($1)', [jo, run.id]);
  }

  const aliases = new Map((await db.query('SELECT alias_normalized, client_id FROM client_aliases')).rows.map((r) => [r.alias_normalized, r.client_id]));

  for (const row of parsed.rows) {
    const f = row.fields;
    const clientId = f.client_name ? aliases.get(normName(f.client_name)) ?? null : null;
    const paid = inVocab(f.payment_status, cfg.paidValues);
    const { rows: existing } = await db.query('SELECT * FROM job_orders WHERE upper(jo_number)=upper($1) FOR UPDATE', [f.jo_number]);
    const colVals = SOURCE_COLS.map(([k]) => dbValue(k, f[k]));

    let jo;
    if (!existing.length) {
      const cols = ['jo_number', ...SOURCE_COLS.map(([, c]) => c), 'client_id', 'is_paid_in_source', 'source_row_number', 'source_row_hash', 'source_raw', 'source_present', 'last_seen_sync_id'];
      const vals = [f.jo_number, ...colVals, clientId, paid, row.rowNumber, row.hash, JSON.stringify(row.raw), true, run.id];
      ({ rows: [jo] } = await db.query(`INSERT INTO job_orders(${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals));
      stats.inserted++;
      await audit(db, actor, 'job_order.imported', 'job_order', f.jo_number, { after: f, related: { syncRunId: run.id, row: row.rowNumber } });
    } else {
      const prev = existing[0];
      const changed = prev.source_row_hash !== row.hash || !prev.source_present;
      const sets = SOURCE_COLS.map(([, c], i) => `${c}=$${i + 2}`);
      const extra = SOURCE_COLS.length + 2;
      ({ rows: [jo] } = await db.query(
        `UPDATE job_orders SET ${sets.join(',')}, client_id=COALESCE(client_id,$${extra}), is_paid_in_source=$${extra + 1},
           source_row_number=$${extra + 2}, source_row_hash=$${extra + 3}, source_raw=$${extra + 4}, source_present=TRUE,
           last_seen_sync_id=$${extra + 5}, updated_at=CASE WHEN $${extra + 6} THEN now() ELSE updated_at END
         WHERE id=$1 RETURNING *`,
        [prev.id, ...colVals, clientId, paid, row.rowNumber, row.hash, JSON.stringify(row.raw), run.id, changed],
      ));
      if (changed) {
        stats.updated++;
        const before = {}; const after = {};
        for (const [k, c] of SOURCE_COLS) {
          const a = prev[c] == null ? null : String(prev[c]);
          const b = jo[c] == null ? null : String(jo[c]);
          if (a !== b) { before[k] = prev[c]; after[k] = jo[c]; }
        }
        if (!prev.source_present) { before.source_present = false; after.source_present = true; }
        await audit(db, actor, 'job_order.source_changed', 'job_order', jo.jo_number, { before, after, related: { syncRunId: run.id, row: row.rowNumber } });
        if ('payment_status' in after) {
          await audit(db, actor, 'job_order.payment_status_changed', 'job_order', jo.jo_number, { before: { payment_status: before.payment_status }, after: { payment_status: after.payment_status } });
        }
        // A pending write-back whose expected value no longer matches the sheet is now a conflict.
        await flagWritebackConflicts(db, jo, f);
      } else stats.unchanged++;
    }

    if (row.issues.length) {
      stats.flagged++;
      await raiseException(db, { kind: 'row_parse_error', key: jo.jo_number, jobOrderId: jo.id, message: `Job Order ${jo.jo_number}: ${row.issues.join('; ')}`, details: { row: row.rowNumber } });
    }
    if (f.client_name && !jo.client_id) {
      await raiseException(db, {
        kind: 'unmatched_client', key: normName(f.client_name), jobOrderId: jo.id,
        message: `Client "${f.client_name}" (JO ${jo.jo_number}) is not linked to a Client Master record. Link it via a verified alias.`,
      });
    }
    if (paid && f.billing_amount != null && f.amount_paid != null && f.amount_paid < f.billing_amount) {
      await raiseException(db, {
        kind: 'source_paid_amount_mismatch', key: jo.jo_number, jobOrderId: jo.id, severity: 'warning',
        message: `JO ${jo.jo_number} is marked "${f.payment_status}" but the sheet's amount paid (${fromCents(f.amount_paid)}) is below the billing amount (${fromCents(f.billing_amount)}).`,
      });
    }
    await linkInvoice(db, jo, f, actor, run);
  }

  // Records absent from this (successful, complete) read are flagged — never deleted.
  const { rows: missing } = await db.query(
    `UPDATE job_orders SET source_present=FALSE WHERE source_present AND (last_seen_sync_id IS NULL OR last_seen_sync_id <> $1) AND NOT is_sample RETURNING id, jo_number`,
    [run.id],
  );
  for (const m of missing) {
    stats.removed++;
    await audit(db, actor, 'job_order.missing_from_source', 'job_order', m.jo_number, { related: { syncRunId: run.id } });
  }
  const { rows: stillMissing } = await db.query('SELECT id, jo_number FROM job_orders WHERE NOT source_present AND NOT is_sample');
  for (const m of stillMissing) {
    await raiseException(db, {
      kind: 'removed_from_source', key: m.jo_number, jobOrderId: m.id,
      message: `Job Order ${m.jo_number} is no longer in the authoritative tab (deleted, renamed or moved). It is excluded from collection runs until resolved.`,
    });
  }
  await checkDuplicateInvoices(db);
  await autoResolveStale(db, SYNC_KINDS, runStart);
  return stats;
}

async function flagWritebackConflicts(db, jo, f) {
  const { rows } = await db.query(`SELECT * FROM sheet_writebacks WHERE job_order_id=$1 AND status='proposed'`, [jo.id]);
  for (const wb of rows) {
    const current = f[wb.field] == null ? '' : String(FIELDS[wb.field].type === 'money' ? fromCents(f[wb.field]) : f[wb.field]);
    if ((wb.expected_value ?? '') !== current) {
      await db.query(`UPDATE sheet_writebacks SET status='conflict', error=$2 WHERE id=$1`, [wb.id, `Sheet value changed to "${current}" since the update was proposed`]);
      await audit(db, SYSTEM, 'writeback.conflict', 'sheet_writeback', wb.id, { before: { expected: wb.expected_value }, after: { current } });
    }
  }
}

/** Ensure exactly one ledger invoice per invoice number and link the job order to it. */
async function linkInvoice(db, jo, f, actor, run) {
  const invNo = f.invoice_number ? normInvoice(f.invoice_number) : null;
  if (!invNo) return;
  if (f.billing_amount == null) {
    await raiseException(db, { kind: 'missing_billing_amount', key: jo.jo_number, jobOrderId: jo.id, message: `JO ${jo.jo_number} has invoice ${invNo} but no billing amount in the sheet.` });
    return;
  }
  let { rows: [inv] } = await db.query('SELECT * FROM invoices WHERE invoice_number=$1 FOR UPDATE', [invNo]);
  if (!inv) {
    ({ rows: [inv] } = await db.query(
      `INSERT INTO invoices(invoice_number, client_id, invoice_date, due_date, amount, status, source) VALUES ($1,$2,$3,$4,$5,'unreconciled','sheet') RETURNING *`,
      [invNo, jo.client_id, f.billing_date, f.due_date, fromCents(f.billing_amount)],
    ));
    await audit(db, actor, 'invoice.created_from_sheet', 'invoice', invNo, { after: { amount: fromCents(f.billing_amount), jo: jo.jo_number }, related: { syncRunId: run.id } });
  }
  await db.query('INSERT INTO invoice_job_orders(invoice_id, job_order_id, amount_portion) VALUES ($1,$2,$3) ON CONFLICT (invoice_id, job_order_id) DO UPDATE SET amount_portion=EXCLUDED.amount_portion',
    [inv.id, jo.id, fromCents(f.billing_amount)]);
  // A JO that changed invoice numbers in the sheet keeps a stale link: remove it only from unreconciled invoices.
  const { rows: stale } = await db.query(
    `DELETE FROM invoice_job_orders ij USING invoices i WHERE ij.invoice_id=i.id AND ij.job_order_id=$1 AND i.id<>$2 AND i.status='unreconciled' RETURNING i.invoice_number`, [jo.id, inv.id]);
  for (const s of stale) await audit(db, actor, 'invoice.unlinked_job_order', 'invoice', s.invoice_number, { before: { jo: jo.jo_number }, reason: 'Invoice number changed in source sheet' });

  const { rows: links } = await db.query(
    `SELECT ij.amount_portion, j.jo_number, j.client_id FROM invoice_job_orders ij JOIN job_orders j ON j.id=ij.job_order_id WHERE ij.invoice_id=$1`, [inv.id]);
  const portions = links.map((l) => toCents(l.amount_portion));
  const multi = links.length > 1;
  // Multiple rows citing one invoice: amounts may be per-JO portions or the full invoice repeated — staff must confirm.
  const derivedAmount = multi ? (portions.every((p) => p === portions[0]) ? portions[0] : portions.reduce((a, b) => a + b, 0)) : f.billing_amount;

  if (inv.status === 'unreconciled') {
    const upd = { amount: fromCents(derivedAmount), invoice_date: f.billing_date ?? inv.invoice_date, due_date: f.due_date ?? inv.due_date, client_id: inv.client_id ?? jo.client_id };
    if (upd.amount !== inv.amount || upd.invoice_date !== inv.invoice_date || upd.due_date !== inv.due_date || upd.client_id !== inv.client_id) {
      await db.query('UPDATE invoices SET amount=$2, invoice_date=$3, due_date=$4, client_id=$5 WHERE id=$1', [inv.id, upd.amount, upd.invoice_date, upd.due_date, upd.client_id]);
      await audit(db, actor, 'invoice.updated_from_sheet', 'invoice', invNo, { before: { amount: inv.amount, invoice_date: inv.invoice_date, due_date: inv.due_date }, after: upd });
    }
  } else if (inv.status === 'issued') {
    // Reconciled ledger invoices are never silently overwritten from the sheet.
    const diffs = [];
    if (!multi && toCents(inv.amount) !== f.billing_amount) diffs.push(`amount sheet=${fromCents(f.billing_amount)} ledger=${inv.amount}`);
    if (f.billing_date && f.billing_date !== inv.invoice_date) diffs.push(`invoice date sheet=${f.billing_date} ledger=${inv.invoice_date}`);
    if (f.due_date && f.due_date !== inv.due_date) diffs.push(`due date sheet=${f.due_date} ledger=${inv.due_date}`);
    if (diffs.length) {
      await raiseException(db, { kind: 'invoice_source_mismatch', key: `${invNo}:${jo.jo_number}`, jobOrderId: jo.id, invoiceId: inv.id, clientId: inv.client_id,
        message: `Invoice ${invNo} (JO ${jo.jo_number}) differs between the sheet and the reconciled ledger: ${diffs.join('; ')}` });
    }
  }
  if (multi && inv.status === 'unreconciled') {
    await raiseException(db, { kind: 'invoice_multi_jo', key: invNo, invoiceId: inv.id, severity: 'warning',
      message: `Invoice ${invNo} is referenced by ${links.length} job orders (${links.map((l) => l.jo_number).join(', ')}). Confirm the invoice total before reconciling; it is counted once.` });
  }
  const clientIds = new Set(links.map((l) => l.client_id).filter(Boolean));
  if (inv.client_id) clientIds.add(inv.client_id);
  if (clientIds.size > 1) {
    await raiseException(db, { kind: 'invoice_client_mismatch', key: invNo, invoiceId: inv.id, severity: 'critical',
      message: `Invoice ${invNo} is linked to job orders belonging to different clients.` });
  }
}

async function checkDuplicateInvoices(db) {
  // Same invoice number written differently (spacing/case) on different JOs is caught by normalization;
  // here we catch invoice numbers in the sheet that collide with an invoice of another client.
  const { rows } = await db.query(
    `SELECT upper(trim(j.invoice_number_source)) AS inv, array_agg(DISTINCT j.jo_number) AS jos, count(DISTINCT j.client_name_source) AS names
       FROM job_orders j WHERE j.invoice_number_source IS NOT NULL AND j.source_present GROUP BY 1 HAVING count(DISTINCT j.client_name_source) > 1`);
  for (const r of rows) {
    await raiseException(db, { kind: 'duplicate_invoice_number', key: r.inv, severity: 'critical',
      message: `Invoice number ${r.inv} is used by job orders of different clients: ${r.jos.join(', ')}` });
  }
}

// ───────────────────────── Sync status ─────────────────────────

export async function syncStatus() {
  const policy = await getSetting('policy');
  const { rows: [last] } = await query('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1');
  const { rows: [ok] } = await query(`SELECT * FROM sync_runs WHERE status='succeeded' ORDER BY id DESC LIMIT 1`);
  const ageHours = ok ? (Date.now() - new Date(ok.finished_at).getTime()) / 3600000 : null;
  const stale = !ok || last.status === 'failed' || ageHours > policy.staleSyncHours;
  return {
    lastRun: last || null, lastSuccess: ok || null, stale,
    staleReason: !ok ? 'No successful synchronization yet' : last.status === 'failed' ? `Latest synchronization failed: ${last.error}` : ageHours > policy.staleSyncHours ? `Last successful sync was ${ageHours.toFixed(1)} hours ago` : null,
  };
}

// ───────────────────────── Write-back ─────────────────────────

export async function proposeWriteback({ jobOrderId, field, newValue, reason }, actor) {
  const cfg = await getSetting('sheet');
  if (!WRITABLE_CANDIDATES.includes(field) || !cfg.writableFields.includes(field)) throw Object.assign(new Error(`Field "${field}" is not enabled for write-back`), { status: 400 });
  if (!cfg.mapping[field]) throw Object.assign(new Error(`Field "${field}" is not mapped to a sheet column`), { status: 400 });
  if (!reason?.trim()) throw Object.assign(new Error('A reason is required'), { status: 400 });
  const type = FIELDS[field].type;
  if (type === 'money' && toCents(newValue) === null) throw Object.assign(new Error('Invalid amount'), { status: 400 });
  if (type === 'date' && !parseSheetDate(newValue, 'MDY')) throw Object.assign(new Error('Invalid date (use YYYY-MM-DD)'), { status: 400 });
  const { rows: [jo] } = await query('SELECT * FROM job_orders WHERE id=$1', [jobOrderId]);
  if (!jo) throw Object.assign(new Error('Job order not found'), { status: 404 });
  const cur = jo[FIELDS[field].column];
  const { rows: [wb] } = await query(
    `INSERT INTO sheet_writebacks(job_order_id, field, expected_value, new_value, reason, requested_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [jobOrderId, field, cur == null ? '' : String(cur), String(newValue), reason, actor.id],
  );
  await audit(null, actor, 'writeback.proposed', 'sheet_writeback', wb.id, { before: { [field]: cur }, after: { [field]: newValue }, reason, related: { jo: jo.jo_number } });
  return wb;
}

/**
 * Apply an approved write-back. Locates the row by Job Order Number (never a stored row number),
 * refuses formula cells, and aborts if the live cell no longer holds the expected value.
 */
export async function applyWriteback(id, actor) {
  const { rows: [wb] } = await query('SELECT w.*, j.jo_number FROM sheet_writebacks w JOIN job_orders j ON j.id=w.job_order_id WHERE w.id=$1', [id]);
  if (!wb) throw Object.assign(new Error('Not found'), { status: 404 });
  if (wb.status !== 'proposed') throw Object.assign(new Error(`Write-back is ${wb.status}`), { status: 409 });
  if (wb.requested_by === actor.id) throw Object.assign(new Error('The requester cannot approve their own sheet update'), { status: 403 });
  const cfg = await getSetting('sheet');
  const { sheets } = await getIntegrations();
  if (!sheets) throw Object.assign(new Error('Google Sheets is not connected'), { status: 503 });

  const setStatus = async (status, extra = {}) => {
    await query(`UPDATE sheet_writebacks SET status=$2, decided_by=$3, decided_at=now(), applied_range=$4, error=$5 WHERE id=$1`,
      [id, status, actor.id, extra.range ?? null, extra.error ?? null]);
    await audit(null, actor, `writeback.${status}`, 'sheet_writeback', id, { after: { field: wb.field, value: wb.new_value, ...extra }, related: { jo: wb.jo_number } });
  };

  const values = await sheets.getValues(cfg.spreadsheetId, cfg.tabName);
  const parsed = parseSheet(values, cfg);
  if (!parsed.ok) { await setStatus('failed', { error: parsed.headerErrors.join('; ') }); throw Object.assign(new Error('Sheet headers no longer match the mapping'), { status: 409 }); }
  const matches = parsed.rows.filter((r) => r.fields.jo_number.toUpperCase() === normJo(wb.jo_number).toUpperCase());
  if (matches.length !== 1) {
    await setStatus('conflict', { error: matches.length ? 'Job order appears more than once' : 'Job order not found in sheet' });
    throw Object.assign(new Error('Job order row could not be uniquely located'), { status: 409 });
  }
  const row = matches[0];
  const colIdx = parsed.columns[wb.field];
  const a1 = `${colLetter(colIdx)}${row.rowNumber}`;
  const cell = await sheets.getCell(cfg.spreadsheetId, cfg.tabName, a1);
  if (cell.formula) { await setStatus('conflict', { error: `Cell ${a1} contains a formula; not overwritten` }); throw Object.assign(new Error('Target cell contains a formula'), { status: 409 }); }
  const live = row.fields[wb.field] == null ? '' : String(FIELDS[wb.field].type === 'money' ? fromCents(row.fields[wb.field]) : row.fields[wb.field]);
  if (live !== (wb.expected_value ?? '')) {
    await setStatus('conflict', { error: `Sheet now shows "${live}" (expected "${wb.expected_value}"); a staff edit was detected` });
    throw Object.assign(new Error('Concurrent edit detected; the sheet value changed'), { status: 409 });
  }
  const { updatedRange } = await sheets.updateCell(cfg.spreadsheetId, cfg.tabName, a1, wb.new_value);
  await setStatus('applied', { range: updatedRange });
  return { applied: true, range: updatedRange };
}

export async function rejectWriteback(id, actor, reason) {
  const { rows } = await query(`UPDATE sheet_writebacks SET status='rejected', decided_by=$2, decided_at=now(), error=$3 WHERE id=$1 AND status='proposed' RETURNING *`, [id, actor.id, reason || null]);
  if (!rows.length) throw Object.assign(new Error('Not found or not pending'), { status: 404 });
  await audit(null, actor, 'writeback.rejected', 'sheet_writeback', id, { reason });
  return rows[0];
}

/** Discovery for the Settings / Column Mapping screen. Reads only. */
export async function discoverSpreadsheet(spreadsheetId, tabName) {
  const { sheets } = await getIntegrations();
  if (!sheets) throw Object.assign(new Error('Google Sheets is not connected'), { status: 503 });
  const meta = await sheets.getMetadata(spreadsheetId);
  let preview = null;
  if (tabName) {
    const values = await sheets.getValues(spreadsheetId, tabName, 'FORMATTED_VALUE');
    preview = { rows: values.slice(0, 15), totalRows: values.length };
  }
  return { ...meta, preview };
}
