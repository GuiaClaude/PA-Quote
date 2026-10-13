import { query } from '../db.js';
import { jobOrderBalance } from './ledger.js';
import { getSetting } from './settings.js';
import { computeTracking } from '../domain/stage.js';
import { audit } from './audit.js';
import { manilaDate, isValidDateStr } from '../lib/dates.js';
import { badRequest, notFound } from '../lib/errors.js';
import { normName } from '../domain/sheetParse.js';

export async function jobOrderDetail(id) {
  const { rows: [jo] } = await query(`SELECT j.*, c.registered_name AS client_name, c.client_code FROM job_orders j LEFT JOIN clients c ON c.id=j.client_id WHERE j.id=$1`, [id]);
  if (!jo) throw notFound('Job order not found');
  const asOf = manilaDate();
  const balance = await jobOrderBalance(id, asOf);
  const { rows: invoices } = await query(`SELECT i.* FROM invoices i JOIN invoice_job_orders ij ON ij.invoice_id=i.id WHERE ij.job_order_id=$1 ORDER BY i.invoice_date`, [id]);
  const sheetCfg = await getSetting('sheet');
  const tracking = computeTracking(jo, { balance, invoiceSent: invoices.some((i) => i.sent_confirmed_at), sheetCfg, asOf });
  const [drafts, activities, promises, soas, exceptions, writebacks, approvals, audits] = await Promise.all([
    query(`SELECT id, status, version, subject, tone, amounts, collection_run_id, sent_at, created_at, blocked_reasons FROM email_drafts WHERE $1 = ANY(covered_job_order_ids) ORDER BY id DESC`, [id]),
    query(`SELECT a.*, u.email AS actor FROM collection_activities a LEFT JOIN users u ON u.id=a.actor_id WHERE a.job_order_id=$1 ORDER BY at DESC`, [id]),
    query(`SELECT * FROM payment_promises WHERE job_order_id=$1 ORDER BY recorded_at DESC`, [id]),
    jo.client_id ? query(`SELECT id, statement_number, version, statement_date, status, has_discrepancy, totals, drive_web_link FROM soa_statements WHERE client_id=$1 ORDER BY generated_at DESC LIMIT 20`, [jo.client_id]) : { rows: [] },
    query(`SELECT * FROM exceptions WHERE job_order_id=$1 ORDER BY status, created_at DESC`, [id]),
    query(`SELECT w.*, u.email AS requested_by_email FROM sheet_writebacks w JOIN users u ON u.id=w.requested_by WHERE job_order_id=$1 ORDER BY id DESC`, [id]),
    query(`SELECT a.*, u.email AS approver FROM approvals a JOIN users u ON u.id=a.approver_id JOIN email_drafts d ON d.id=a.draft_id WHERE $1 = ANY(d.covered_job_order_ids) ORDER BY a.id DESC`, [id]),
    query(`SELECT * FROM audit_log WHERE entity_type='job_order' AND entity_id=$1 ORDER BY id DESC LIMIT 50`, [jo.jo_number]),
  ]);
  return { jobOrder: jo, tracking, balance, invoices, drafts: drafts.rows, activities: activities.rows, promises: promises.rows, soas: soas.rows,
    exceptions: exceptions.rows, writebacks: writebacks.rows, approvals: approvals.rows, audit: audits.rows };
}

const APP_FIELDS = {
  exception_state: (v) => v === null || ['on_hold', 'disputed', 'cancelled', 'for_verification'].includes(v),
  billable_status: (v) => ['per_source', 'billable', 'not_yet_billable', 'not_billable'].includes(v),
  billing_terms_note: (v) => v === null || typeof v === 'string',
  next_followup_date: (v) => v === null || isValidDateStr(v),
  staff_remarks: (v) => v === null || typeof v === 'string',
};

/** Updates application-managed attributes only. Sheet-sourced fields change via sync or write-back. */
export async function updateJobOrder(id, patch, actor, reason) {
  const { rows: [jo] } = await query('SELECT * FROM job_orders WHERE id=$1', [id]);
  if (!jo) throw notFound();
  const sets = []; const vals = [id]; const before = {}; const after = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in APP_FIELDS)) throw badRequest(`Field ${k} cannot be edited here`);
    if (!APP_FIELDS[k](v)) throw badRequest(`Invalid value for ${k}`);
    vals.push(v); sets.push(`${k}=$${vals.length}`); before[k] = jo[k]; after[k] = v;
  }
  if (!sets.length) return jo;
  if (('exception_state' in patch || 'billable_status' in patch) && !reason?.trim()) throw badRequest('A reason is required for status changes');
  const { rows: [u] } = await query(`UPDATE job_orders SET ${sets.join(',')}, updated_at=now() WHERE id=$1 RETURNING *`, vals);
  await audit(null, actor, 'job_order.updated', 'job_order', jo.jo_number, { before, after, reason });
  return u;
}

export async function addPromise(jobOrderId, { promisedDate, amount, note }, actor) {
  const { rows: [jo] } = await query('SELECT * FROM job_orders WHERE id=$1', [jobOrderId]);
  if (!jo?.client_id) throw badRequest('Job order must be linked to a client');
  if (!isValidDateStr(promisedDate)) throw badRequest('Promised date required');
  const { rows: [p] } = await query(`INSERT INTO payment_promises(job_order_id, client_id, promised_date, amount, note, recorded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [jobOrderId, jo.client_id, promisedDate, amount || null, note || null, actor.id]);
  await query(`INSERT INTO collection_activities(job_order_id, client_id, kind, note, actor_id) VALUES ($1,$2,'promise',$3,$4)`, [jobOrderId, jo.client_id, `Payment promised for ${promisedDate}${note ? `: ${note}` : ''}`, actor.id]);
  await audit(null, actor, 'payment_promise.recorded', 'job_order', jo.jo_number, { after: p });
  return p;
}

export async function addActivity(jobOrderId, { kind, note }, actor) {
  if (!note?.trim()) throw badRequest('Note required');
  const { rows: [jo] } = await query('SELECT * FROM job_orders WHERE id=$1', [jobOrderId]);
  if (!jo) throw notFound();
  const { rows: [a] } = await query(`INSERT INTO collection_activities(job_order_id, client_id, kind, note, actor_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [jobOrderId, jo.client_id, kind || 'note', note, actor.id]);
  await audit(null, actor, 'collection_activity.added', 'job_order', jo.jo_number, { after: { kind, note } });
  return a;
}

/** Validated client matching: an explicit alias created by a person, never a fuzzy guess. */
export async function addClientAlias(clientId, alias, actor) {
  const n = normName(alias);
  if (!n) throw badRequest('Alias required');
  const { rows: [ex] } = await query('SELECT * FROM client_aliases WHERE alias_normalized=$1', [n]);
  if (ex && ex.client_id !== Number(clientId)) throw badRequest(`This name is already linked to another client (id ${ex.client_id})`);
  await query('INSERT INTO client_aliases(alias_normalized, alias_display, client_id, created_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [n, alias, clientId, actor.id]);
  const { rows: candidates } = await query('SELECT id, jo_number, client_name_source FROM job_orders WHERE client_id IS NULL AND client_name_source IS NOT NULL');
  const ok = candidates.filter((r) => normName(r.client_name_source) === n);
  if (ok.length) await query('UPDATE job_orders SET client_id=$1 WHERE id = ANY($2)', [clientId, ok.map((o) => o.id)]);
  if (ok.length) {
    await query(`UPDATE invoices i SET client_id=$1 FROM invoice_job_orders ij WHERE ij.invoice_id=i.id AND ij.job_order_id = ANY($2) AND i.client_id IS NULL AND i.status='unreconciled'`, [clientId, ok.map((o) => o.id)]);
  }
  await audit(null, actor, 'client.alias_added', 'client', clientId, { after: { alias, linkedJobOrders: ok.map((o) => o.jo_number) } });
  return { linked: ok.map((o) => o.jo_number) };
}
