import { query } from '../db.js';
import { allLedgers } from './ledger.js';
import { getSetting } from './settings.js';
import { syncStatus } from './sync.js';
import { computeTracking } from '../domain/stage.js';
import { computeLedger } from '../domain/ledger.js';
import { loadLedgerData } from './ledger.js';
import { toCents } from '../lib/money.js';
import { manilaDate, addDays, mondayOf, manilaDayStart, manilaDayEnd } from '../lib/dates.js';
import { currentRunKey } from './collection.js';
import { badRequest } from '../lib/errors.js';

const M = (key, label) => ({ key, label, money: true });
const C = (key, label) => ({ key, label });

/** Every job order with ledger balance + derived tracking, computed in bulk (each invoice counted once). */
export async function jobOrderOverview(asOf = manilaDate(), { includeSample = false } = {}) {
  const sheetCfg = await getSetting('sheet');
  const ledgers = await allLedgers(asOf);
  const lineByInvoice = new Map();
  for (const l of ledgers.values()) for (const line of l.invoices) lineByInvoice.set(line.invoiceId, line);
  const { rows: jos } = await query(`SELECT j.*, c.registered_name AS client_name, c.client_code FROM job_orders j LEFT JOIN clients c ON c.id=j.client_id
    WHERE ($1 OR NOT j.is_sample) ORDER BY j.jo_number`, [includeSample]);
  const { rows: links } = await query(`SELECT ij.job_order_id, i.id, i.invoice_number, i.status, i.amount, i.sent_confirmed_at FROM invoice_job_orders ij JOIN invoices i ON i.id=ij.invoice_id WHERE i.status<>'void'`);
  const byJo = new Map();
  for (const l of links) byJo.set(l.job_order_id, [...(byJo.get(l.job_order_id) || []), l]);
  return jos.map((jo) => {
    const invs = byJo.get(jo.id) || [];
    const lines = invs.map((i) => lineByInvoice.get(i.id)).filter(Boolean);
    const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
    const balance = {
      hasLedger: lines.length > 0, invoices: lines, unreconciled: invs.filter((i) => i.status === 'unreconciled'),
      original: sum('original'), paid: sum('paid'), credits: sum('credits'), outstanding: sum('outstanding'),
      overdue: lines.filter((l) => l.daysOverdue > 0).reduce((s, l) => s + Math.max(0, l.outstanding), 0),
      maxDaysOverdue: Math.max(0, ...lines.map((l) => l.daysOverdue)),
    };
    const invoiceSent = invs.some((i) => i.sent_confirmed_at);
    return { ...jo, invoices: invs, balance, tracking: computeTracking(jo, { balance, invoiceSent, sheetCfg, asOf }) };
  });
}

/** Unbilled / billing-control flags (section 8). Completed ≠ automatically billable. */
export async function unbilledReport(asOf = manilaDate()) {
  const all = (await jobOrderOverview(asOf)).filter((j) => j.source_present && j.tracking.exception !== 'Cancelled');
  const rows = [];
  const add = (j, flag, note) => rows.push({ jo: j.jo_number, client: j.client_name || j.client_name_source, project: j.project_name, deliveryDate: j.delivery_date,
    deliveryStatus: j.delivery_status, invoice: j.invoice_number_source, value: toCents(j.jo_amount_source ?? j.billing_amount_source), flag, note });
  const invoiceUse = new Map();
  for (const j of all) {
    const t = j.tracking;
    if (j.invoice_number_source) {
      const k = j.invoice_number_source.trim().toUpperCase();
      invoiceUse.set(k, [...(invoiceUse.get(k) || []), j]);
    }
    if (t.flags.delivered && !t.flags.billed) {
      if (j.billable_status === 'not_billable' || j.billable_status === 'not_yet_billable') continue;
      add(j, 'Delivered – missing invoice number', j.billing_terms_note || 'Confirm contract/billing terms');
    } else if (t.flags.completed && !t.flags.delivered && !t.flags.billed && j.billable_status !== 'not_billable') {
      add(j, 'Completed – may be billable under contract terms', j.billable_status === 'billable' ? 'Marked billable' : 'Review contract terms; not assumed billable');
    }
    if (t.flags.billed) {
      if (j.billing_amount_source == null) add(j, 'Missing billing amount');
      if (!j.billing_date_source) add(j, 'Missing invoice date');
      if (!j.due_date_source && !j.balance.invoices.some((l) => l.dueDate)) add(j, 'Missing due date');
      if (j.invoices.length && !j.invoices.some((i) => i.sent_confirmed_at) && !j.is_paid_in_source) add(j, 'Invoice not confirmed as sent');
      if (j.balance.unreconciled.length) add(j, 'Invoice awaiting ledger reconciliation');
    }
    if (!j.client_id) add(j, 'Client not linked to Client Master', `Sheet name: "${j.client_name_source || ''}"`);
  }
  for (const [inv, js] of invoiceUse) {
    if (new Set(js.map((x) => x.client_name_source)).size > 1) js.forEach((j) => add(j, 'Duplicate invoice number across clients', inv));
  }
  const { rows: conflicts } = await query(`SELECT e.*, j.jo_number FROM exceptions e LEFT JOIN job_orders j ON j.id=e.job_order_id WHERE e.status='open'
    AND e.kind IN ('paid_with_ledger_balance','ledger_settled_source_unpaid','invoice_source_mismatch','source_paid_amount_mismatch','invoice_client_mismatch')`);
  for (const c of conflicts) rows.push({ jo: c.jo_number, flag: 'Conflicting billing/payment information', note: c.message });
  const deliveredUnbilled = rows.filter((r) => r.flag.startsWith('Delivered'));
  return {
    title: 'Unbilled Project Control', asOf,
    summary: { deliveredAwaitingBilling: deliveredUnbilled.length, unbilledValue: deliveredUnbilled.reduce((s, r) => s + (r.value || 0), 0),
      unbilledWithoutValue: deliveredUnbilled.filter((r) => r.value == null).length, flags: rows.length },
    sections: [{ title: 'Billing control flags', columns: [C('jo', 'Job Order'), C('client', 'Client'), C('project', 'Project'), C('deliveryDate', 'Delivered'), C('invoice', 'Invoice'), M('value', 'Value'), C('flag', 'Flag'), C('note', 'Note')], rows }],
  };
}

export async function dashboard(asOf = manilaDate()) {
  const [overview, sync, unbilled] = await Promise.all([jobOrderOverview(asOf), syncStatus(), unbilledReport(asOf)]);
  const ledgers = await allLedgers(asOf);
  let billed = 0, overdue = 0, unapplied = 0;
  for (const l of ledgers.values()) { billed += l.totals.outstanding; overdue += l.totals.overdue; unapplied += l.totals.unapplied; }
  const { rows: [{ s: pendingRecon }] } = await query(`SELECT COALESCE(sum(amount),0) s FROM invoices WHERE status='unreconciled' AND NOT is_sample`);
  const monthStart = `${asOf.slice(0, 7)}-01`;
  const { rows: [{ s: collected }] } = await query(
    `SELECT COALESCE(sum(amount),0) s FROM payments WHERE status IN ('verified','reversed') AND payment_date BETWEEN $1 AND $2 AND verified_at <= $3 AND (reversed_at IS NULL OR reversed_at > $3) AND NOT is_sample`,
    [monthStart, asOf, manilaDayEnd(asOf)]);
  const runKey = currentRunKey();
  const { rows: [run] } = await query('SELECT * FROM collection_runs WHERE run_key=$1', [runKey]);
  const { rows: ds } = await query(`SELECT status, count(*)::int n FROM email_drafts GROUP BY status`);
  const dcount = Object.fromEntries(ds.map((r) => [r.status, r.n]));
  const { rows: [{ n: weekDrafts }] } = await query(`SELECT count(*)::int n FROM email_drafts WHERE collection_run_id=$1`, [run?.id ?? -1]);
  const { rows: [{ n: sentWeek }] } = await query(`SELECT count(*)::int n FROM email_drafts WHERE status='sent' AND sent_at >= $1`, [manilaDayStart(mondayOf(asOf))]);
  const { rows: [{ n: failed }] } = await query(`SELECT count(*)::int n FROM send_attempts WHERE status IN ('failed','unknown')`);
  const { rows: [{ n: recon }] } = await query(`SELECT count(DISTINCT COALESCE(client_id::text, job_order_id::text, dedupe_key))::int n FROM exceptions WHERE status='open'`);
  const live = overview.filter((j) => j.source_present);
  return {
    asOf, generatedAt: new Date().toISOString(), sync,
    kpis: {
      totalJobOrders: live.length,
      deliveredAwaitingBilling: unbilled.summary.deliveredAwaitingBilling,
      unbilledValue: unbilled.summary.unbilledValue, unbilledWithoutValue: unbilled.summary.unbilledWithoutValue,
      billedReceivables: billed, pendingReconciliation: toCents(pendingRecon), totalOutstanding: billed + toCents(pendingRecon),
      totalOverdue: overdue, unappliedCredits: unapplied,
      collectionsThisMonth: toCents(collected),
      partiallyPaid: live.filter((j) => j.tracking.flags.partiallyPaid).length,
      markedPaid: live.filter((j) => j.is_paid_in_source).length,
      mondayDraftsGenerated: weekDrafts, mondayRunKey: runKey, mondayRunStatus: run?.status || 'not_run',
      draftsAwaitingApproval: dcount.pending_approval || 0, draftsBlocked: dcount.blocked || 0,
      approvedAwaitingSend: (dcount.approved || 0) + (dcount.send_failed || 0),
      emailsSentThisWeek: sentWeek, emailsSentTotal: dcount.sent || 0,
      failedEmailAttempts: failed, accountsRequiringReconciliation: recon,
    },
    stageCounts: live.reduce((m, j) => ({ ...m, [j.tracking.stage]: (m[j.tracking.stage] || 0) + 1 }), {}),
  };
}

export async function dailyReport(asOf = manilaDate()) {
  const unbilled = await unbilledReport(asOf);
  const ledgers = await allLedgers(asOf);
  const { rows: clients } = await query('SELECT id, client_code, registered_name FROM clients');
  const cname = new Map(clients.map((c) => [c.id, c.registered_name]));
  const due = []; const overdueAccts = [];
  for (const [cid, l] of ledgers) {
    for (const i of l.invoices) if (i.outstanding > 0 && i.dueDate >= asOf && i.dueDate <= addDays(asOf, 7)) due.push({ client: cname.get(cid), invoice: i.invoiceNumber, due: i.dueDate, outstanding: i.outstanding });
    if (l.totals.overdue > 0) overdueAccts.push({ client: cname.get(cid), overdue: l.totals.overdue, d90: l.totals.d90_plus, outstanding: l.totals.outstanding });
  }
  overdueAccts.sort((a, b) => b.overdue - a.overdue);
  const { rows: claims } = await query(`SELECT p.*, c.registered_name FROM payments p JOIN clients c ON c.id=p.client_id WHERE p.status='claimed' ORDER BY p.payment_date`);
  const { rows: soas } = await query(`SELECT s.id, s.statement_number, s.version, s.statement_date, s.has_discrepancy, c.registered_name FROM soa_statements s JOIN clients c ON c.id=s.client_id WHERE s.status='pending_review' ORDER BY s.generated_at`);
  const { rows: drafts } = await query(`SELECT d.id, d.subject, d.status, d.amounts->>'outstanding' AS outstanding, j.jo_number FROM email_drafts d JOIN job_orders j ON j.id=d.job_order_id WHERE d.status IN ('pending_approval','blocked') ORDER BY d.id`);
  const missing = unbilled.sections[0].rows.filter((r) => /^Missing|not linked/.test(r.flag));
  return {
    title: 'Daily Billing & Collection Report', asOf,
    summary: { deliveredAwaitingBilling: unbilled.summary.deliveredAwaitingBilling, missingBillingDetails: missing.length, invoicesDueNext7Days: due.length,
      overdueAccounts: overdueAccts.length, paymentsAwaitingVerification: claims.length, soasAwaitingReview: soas.length, draftsAwaitingApproval: drafts.filter((d) => d.status === 'pending_approval').length },
    sections: [
      { title: 'Delivered jobs awaiting billing', columns: [C('jo', 'Job Order'), C('client', 'Client'), C('project', 'Project'), C('deliveryDate', 'Delivered'), M('value', 'Value'), C('note', 'Note')], rows: unbilled.sections[0].rows.filter((r) => r.flag.startsWith('Delivered')) },
      { title: 'Missing billing details', columns: [C('jo', 'Job Order'), C('client', 'Client'), C('flag', 'Issue'), C('note', 'Note')], rows: missing },
      { title: 'Invoices due in the next 7 days', columns: [C('client', 'Client'), C('invoice', 'Invoice'), C('due', 'Due'), M('outstanding', 'Outstanding')], rows: due },
      { title: 'Overdue accounts', columns: [C('client', 'Client'), M('overdue', 'Overdue'), M('d90', '>90 days'), M('outstanding', 'Total outstanding')], rows: overdueAccts },
      { title: 'Payments awaiting verification', columns: [C('registered_name', 'Client'), C('payment_date', 'Date'), M('amount', 'Amount'), C('reference_no', 'Reference')], rows: claims.map((p) => ({ ...p, amount: toCents(p.amount) })) },
      { title: 'SOAs awaiting review', columns: [C('registered_name', 'Client'), C('statement_number', 'Statement'), C('statement_date', 'Date'), C('has_discrepancy', 'Discrepancy')], rows: soas },
      { title: 'Email drafts awaiting approval / blocked', columns: [C('id', 'Draft'), C('jo_number', 'Job Order'), C('status', 'Status'), M('outstanding', 'Outstanding'), C('subject', 'Subject')], rows: drafts.map((d) => ({ ...d, outstanding: d.outstanding == null ? null : Number(d.outstanding) })) },
    ],
  };
}

export async function mondayReport(runKey = currentRunKey()) {
  const { rows: [run] } = await query('SELECT r.*, s.status AS sync_status, s.error AS sync_error FROM collection_runs r LEFT JOIN sync_runs s ON s.id=r.sync_run_id WHERE r.run_key=$1', [runKey]);
  if (!run) return { title: `Monday Collection Report ${runKey}`, asOf: runKey, summary: { status: 'not_run' }, sections: [] };
  const { rows: items } = await query(`SELECT ri.*, j.jo_number, j.client_name_source, d.status AS draft_status, d.amounts->>'outstanding' AS outstanding
    FROM collection_run_items ri JOIN job_orders j ON j.id=ri.job_order_id LEFT JOIN email_drafts d ON d.id=ri.draft_id WHERE ri.run_id=$1 ORDER BY j.jo_number`, [run.id]);
  const n = (f) => items.filter(f).length;
  const { rows: syncErr } = await query(`SELECT id, started_at, error FROM sync_runs WHERE status='failed' AND started_at >= $1 ORDER BY id`, [manilaDayStart(runKey)]);
  const { rows: exc } = await query(`SELECT kind, message, created_at FROM exceptions WHERE status='open' ORDER BY severity DESC, created_at`);
  const { rows: [{ n: sent }] } = await query(`SELECT count(*)::int n FROM email_drafts WHERE collection_run_id=$1 AND status='sent'`, [run.id]);
  const { rows: [{ n: approved }] } = await query(`SELECT count(*)::int n FROM email_drafts WHERE collection_run_id=$1 AND status IN ('approved','sending','sent','send_failed','send_unknown')`, [run.id]);
  return {
    title: `Monday Collection Report – ${runKey}`, asOf: runKey,
    summary: {
      status: run.status, attempts: run.attempts, startedAt: run.started_at, finishedAt: run.finished_at, syncStatus: run.sync_status,
      totalReviewed: items.length,
      unpaidEligible: n((i) => ['draft_created', 'draft_blocked', 'covered_by_other'].includes(i.outcome)),
      partiallyPaid: null, // filled below
      paidExcluded: n((i) => i.outcome === 'excluded_paid'),
      draftsGenerated: n((i) => ['draft_created', 'draft_blocked'].includes(i.outcome)),
      draftsAwaitingApproval: n((i) => i.draft_status === 'pending_approval'),
      draftsBlocked: n((i) => i.draft_status === 'blocked'),
      emailsApproved: approved, emailsSent: sent,
      onHoldOrDisputed: n((i) => i.outcome === 'flagged_exception_policy'),
      paidWithBalanceExceptions: n((i) => i.outcome === 'exception_paid_with_balance'),
      syncErrors: syncErr.length, reconciliationExceptions: exc.length, errors: n((i) => i.outcome === 'error'),
    },
    sections: [
      { title: 'Job orders reviewed', columns: [C('jo_number', 'Job Order'), C('client_name_source', 'Client'), C('outcome', 'Outcome'), C('draft_id', 'Draft'), C('draft_status', 'Draft status'), M('outstanding', 'Outstanding'), C('detail', 'Detail')],
        rows: items.map((i) => ({ ...i, outstanding: i.outstanding == null ? null : Number(i.outstanding) })) },
      { title: 'Synchronization errors', columns: [C('id', 'Sync'), C('started_at', 'At'), C('error', 'Error')], rows: syncErr },
      { title: 'Open reconciliation exceptions', columns: [C('kind', 'Kind'), C('message', 'Message'), C('created_at', 'Since')], rows: exc },
    ],
  };
}

function sumLedgers(ledgers) {
  const t = { outstanding: 0, overdue: 0, notYetDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, unapplied: 0 };
  for (const l of ledgers.values()) for (const k of Object.keys(t)) t[k] += l.totals[k];
  return t;
}

/** Roll-forward with a built-in reconciliation check: opening + billings + debits − allocations − credits = closing. */
async function rollForward(from, to) {
  const data = await loadLedgerData(null, null);
  const live = { ...data, invoices: data.invoices.filter((i) => !i.is_sample) };
  const opening = computeLedger(live, addDays(from, -1), 'restated');
  const closing = computeLedger(live, to, 'restated');
  const sumOut = (l) => l.invoices.reduce((s, i) => s + i.outstanding, 0);
  const issued = live.invoices.filter((i) => i.status === 'issued' && i.invoice_date >= from && i.invoice_date <= to);
  const newBillings = issued.reduce((s, i) => s + toCents(i.amount), 0);
  const invIds = new Set(live.invoices.filter((i) => i.status === 'issued').map((i) => i.id));
  const inPeriod = (d) => d >= from && d <= to;
  const okAdj = data.adjustments.filter((a) => invIds.has(a.invoice_id) && a.status === 'approved' && inPeriod(a.effective_date));
  const debits = okAdj.filter((a) => a.kind === 'debit').reduce((s, a) => s + toCents(a.amount), 0);
  const credits = okAdj.filter((a) => a.kind === 'credit_note').reduce((s, a) => s + toCents(a.amount), 0);
  const pay = new Map(data.payments.map((p) => [p.id, p]));
  const allocs = data.allocations.filter((a) => invIds.has(a.invoice_id) && a.status === 'active' && pay.get(a.payment_id)?.status === 'verified' && inPeriod(a.effective_date));
  const applied = allocs.reduce((s, a) => s + toCents(a.amount), 0);
  const collections = data.payments.filter((p) => p.status === 'verified' && !p.is_sample && inPeriod(p.payment_date)).reduce((s, p) => s + toCents(p.amount), 0);
  const openingAmt = sumOut(opening);
  const closingAmt = sumOut(closing);
  const expected = openingAmt + newBillings + debits - applied - credits;
  return { opening: openingAmt, newBillings, debits, credits, collectionsReceived: collections, collectionsApplied: applied, closing: closingAmt,
    reconciles: expected === closingAmt, unexplained: closingAmt - expected, closingLedger: closing };
}

export async function weeklyReport(weekStart = mondayOf(manilaDate())) {
  const weekEnd = addDays(weekStart, 6);
  const asOf = weekEnd < manilaDate() ? weekEnd : manilaDate();
  const rf = await rollForward(weekStart, asOf);
  const ledgers = await allLedgers(asOf);
  const aging = sumLedgers(ledgers);
  const unbilled = await unbilledReport(asOf);
  const { rows: clients } = await query('SELECT id, registered_name FROM clients');
  const cname = new Map(clients.map((c) => [c.id, c.registered_name]));
  const top = [...ledgers].filter(([, l]) => l.totals.overdue > 0).map(([cid, l]) => ({ client: cname.get(cid), overdue: l.totals.overdue, d90: l.totals.d90_plus })).sort((a, b) => b.overdue - a.overdue).slice(0, 10);
  const { rows: [{ n: followups }] } = await query(`SELECT count(*)::int n FROM email_drafts WHERE status='sent' AND sent_at BETWEEN $1 AND $2`, [manilaDayStart(weekStart), manilaDayEnd(weekEnd)]);
  const { rows: [{ n: pending }] } = await query(`SELECT count(*)::int n FROM email_drafts WHERE status IN ('pending_approval','approved')`);
  const { rows: promises } = await query(`SELECT p.promised_date, p.amount, p.note, c.registered_name, j.jo_number FROM payment_promises p JOIN clients c ON c.id=p.client_id LEFT JOIN job_orders j ON j.id=p.job_order_id WHERE p.promised_date >= $1 ORDER BY p.promised_date`, [weekStart]);
  const { rows: intervention } = await query(`SELECT e.kind, e.message, e.severity FROM exceptions e WHERE e.status='open' AND e.severity='critical'`);
  const longOverdue = [...ledgers].filter(([, l]) => l.totals.d90_plus > 0).map(([cid, l]) => ({ kind: 'over_90_days', message: `${cname.get(cid)}: ${l.totals.d90_plus / 100} PHP more than 90 days overdue`, severity: 'warning' }));
  const checks = rf.reconciles ? [] : [{ check: 'Receivables roll-forward', unexplainedCentavos: rf.unexplained }];
  return {
    title: `Weekly Management Report – week of ${weekStart}`, asOf, checks,
    summary: { openingReceivables: rf.opening, newBillings: rf.newBillings, collectionsReceived: rf.collectionsReceived, collectionsApplied: rf.collectionsApplied,
      approvedAdjustments: rf.debits - rf.credits, closingReceivables: rf.closing, rollForwardReconciles: rf.reconciles,
      unbilledDeliveredValue: unbilled.summary.unbilledValue, followUpsCompleted: followups, pendingApprovals: pending },
    sections: [
      { title: 'Overdue balances by aging category', columns: [M('notYetDue', 'Not yet due'), M('d1_30', '1–30'), M('d31_60', '31–60'), M('d61_90', '61–90'), M('d90_plus', '>90'), M('overdue', 'Total overdue')], rows: [aging] },
      { title: 'Top overdue clients', columns: [C('client', 'Client'), M('overdue', 'Overdue'), M('d90', '>90 days')], rows: top },
      { title: 'Promised payments', columns: [C('registered_name', 'Client'), C('jo_number', 'Job Order'), C('promised_date', 'Promised'), M('amount', 'Amount'), C('note', 'Note')], rows: promises.map((p) => ({ ...p, amount: toCents(p.amount) })) },
      { title: 'Accounts requiring management intervention', columns: [C('kind', 'Kind'), C('severity', 'Severity'), C('message', 'Detail')], rows: [...intervention, ...longOverdue] },
    ],
  };
}

export async function monthlyReport(month = manilaDate().slice(0, 7)) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('month must be YYYY-MM');
  const from = `${month}-01`;
  const next = new Date(`${from}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const to0 = addDays(next.toISOString().slice(0, 10), -1);
  const to = to0 < manilaDate() ? to0 : manilaDate();
  const rf = await rollForward(from, to);
  const ledgers = await allLedgers(to);
  const aging = sumLedgers(ledgers);
  const { rows: clients } = await query('SELECT id, registered_name FROM clients');
  const cname = new Map(clients.map((c) => [c.id, c.registered_name]));
  const overview = (await jobOrderOverview(to)).filter((j) => j.source_present);
  const joRecon = overview.filter((j) => j.invoice_number_source || j.invoices.length).map((j) => ({
    jo: j.jo_number, sheetInvoice: j.invoice_number_source, sheetAmount: toCents(j.billing_amount_source),
    ledgerInvoices: j.invoices.map((i) => `${i.invoice_number} (${i.status})`).join(', '),
    ledgerAmount: j.balance.hasLedger ? j.balance.original : null, sheetStatus: j.payment_status_source,
    ledgerOutstanding: j.balance.hasLedger ? j.balance.outstanding : null,
    status: !j.invoices.length ? 'Not in ledger' : j.balance.unreconciled.length ? 'Pending reconciliation'
      : (j.is_paid_in_source && j.balance.outstanding > 0) ? 'Paid in sheet, balance in ledger' : 'OK',
  }));
  const balances = [...ledgers].filter(([, l]) => l.totals.outstanding > 0).map(([cid, l]) => ({ client: cname.get(cid), ...l.totals })).sort((a, b) => b.outstanding - a.outstanding);
  const { rows: staff } = await query(`SELECT actor_label, action, count(*)::int n FROM audit_log WHERE actor_type='user' AND at BETWEEN $1 AND $2
    AND (action LIKE 'email_%' OR action LIKE 'payment.%' OR action LIKE 'soa.%' OR action LIKE 'invoice.%' OR action LIKE 'collection%') GROUP BY 1,2 ORDER BY 1,2`, [manilaDayStart(from), manilaDayEnd(to)]);
  const denom = rf.opening + rf.newBillings;
  return {
    title: `Monthly Report – ${month}`, asOf: to, checks: rf.reconciles ? [] : [{ check: 'Receivables roll-forward', unexplainedCentavos: rf.unexplained }],
    summary: { openingReceivables: rf.opening, billings: rf.newBillings, collectionsReceived: rf.collectionsReceived, collectionsApplied: rf.collectionsApplied,
      creditNotes: rf.credits, debitAdjustments: rf.debits, closingReceivables: rf.closing, rollForwardReconciles: rf.reconciles,
      collectionEfficiencyPct: denom > 0 ? Math.round((rf.collectionsApplied / denom) * 1000) / 10 : null, longOverdue: aging.d90_plus },
    sections: [
      { title: 'Job Order-to-invoice reconciliation', columns: [C('jo', 'Job Order'), C('sheetInvoice', 'Sheet invoice'), M('sheetAmount', 'Sheet amount'), C('ledgerInvoices', 'Ledger invoice'), M('ledgerAmount', 'Ledger amount'), C('sheetStatus', 'Sheet status'), M('ledgerOutstanding', 'Ledger outstanding'), C('status', 'Result')], rows: joRecon },
      { title: 'Accounts receivable aging', columns: [M('notYetDue', 'Not yet due'), M('d1_30', '1–30'), M('d31_60', '31–60'), M('d61_90', '61–90'), M('d90_plus', '>90'), M('outstanding', 'Total')], rows: [aging] },
      { title: 'Outstanding client balances', columns: [C('client', 'Client'), M('outstanding', 'Outstanding'), M('overdue', 'Overdue'), M('d90_plus', '>90 days'), M('unapplied', 'Unapplied')], rows: balances },
      { title: 'Long-overdue accounts (>90 days)', columns: [C('client', 'Client'), M('d90_plus', '>90 days')], rows: balances.filter((b) => b.d90_plus > 0) },
      { title: 'Collection staff activity', columns: [C('actor_label', 'User'), C('action', 'Action'), C('n', 'Count')], rows: staff },
    ],
  };
}

export async function snapshot(kind, periodKey, data) {
  await query(`INSERT INTO report_snapshots(kind, period_key, data) VALUES ($1,$2,$3) ON CONFLICT (kind, period_key) DO UPDATE SET data=EXCLUDED.data, generated_at=now()`, [kind, periodKey, JSON.stringify(data)]);
}
