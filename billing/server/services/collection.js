import { query, tx, withAdvisoryLock } from '../db.js';
import { runSync } from './sync.js';
import { getSetting } from './settings.js';
import { jobOrderBalance } from './ledger.js';
import { generateSoa } from './soa.js';
import { composeDraft, cancelDraft } from './email.js';
import { audit, SYSTEM } from './audit.js';
import { raiseException } from './exceptions.js';
import { notifyRole } from './notify.js';
import { inVocab } from '../domain/sheetParse.js';
import { manilaDate, mondayOf } from '../lib/dates.js';
import { formatPHP } from '../lib/money.js';
import { getIntegrations } from '../google/index.js';
import { buildMime, toBase64Url } from '../lib/mime.js';

/**
 * Classify one job order for the weekly run. Pure aside from the inputs it is given.
 * Returns { outcome, detail, draft: bool, extraBlocked: [] }
 */
export function classifyJobOrder({ jo, sheetCfg, policy, balance, client, openDispute }) {
  if (!jo.source_present) return { outcome: 'excluded_not_present', detail: 'Not present in the source sheet' };
  if (jo.exception_state === 'cancelled' || inVocab(jo.production_status, sheetCfg.cancelledValues) || inVocab(jo.delivery_status, sheetCfg.cancelledValues) || inVocab(jo.payment_status_source, sheetCfg.cancelledValues)) {
    return { outcome: 'excluded_cancelled', detail: 'Cancelled' };
  }
  if (jo.is_paid_in_source) {
    if (balance.hasLedger && balance.outstanding > 0) {
      return { outcome: 'exception_paid_with_balance', detail: `Marked Paid in sheet; ledger outstanding ${formatPHP(balance.outstanding)}`, exception: true };
    }
    return { outcome: 'excluded_paid', detail: `Marked "${jo.payment_status_source}" in the Job Order List` };
  }
  const billed = !!jo.invoice_number_source || balance.hasLedger || balance.unreconciled.length > 0;
  if (!billed) return { outcome: 'excluded_unbilled', detail: 'No invoice yet (see Unbilled report)' };
  const held = ['disputed', 'on_hold'].includes(jo.exception_state) || openDispute ||
    inVocab(jo.payment_status_source, sheetCfg.disputedValues) || inVocab(jo.payment_status_source, sheetCfg.onHoldValues) ||
    inVocab(jo.production_status, sheetCfg.onHoldValues) || ['disputed', 'on_hold'].includes(client?.account_status);
  if (held) {
    if (policy.exceptionPolicy === 'blocked_draft') return { outcome: 'draft_blocked', draft: true, extraBlocked: ['Account is disputed/on hold — authorized review required before any reminder'] };
    return { outcome: 'flagged_exception_policy', detail: 'Disputed / on hold — flagged for authorized review', flag: true };
  }
  if (!policy.includeNotYetDue && balance.hasLedger && balance.overdue === 0 && balance.outstanding > 0) return { outcome: 'excluded_not_due', detail: 'Not yet due (policy)' };
  return { outcome: 'draft', draft: true, extraBlocked: [] };
}

export function currentRunKey(now = new Date()) {
  return mondayOf(manilaDate(now));
}

/**
 * The weekly collection run. Idempotent per run key (the Manila Monday): a retry resumes,
 * and no job order ever receives more than one draft in the same run.
 */
export async function runCollection({ trigger = 'scheduled', actor = SYSTEM, runKey = currentRunKey() } = {}) {
  const res = await withAdvisoryLock('collection-run', () => doRun({ trigger, actor, runKey }));
  if (!res.locked) return { status: 'skipped', reason: 'A collection run is already in progress' };
  return res.result;
}

async function doRun({ trigger, actor, runKey }) {
  const { rows: [existing] } = await query('SELECT * FROM collection_runs WHERE run_key=$1', [runKey]);
  if (existing?.status === 'succeeded') return { status: 'already_completed', runId: existing.id, runKey };
  let run;
  if (existing) {
    ({ rows: [run] } = await query(`UPDATE collection_runs SET status='running', attempts=attempts+1, error=NULL, finished_at=NULL WHERE id=$1 RETURNING *`, [existing.id]));
  } else {
    ({ rows: [run] } = await query(`INSERT INTO collection_runs(run_key, trigger, triggered_by) VALUES ($1,$2,$3) RETURNING *`, [runKey, trigger, actor.id ?? null]));
  }
  await audit(null, actor, 'collection_run.started', 'collection_run', runKey, { after: { trigger, attempt: run.attempts } });

  // Steps 1–2: synchronize and confirm. Never proceed on stale data.
  const sync = await runSync({ trigger: 'collection_run', actor });
  await query('UPDATE collection_runs SET sync_run_id=$2 WHERE id=$1', [run.id, sync.syncRunId ?? null]);
  if (sync.status !== 'succeeded') {
    const msg = `Synchronization ${sync.status}: ${sync.error || sync.reason}. No drafts were generated.`;
    await query(`UPDATE collection_runs SET status='failed', finished_at=now(), error=$2 WHERE id=$1`, [run.id, msg]);
    await audit(null, actor, 'collection_run.failed', 'collection_run', runKey, { after: { error: msg } });
    await notifyRole('sysadmin', 'collection_run_failed', `Monday collection run ${runKey} failed: ${msg}`, '/runs');
    return { status: 'failed', runId: run.id, runKey, error: msg };
  }

  const sheetCfg = await getSetting('sheet');
  const policy = await getSetting('policy');
  const { rows: jos } = await query(`SELECT * FROM job_orders WHERE NOT is_sample ORDER BY jo_number`);
  const { rows: done } = await query('SELECT job_order_id FROM collection_run_items WHERE run_id=$1', [run.id]);
  const doneSet = new Set(done.map((d) => d.job_order_id));
  const soaCache = new Map(); // clientId -> { soa } | { error }
  const { rows: priorSoas } = await query(
    `SELECT DISTINCT ON (d.client_id) d.client_id, s.id, s.statement_number, s.version, s.statement_date, s.status, s.pdf_sha256
       FROM email_drafts d JOIN soa_statements s ON s.id=d.soa_id WHERE d.collection_run_id=$1 ORDER BY d.client_id, s.id DESC`, [run.id]);
  for (const s of priorSoas) soaCache.set(s.client_id, { soa: s });
  let errors = 0;

  for (const jo of jos) {
    if (doneSet.has(jo.id)) continue;
    try {
      await processJobOrder({ jo, run, sheetCfg, policy, soaCache, actor });
    } catch (e) {
      errors++;
      await query(`INSERT INTO collection_run_items(run_id, job_order_id, outcome, detail) VALUES ($1,$2,'error',$3) ON CONFLICT DO NOTHING`, [run.id, jo.id, e.message]);
      await audit(null, actor, 'collection_run.item_error', 'job_order', jo.jo_number, { after: { error: e.message }, related: { runKey } });
    }
  }

  const { rows: statsRows } = await query('SELECT outcome, count(*)::int n FROM collection_run_items WHERE run_id=$1 GROUP BY outcome', [run.id]);
  const stats = Object.fromEntries(statsRows.map((r) => [r.outcome, r.n]));
  stats.reviewed = statsRows.reduce((s, r) => s + r.n, 0);
  const status = errors ? 'partial' : 'succeeded';
  await query(`UPDATE collection_runs SET status=$2, finished_at=now(), stats=$3, error=$4 WHERE id=$1`, [run.id, status, JSON.stringify(stats), errors ? `${errors} job order(s) failed; retry the run to resume` : null]);
  await audit(null, actor, `collection_run.${status}`, 'collection_run', runKey, { after: stats });

  const pending = (stats.draft_created || 0);
  const blocked = (stats.draft_blocked || 0);
  const msg = `Monday collection run ${runKey}: ${pending} draft(s) awaiting approval, ${blocked} blocked, ${stats.exception_paid_with_balance || 0} paid-with-balance exception(s), ${stats.flagged_exception_policy || 0} flagged for review.`;
  await notifyRole('approver', 'collection_run_completed', msg, '/approvals');
  await notifyRole('accounting', 'collection_run_completed', msg, '/runs');
  await emailReviewers(msg).catch(() => {});
  return { status, runId: run.id, runKey, stats };
}

async function processJobOrder({ jo, run, sheetCfg, policy, soaCache, actor }) {
  const balance = await jobOrderBalance(jo.id);
  const { rows: [client] } = jo.client_id ? await query('SELECT * FROM clients WHERE id=$1', [jo.client_id]) : { rows: [] };
  const { rows: [{ n: disputes }] } = await query(`SELECT count(*)::int n FROM disputes WHERE status='open' AND (job_order_id=$1 OR invoice_id IN (SELECT invoice_id FROM invoice_job_orders WHERE job_order_id=$1))`, [jo.id]);
  const c = classifyJobOrder({ jo, sheetCfg, policy, balance, client, openDispute: disputes > 0 });

  const record = (outcome, draftId, detail) => query(
    `INSERT INTO collection_run_items(run_id, job_order_id, outcome, draft_id, detail) VALUES ($1,$2,$3,$4,$5)`, [run.id, jo.id, outcome, draftId ?? null, detail ?? null]);

  // Earlier unsent drafts for a job order that is no longer collectible are withdrawn.
  if (['excluded_paid', 'exception_paid_with_balance', 'excluded_cancelled', 'excluded_not_present'].includes(c.outcome)) {
    const { rows: stale } = await query(`SELECT id FROM email_drafts WHERE $1 = ANY(covered_job_order_ids) AND status IN ('blocked','pending_approval','approved','returned','on_hold','send_failed')`, [jo.id]);
    for (const s of stale) await tx((db) => cancelDraft(db, s.id, `Job order ${jo.jo_number}: ${c.detail}`, actor));
  }
  if (c.exception) {
    await raiseException(null, { kind: 'paid_with_ledger_balance', key: jo.jo_number, jobOrderId: jo.id, clientId: jo.client_id, severity: 'critical',
      message: `JO ${jo.jo_number} is marked Paid in the Job Order List but the ledger shows ${formatPHP(balance.outstanding)} outstanding. Routine collection is suspended until resolved.` });
  }
  if (c.flag) {
    await raiseException(null, { kind: 'collection_review_required', key: jo.jo_number, jobOrderId: jo.id, clientId: jo.client_id,
      message: `JO ${jo.jo_number} is disputed or on hold. No routine reminder was drafted; authorized review required.` });
  }
  if (!c.draft) return record(c.outcome, null, c.detail);

  // Several job orders may share one invoice: one draft covers them all (the invoice is demanded once).
  const invIds = balance.invoices.map((l) => l.invoiceId).concat(balance.unreconciled.map((i) => i.id));
  if (invIds.length) {
    const { rows: [other] } = await query(
      `SELECT ri.draft_id FROM collection_run_items ri JOIN email_drafts d ON d.id=ri.draft_id
        JOIN invoice_job_orders ij ON ij.job_order_id = ANY(d.covered_job_order_ids)
       WHERE ri.run_id=$1 AND ij.invoice_id = ANY($2) LIMIT 1`, [run.id, invIds]);
    if (other) return record('covered_by_other', other.draft_id, 'Shares an invoice with another job order in this run');
  }
  const { rows: covered } = invIds.length
    ? await query(`SELECT DISTINCT j.* FROM job_orders j JOIN invoice_job_orders ij ON ij.job_order_id=j.id WHERE ij.invoice_id = ANY($1) AND NOT j.is_paid_in_source AND j.source_present ORDER BY j.jo_number`, [invIds])
    : { rows: [jo] };
  if (!covered.some((j) => j.id === jo.id)) covered.unshift(jo);

  if (!balance.hasLedger || balance.outstanding <= 0) {
    if (balance.hasLedger && balance.outstanding <= 0 && !balance.unreconciled.length) {
      await raiseException(null, { kind: 'ledger_settled_source_unpaid', key: jo.jo_number, jobOrderId: jo.id, clientId: jo.client_id,
        message: `JO ${jo.jo_number} is not marked Paid in the sheet, but the ledger shows no outstanding balance. Update the sheet or correct the ledger.` });
    }
  }

  let soaEntry = jo.client_id ? soaCache.get(jo.client_id) : { error: 'No client linked' };
  if (jo.client_id && !soaEntry) {
    try {
      soaEntry = { soa: await generateSoa({ clientId: jo.client_id, actor }) };
      soaEntry.soa.statement_date = manilaDate();
    } catch (e) {
      soaEntry = { error: e.message };
    }
    soaCache.set(jo.client_id, soaEntry);
  }
  const extra = [...(c.extraBlocked || [])];
  if (soaEntry?.error) extra.push(`SOA generation failed: ${soaEntry.error}`);

  const draft = await tx(async (db) => {
    // Supersede earlier unsent weekly drafts for the same job orders: only the latest figures may be sent.
    const { rows: prior } = await db.query(`SELECT id FROM email_drafts WHERE covered_job_order_ids && $1 AND collection_run_id IS DISTINCT FROM $2
      AND status IN ('blocked','pending_approval','approved','returned','on_hold','send_failed')`, [covered.map((j) => j.id), run.id]);
    for (const p of prior) await cancelDraft(db, p.id, `Superseded by weekly run ${run.run_key}`, actor);
    const d = await composeDraft(db, { jo, coveredJobOrders: covered, soa: soaEntry?.soa || null, runId: run.id, actor, extraBlocked: extra });
    await db.query(`INSERT INTO collection_run_items(run_id, job_order_id, outcome, draft_id) VALUES ($1,$2,$3,$4)`,
      [run.id, jo.id, d.status === 'blocked' ? 'draft_blocked' : 'draft_created', d.id]);
    return d;
  });
  return draft;
}

/** Internal notification email to configured reviewer addresses. Never a client-facing email. */
async function emailReviewers(text) {
  const policy = await getSetting('policy');
  if (!policy.reviewerNotifyEmails?.length) return;
  const { gmail } = await getIntegrations();
  if (!gmail) return;
  const raw = toBase64Url(buildMime({ from: gmail.account, to: policy.reviewerNotifyEmails, subject: '[PA Billing] Collection drafts awaiting approval', text: `${text}\n\nOpen the Pending Email Approvals queue to review.` }));
  await gmail.sendMessage(raw);
}

export async function listRuns() {
  const { rows } = await query('SELECT * FROM collection_runs ORDER BY run_key DESC LIMIT 60');
  return rows;
}
