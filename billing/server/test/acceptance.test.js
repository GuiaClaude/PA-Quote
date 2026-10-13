// Acceptance tests 1–20 (section 24). Real PostgreSQL + in-memory Google fakes. All data is TEST data.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, row, HEADERS, makeClient, query, closePool } from './helpers.js';

const { runSync, proposeWriteback, applyWriteback } = await import('../services/sync.js');
const ledger = await import('../services/ledger.js');
const { generateSoa, reviewSoa } = await import('../services/soa.js');
const email = await import('../services/email.js');
const { runCollection } = await import('../services/collection.js');
const reports = await import('../services/reports.js');
const { manilaDate, addDays } = await import('../lib/dates.js');
const { nextMondayRun } = await import('../scheduler.js');

after(closePool);

const today = manilaDate();
const D = (n) => addDays(today, n);
const WEEK1 = '2026-10-05';
const WEEK2 = '2026-10-12';
const WEEK3 = '2026-10-19';

const baseRow = (over = {}) => row({
  'JO No.': 'JO-1001', Client: 'TEST Client Alpha Inc', Project: 'TEST brochures', 'Delivery Status': 'Delivered', 'Date Delivered': D(-45),
  'Invoice #': 'INV-001', 'Invoice Date': D(-40), 'Amount Billed': 10000, 'Due Date': D(-10), 'Amount Paid': '', 'Payment Status': 'Unpaid', Remarks: '', ...over,
});

/** A billed, reconciled, unpaid job order. */
async function billedScenario(extraRows = []) {
  const ctx = await setup({ values: [HEADERS, baseRow(), ...extraRows] });
  ctx.client = await makeClient();
  const s = await runSync({ trigger: 'test' });
  assert.equal(s.status, 'succeeded', s.error);
  const { rows: invs } = await query(`SELECT * FROM invoices ORDER BY id`);
  for (const i of invs) {
    await ledger.reconcileInvoice(i.id, {}, ctx.users.staff);
    await ledger.confirmInvoiceSent(i.id, ctx.users.staff);
  }
  ctx.jo = (await query(`SELECT * FROM job_orders WHERE jo_number='JO-1001'`)).rows[0];
  ctx.invoice = (await query(`SELECT * FROM invoices WHERE invoice_number='INV-001'`)).rows[0];
  return ctx;
}

async function pay(ctx, amount, { verify = true, allocateTo = ctx.invoice.id, date = D(-1) } = {}) {
  const p = await ledger.recordPayment({ clientId: ctx.client.id, paymentDate: date, amount, method: 'TEST', referenceNo: `TEST-REF-${Math.random()}` }, ctx.users.staff);
  if (verify) await ledger.verifyPayment(p.id, ctx.users.staff2);
  if (verify && allocateTo) await ledger.allocatePayment({ paymentId: p.id, invoiceId: allocateTo, amount }, ctx.users.staff);
  return p;
}

/** Run a week, review its SOA, approve its draft. Returns the draft. */
async function runAndApprove(ctx, runKey) {
  const r = await runCollection({ trigger: 'test', runKey });
  assert.equal(r.status, 'succeeded', JSON.stringify(r));
  const { rows: [d] } = await query(`SELECT d.* FROM email_drafts d JOIN collection_runs r ON r.id=d.collection_run_id WHERE r.run_key=$1 AND $2 = ANY(d.covered_job_order_ids)`, [runKey, ctx.jo.id]);
  assert.ok(d, 'draft created');
  assert.equal(d.status, 'pending_approval', d.blocked_reasons.join('; '));
  await reviewSoa(d.soa_id, { approve: true }, ctx.users.approver);
  await email.decideDraft(d.id, { decision: 'approve' }, ctx.users.approver);
  return d;
}

const auditCount = async (action) => Number((await query('SELECT count(*) n FROM audit_log WHERE action=$1', [action])).rows[0].n);

test('1. new Job Order Number in the sheet appears once (no duplicates on re-sync)', async () => {
  const ctx = await setup({ values: [HEADERS, baseRow()] });
  assert.equal((await runSync()).inserted, 1);
  ctx.sheets.values.push(baseRow({ 'JO No.': 'JO-1002', 'Invoice #': '' }));
  ctx.sheets.values.splice(1, 0, ['', '', '', '', '', '', '', '', '', '', '', '']); // inserted blank row shifts positions
  const s2 = await runSync();
  assert.equal(s2.inserted, 1);
  assert.equal(s2.unchanged, 1);
  const s3 = await runSync();
  assert.equal(s3.inserted, 0);
  const { rows } = await query('SELECT jo_number, source_row_number FROM job_orders ORDER BY jo_number');
  assert.deepEqual(rows.map((r) => r.jo_number), ['JO-1001', 'JO-1002']);
  assert.equal(rows[0].source_row_number, 3); // moved row tracked by JO number, not position
});

test('2. a row updated by staff is synchronized, with an audited diff', async () => {
  const ctx = await setup({ values: [HEADERS, baseRow()] });
  await runSync();
  ctx.sheets.values[1][HEADERS.indexOf('Payment Status')] = 'Partial';
  ctx.sheets.values[1][HEADERS.indexOf('Remarks')] = 'TEST follow up';
  const s = await runSync();
  assert.equal(s.updated, 1);
  const { rows: [jo] } = await query(`SELECT * FROM job_orders WHERE jo_number='JO-1001'`);
  assert.equal(jo.payment_status_source, 'Partial');
  assert.equal(jo.remarks_source, 'TEST follow up');
  const { rows: [a] } = await query(`SELECT * FROM audit_log WHERE action='job_order.source_changed'`);
  assert.equal(a.before.payment_status, 'Unpaid');
  assert.equal(a.after.payment_status, 'Partial');
  // duplicate JO numbers and missing ids are flagged, not imported
  ctx.sheets.values.push(baseRow({ Remarks: 'dup' }), baseRow({ 'JO No.': '' }));
  await runSync();
  const { rows: ex } = await query(`SELECT kind FROM exceptions WHERE status='open' ORDER BY kind`);
  assert.deepEqual(ex.map((e) => e.kind).filter((k) => ['duplicate_jo_in_source', 'missing_jo_number'].includes(k)), ['duplicate_jo_in_source', 'missing_jo_number']);
  assert.equal((await query('SELECT count(*)::int n FROM job_orders')).rows[0].n, 1);
});

test('3. delivered billable project with no invoice is flagged', async () => {
  const ctx = await setup({ values: [HEADERS, baseRow({ 'Invoice #': '', 'Invoice Date': '', 'Amount Billed': '', 'Due Date': '' }),
    baseRow({ 'JO No.': 'JO-1002', 'Delivery Status': 'In Production', 'Date Delivered': '', 'Invoice #': '', 'Amount Billed': '' })] });
  await makeClient();
  await runSync();
  const r = await reports.unbilledReport();
  const flags = r.sections[0].rows.filter((x) => x.jo === 'JO-1001').map((x) => x.flag);
  assert.ok(flags.includes('Delivered – missing invoice number'));
  assert.ok(!r.sections[0].rows.some((x) => x.jo === 'JO-1002' && x.flag.startsWith('Delivered')));
  const dash = await reports.dashboard();
  assert.equal(dash.kpis.deliveredAwaitingBilling, 1);
  // Not billable per contract → not flagged
  const { rows: [jo] } = await query(`SELECT id FROM job_orders WHERE jo_number='JO-1001'`);
  const jobOrders = await import('../services/jobOrders.js');
  await jobOrders.updateJobOrder(jo.id, { billable_status: 'not_yet_billable' }, ctx.users.staff, 'TEST milestone billing');
  assert.equal((await reports.unbilledReport()).summary.deliveredAwaitingBilling, 0);
});

test('4. billing write-back changes only the target cell, detects conflicts and formulas', async () => {
  const ctx = await setup({ values: [HEADERS, baseRow({ 'Invoice #': '', 'Amount Billed': '' }), baseRow({ 'JO No.': 'JO-1002', 'Invoice #': 'INV-XYZ' })] });
  await runSync();
  const { rows: [jo] } = await query(`SELECT * FROM job_orders WHERE jo_number='JO-1001'`);
  const before = JSON.parse(JSON.stringify(ctx.sheets.values));
  ctx.sheets.values.splice(1, 0, ctx.sheets.values.splice(2, 1)[0]); // staff re-sorted the sheet
  const wb = await proposeWriteback({ jobOrderId: jo.id, field: 'invoice_number', newValue: 'INV-NEW-1', reason: 'TEST invoice issued' }, ctx.users.staff);
  await assert.rejects(applyWriteback(wb.id, ctx.users.staff), /own/);
  const r = await applyWriteback(wb.id, ctx.users.approver);
  assert.equal(r.applied, true);
  assert.equal(ctx.sheets.writes.length, 1);
  assert.equal(ctx.sheets.writes[0].a1, 'F3'); // located by JO number after re-sort
  const after = ctx.sheets.values;
  const flat = (v) => v.flat().map(String);
  const diffs = flat(after).filter((x, i) => x !== flat([before[0], before[2], before[1]])[i]);
  assert.deepEqual(diffs, ['INV-NEW-1']);
  // Concurrent staff edit → conflict, nothing written
  await runSync();
  const wb2 = await proposeWriteback({ jobOrderId: jo.id, field: 'due_date', newValue: D(20), reason: 'TEST' }, ctx.users.staff);
  ctx.sheets.values[2][HEADERS.indexOf('Due Date')] = D(25);
  await assert.rejects(applyWriteback(wb2.id, ctx.users.approver), /Concurrent edit/);
  assert.equal(ctx.sheets.writes.length, 1);
  // Formula cell is never overwritten
  await runSync();
  const wb3 = await proposeWriteback({ jobOrderId: jo.id, field: 'billing_amount', newValue: '5000', reason: 'TEST' }, ctx.users.staff);
  ctx.sheets.formulas.set('H3', '=SUM(X1:X2)');
  await assert.rejects(applyWriteback(wb3.id, ctx.users.approver), /formula/);
  // Non-enabled field is refused
  await assert.rejects(proposeWriteback({ jobOrderId: jo.id, field: 'remarks', newValue: 'x', reason: 'r' }, ctx.users.staff), /not enabled/);
});

test('5. an invoice appearing on several rows is counted once', async () => {
  const ctx = await billedScenario([baseRow({ 'JO No.': 'JO-1002', Project: 'TEST flyers' })]); // same INV-001, same full amount
  const { rows: invs } = await query(`SELECT * FROM invoices`);
  assert.equal(invs.length, 1);
  assert.equal(invs[0].amount, '10000.00');
  const l = await ledger.clientLedger(ctx.client.id);
  assert.equal(l.totals.outstanding, 1000000);
  const dash = await reports.dashboard();
  assert.equal(dash.kpis.billedReceivables, 1000000);
  const r = await runCollection({ runKey: WEEK1 });
  assert.equal(r.stats.draft_created, 1);
  assert.equal(r.stats.covered_by_other, 1);
  const { rows: [d] } = await query('SELECT * FROM email_drafts');
  assert.equal(d.covered_job_order_ids.length, 2);
  assert.equal(d.amounts.outstanding, 1000000);
});

test('6. partial payments produce correct outstanding balances', async () => {
  const ctx = await billedScenario();
  await pay(ctx, '4000.00');
  let b = await ledger.jobOrderBalance(ctx.jo.id);
  assert.equal(b.outstanding, 600000);
  await pay(ctx, '2500.50');
  b = await ledger.jobOrderBalance(ctx.jo.id);
  assert.equal(b.outstanding, 349950);
  assert.equal(b.paid, 650050);
  // Over-allocation is refused
  const p = await pay(ctx, '5000.00', { allocateTo: null });
  await assert.rejects(ledger.allocatePayment({ paymentId: p.id, invoiceId: ctx.invoice.id, amount: '5000.00' }, ctx.users.staff), /outstanding/);
  assert.equal((await ledger.clientLedger(ctx.client.id)).totals.unapplied, 500000);
});

test('7. unverified payment claims are not confirmed collections', async () => {
  const ctx = await billedScenario();
  const p = await pay(ctx, '10000.00', { verify: false });
  await assert.rejects(ledger.allocatePayment({ paymentId: p.id, invoiceId: ctx.invoice.id, amount: '10000.00' }, ctx.users.staff), /verified/);
  await assert.rejects(ledger.verifyPayment(p.id, ctx.users.staff), /recorded/); // maker-checker
  const b = await ledger.jobOrderBalance(ctx.jo.id);
  assert.equal(b.outstanding, 1000000);
  const dash = await reports.dashboard();
  assert.equal(dash.kpis.collectionsThisMonth, 0);
  const l = await ledger.clientLedger(ctx.client.id);
  assert.equal(l.totals.unverifiedClaims, 1000000);
  assert.equal(l.totals.outstanding, 1000000);
});

test('8. the SOA reconciles with the invoice and payment ledger', async () => {
  const ctx = await billedScenario([baseRow({ 'JO No.': 'JO-1002', 'Invoice #': 'INV-002', 'Amount Billed': '3,500.25', 'Invoice Date': D(-5), 'Due Date': D(25) })]);
  await pay(ctx, '1000.00');
  const soa = await generateSoa({ clientId: ctx.client.id, actor: ctx.users.staff });
  const { rows: [s] } = await query('SELECT * FROM soa_statements WHERE id=$1', [soa.id]);
  const l = await ledger.clientLedger(ctx.client.id);
  assert.equal(s.totals.outstanding, l.totals.outstanding);
  assert.equal(s.totals.outstanding, 900000 + 350025);
  assert.equal(s.lines.reduce((a, x) => a + x.outstanding, 0), s.totals.outstanding);
  assert.equal(s.totals.overdue + s.totals.notYetDue, s.totals.outstanding);
  assert.equal(s.totals.d1_30 + s.totals.d31_60 + s.totals.d61_90 + s.totals.d90_plus, s.totals.overdue);
  assert.deepEqual(s.included_refs.invoices.map((i) => i.number).sort(), ['INV-001', 'INV-002']);
  assert.ok(s.pdf.subarray(0, 5).toString() === '%PDF-');
  await assert.rejects(reviewSoa(soa.id, { approve: true }, ctx.users.staff), /generated/);
  const r = await reviewSoa(soa.id, { approve: true }, ctx.users.approver);
  assert.equal(r.status, 'reviewed');
  assert.equal(ctx.drive.files.length, 1);
  assert.match(ctx.drive.files[0].name, /^SOA-TST1-/);
  // fully paid invoices are excluded from the outstanding SOA but present in full history
  await pay(ctx, '9000.00');
  const s2 = (await query('SELECT lines FROM soa_statements WHERE id=$1', [(await generateSoa({ clientId: ctx.client.id })).id])).rows[0];
  assert.deepEqual(s2.lines.map((x) => x.invoiceNumber), ['INV-002']);
  const s3 = (await query('SELECT lines FROM soa_statements WHERE id=$1', [(await generateSoa({ clientId: ctx.client.id, mode: 'full_history' })).id])).rows[0];
  assert.deepEqual(s3.lines.map((x) => x.invoiceNumber), ['INV-001', 'INV-002']);
});

test('9. historical SOAs reproduce the account as of the selected date', async () => {
  const ctx = await billedScenario();
  // Payment dated 5 days ago but only verified today.
  await pay(ctx, '4000.00', { date: D(-5) });
  const past = D(-3);
  const a = await generateSoa({ clientId: ctx.client.id, statementDate: past, basis: 'as_known' });
  const b = await generateSoa({ clientId: ctx.client.id, statementDate: past, basis: 'restated' });
  const tot = async (id) => (await query('SELECT totals, content_hash FROM soa_statements WHERE id=$1', [id])).rows[0];
  assert.equal((await tot(a.id)).totals.outstanding, 1000000); // as the books stood: not yet verified
  assert.equal((await tot(b.id)).totals.outstanding, 600000);  // restated with today's knowledge
  const a2 = await generateSoa({ clientId: ctx.client.id, statementDate: past, basis: 'as_known' });
  assert.equal((await tot(a2.id)).content_hash, (await tot(a.id)).content_hash); // reproducible
  assert.equal((await tot((await generateSoa({ clientId: ctx.client.id, statementDate: D(-41) })).id)).totals.outstanding, 0); // before invoice date
});

test('10. the Monday scheduler fires at 08:00 Asia/Manila', () => {
  const next = nextMondayRun(new Date('2026-10-13T10:00:00Z'));
  assert.equal(next.toISOString(), '2026-10-19T00:00:00.000Z');
  assert.equal(new Date(next.getTime() + 8 * 3600e3).toISOString().slice(11, 16), '08:00');
});

test('11. no more than one scheduled draft per eligible project per weekly run', async () => {
  const ctx = await billedScenario([baseRow({ 'JO No.': 'JO-1002', 'Invoice #': 'INV-002' })]);
  const r1 = await runCollection({ runKey: WEEK1 });
  assert.equal(r1.stats.draft_created, 2);
  const r2 = await runCollection({ runKey: WEEK1 });
  assert.equal(r2.status, 'already_completed');
  // Simulate an interrupted run being retried
  await query(`UPDATE collection_runs SET status='partial' WHERE run_key=$1`, [WEEK1]);
  await query(`DELETE FROM collection_run_items WHERE job_order_id=(SELECT id FROM job_orders WHERE jo_number='JO-1002') AND run_id=(SELECT id FROM collection_runs WHERE run_key=$1)`, [WEEK1]);
  await query(`UPDATE email_drafts SET status='cancelled' WHERE job_order_id=(SELECT id FROM job_orders WHERE jo_number='JO-1002')`);
  const r3 = await runCollection({ runKey: WEEK1 });
  assert.equal(r3.status, 'succeeded');
  const { rows } = await query(`SELECT job_order_id, count(*)::int n FROM email_drafts WHERE status<>'cancelled' GROUP BY 1`);
  assert.ok(rows.every((x) => x.n === 1));
  const { rows: [{ n }] } = await query('SELECT count(*)::int n FROM collection_run_items');
  assert.equal(n, 2);
  assert.equal(ctx.gmail.sent.length, 0); // the run never sends
});

test('12. a project stays eligible every week after reminders and partial payments', async () => {
  const ctx = await billedScenario();
  const d1 = await runAndApprove(ctx, WEEK1);
  assert.equal((await email.sendDraft(d1.id, ctx.users.sender)).status, 'sent');
  await pay(ctx, '4000.00');
  await query(`INSERT INTO payment_promises(job_order_id, client_id, promised_date, note) VALUES ($1,$2,$3,'TEST promise')`, [ctx.jo.id, ctx.client.id, D(7)]);
  const r2 = await runCollection({ runKey: WEEK2 });
  assert.equal(r2.stats.draft_created, 1);
  const { rows: [d2] } = await query(`SELECT * FROM email_drafts WHERE collection_run_id=(SELECT id FROM collection_runs WHERE run_key=$1)`, [WEEK2]);
  assert.equal(d2.amounts.outstanding, 600000);
  assert.match(d2.body_text, /PHP 6,000\.00/);
  assert.match(d2.body_text, /scheduled for/);
  const r3 = await runCollection({ runKey: WEEK3 });
  assert.equal(r3.stats.draft_created, 1);
  // Week-2 draft was superseded (only latest figures may be sent)
  assert.equal((await query('SELECT status FROM email_drafts WHERE id=$1', [d2.id])).rows[0].status, 'cancelled');
});

test('13. a project marked Paid is excluded after successful synchronization', async () => {
  const ctx = await billedScenario();
  await runCollection({ runKey: WEEK1 });
  await pay(ctx, '10000.00');
  ctx.sheets.values[1][HEADERS.indexOf('Payment Status')] = 'Paid';
  const r = await runCollection({ runKey: WEEK2 });
  assert.equal(r.stats.excluded_paid, 1);
  assert.equal(r.stats.draft_created, undefined);
  const { rows: [w1] } = await query(`SELECT status FROM email_drafts WHERE collection_run_id=(SELECT id FROM collection_runs WHERE run_key=$1)`, [WEEK1]);
  assert.equal(w1.status, 'cancelled'); // stale unsent reminder withdrawn
});

test('14. Paid in sheet but outstanding in ledger raises an exception and suspends drafts', async () => {
  const ctx = await billedScenario();
  await pay(ctx, '4000.00');
  ctx.sheets.values[1][HEADERS.indexOf('Payment Status')] = 'Paid';
  const r = await runCollection({ runKey: WEEK1 });
  assert.equal(r.stats.exception_paid_with_balance, 1);
  assert.equal((await query('SELECT count(*)::int n FROM email_drafts')).rows[0].n, 0);
  const { rows: [e] } = await query(`SELECT * FROM exceptions WHERE kind='paid_with_ledger_balance' AND status='open'`);
  assert.equal(e.severity, 'critical');
  assert.match(e.message, /6,000\.00/);
  // An SOA cannot be issued while the discrepancy stands
  const soa = await generateSoa({ clientId: ctx.client.id });
  await assert.rejects(reviewSoa(soa.id, { approve: true, acknowledgeDiscrepancy: true }, ctx.users.approver), /marked Paid/);
});

test('15. a draft cannot be sent without explicit authorized approval', async () => {
  const ctx = await billedScenario();
  await runCollection({ runKey: WEEK1 });
  const { rows: [d] } = await query('SELECT * FROM email_drafts');
  await assert.rejects(email.sendDraft(d.id, ctx.users.sender), /only approved/);
  await assert.rejects(email.sendDraft(d.id, { ...ctx.users.admin, roles: ['sysadmin', 'approver'] }), /Sender/);
  await assert.rejects(email.decideDraft(d.id, { decision: 'approve' }, ctx.users.sender), /Approver/);
  await assert.rejects(email.decideDraft(d.id, { decision: 'approve' }, ctx.users.approver), /reviewed/); // SOA first
  await reviewSoa(d.soa_id, { approve: true }, ctx.users.approver);
  // Approver who edited the draft cannot approve it (no self-approval)
  const both = { ...ctx.users.approver, roles: ['approver', 'accounting'] };
  await email.editDraft(d.id, { body: `${d.body_text}\nTEST edit` }, both);
  await assert.rejects(email.decideDraft(d.id, { decision: 'approve' }, both), /created or edited/);
  await email.decideDraft(d.id, { decision: 'approve' }, { ...ctx.users.mgmt, roles: ['approver'] });
  assert.equal((await email.sendDraft(d.id, ctx.users.sender)).status, 'sent');
  assert.equal(ctx.gmail.sent.length, 1);
  assert.match(ctx.gmail.sent[0].decoded, /application\/pdf/);
  await assert.rejects(email.sendDraft(d.id, ctx.users.sender), /sent/); // never twice
});

test('16. material changes after approval invalidate the approval', async () => {
  const ctx = await billedScenario();
  const d = await runAndApprove(ctx, WEEK1);
  await assert.rejects(email.editDraft(d.id, { to: ['someone@else.invalid'] }, ctx.users.staff), /approved recipient/);
  await email.editDraft(d.id, { subject: `${d.subject} (updated)` }, ctx.users.staff);
  const { rows: [a] } = await query('SELECT * FROM approvals WHERE draft_id=$1', [d.id]);
  assert.ok(a.invalidated_at);
  assert.equal((await query('SELECT status FROM email_drafts WHERE id=$1', [d.id])).rows[0].status, 'pending_approval');
  await assert.rejects(email.sendDraft(d.id, ctx.users.sender), /only approved/);
  // A balance change after approval also forces renewed review
  await email.decideDraft(d.id, { decision: 'approve' }, ctx.users.approver);
  await pay(ctx, '1000.00');
  await assert.rejects(email.sendDraft(d.id, ctx.users.sender), /balance changed/);
  assert.equal(ctx.gmail.sent.length, 0);
});

test('17. a project marked Paid before sending is rechecked and blocked', async () => {
  const ctx = await billedScenario();
  const d = await runAndApprove(ctx, WEEK1);
  ctx.sheets.values[1][HEADERS.indexOf('Payment Status')] = 'Paid';
  await assert.rejects(email.sendDraft(d.id, ctx.users.sender), /marked Paid/);
  assert.equal(ctx.gmail.sent.length, 0);
  assert.equal((await query('SELECT status FROM email_drafts WHERE id=$1', [d.id])).rows[0].status, 'cancelled');
});

test('18. failed synchronization prevents drafts from stale data', async () => {
  const ctx = await billedScenario();
  ctx.sheets.fail = 'TEST network failure';
  const r = await runCollection({ runKey: WEEK1 });
  assert.equal(r.status, 'failed');
  assert.equal((await query('SELECT count(*)::int n FROM email_drafts')).rows[0].n, 0);
  assert.equal((await reports.dashboard()).sync.stale, true);
  // Renamed header (moved/edited column) also fails closed
  ctx.sheets.fail = null;
  ctx.sheets.values[0][HEADERS.indexOf('Payment Status')] = 'Pay Status';
  assert.equal((await runCollection({ runKey: WEEK1 })).status, 'failed');
  ctx.sheets.values[0][HEADERS.indexOf('Payment Status')] = 'Payment Status';
  const retry = await runCollection({ runKey: WEEK1 });
  assert.equal(retry.status, 'succeeded');
  assert.equal(retry.stats.draft_created, 1);
  assert.equal((await query(`SELECT attempts FROM collection_runs WHERE run_key=$1`, [WEEK1])).rows[0].attempts, 3);
  // A failed pre-send sync blocks sending too
  const { rows: [d] } = await query('SELECT * FROM email_drafts');
  await reviewSoa(d.soa_id, { approve: true }, ctx.users.approver);
  await email.decideDraft(d.id, { decision: 'approve' }, ctx.users.approver);
  ctx.sheets.fail = 'TEST outage';
  await assert.rejects(email.sendDraft(d.id, ctx.users.sender), /re-synchronized/);
  assert.equal(ctx.gmail.sent.length, 0);
});

test('19. failed and uncertain email attempts are recorded and retried without duplicates', async () => {
  const ctx = await billedScenario();
  const d = await runAndApprove(ctx, WEEK1);
  // Definite failure → retry allowed
  ctx.gmail.failMode = 'reject';
  await assert.rejects(email.sendDraft(d.id, ctx.users.sender), /rejected/);
  assert.equal((await query('SELECT status FROM email_drafts WHERE id=$1', [d.id])).rows[0].status, 'send_failed');
  // Uncertain: delivered but response lost → retry is blocked until reconciled
  ctx.gmail.failMode = 'timeout_after_send';
  await assert.rejects(email.sendDraft(d.id, ctx.users.sender), /uncertain/);
  await assert.rejects(email.sendDraft(d.id, ctx.users.sender), /unknown outcome/);
  ctx.gmail.failMode = null;
  const rec = await email.reconcileUnknownSend(d.id, ctx.users.sender);
  assert.equal(rec.outcome, 'sent');
  assert.equal(ctx.gmail.sent.length, 1);
  const { rows: attempts } = await query('SELECT status FROM send_attempts WHERE draft_id=$1 ORDER BY id', [d.id]);
  assert.deepEqual(attempts.map((a) => a.status), ['failed', 'reconciled_sent']);

  // Uncertain but NOT delivered → reconcile shows not sent → one controlled retry
  const ctx2 = await billedScenario();
  const d2 = await runAndApprove(ctx2, WEEK1);
  ctx2.gmail.failMode = 'timeout_before_send';
  await assert.rejects(email.sendDraft(d2.id, ctx2.users.sender), /uncertain/);
  ctx2.gmail.failMode = null;
  assert.equal((await email.reconcileUnknownSend(d2.id, ctx2.users.sender)).outcome, 'not_sent');
  assert.equal((await email.sendDraft(d2.id, ctx2.users.sender)).status, 'sent');
  assert.equal(ctx2.gmail.sent.length, 1);
});

test('20. material financial and approval actions are auditable and immutable', async () => {
  const ctx = await billedScenario();
  const d = await runAndApprove(ctx, WEEK1);
  await email.sendDraft(d.id, ctx.users.sender);
  await pay(ctx, '1000.00');
  const p = await pay(ctx, '500.00');
  await ledger.reversePayment(p.id, ctx.users.approver, 'TEST bounced cheque');
  const adj = await ledger.requestAdjustment({ invoiceId: ctx.invoice.id, kind: 'credit_note', amount: '100', effectiveDate: today, reason: 'TEST discount' }, ctx.users.staff);
  await assert.rejects(ledger.decideAdjustment(adj.id, true, ctx.users.staff), /other than/);
  await ledger.decideAdjustment(adj.id, true, ctx.users.mgmt);
  for (const action of ['sync.succeeded', 'job_order.imported', 'invoice.created_from_sheet', 'invoice.reconciled', 'payment.recorded', 'payment.verified', 'payment.allocated',
    'payment.reversed', 'adjustment.requested', 'adjustment.approved', 'soa.generated', 'soa.reviewed', 'email_draft.created', 'email_draft.approve',
    'email_send.attempt', 'email_send.succeeded', 'collection_run.succeeded', 'settings.update', 'user.created']) {
    assert.ok((await auditCount(action)) > 0, `missing audit for ${action}`);
  }
  const { rows: [rev] } = await query(`SELECT * FROM audit_log WHERE action='payment.reversed'`);
  assert.equal(rev.reason, 'TEST bounced cheque');
  assert.equal(rev.actor_label, 'approver@test.invalid');
  await assert.rejects(query(`UPDATE audit_log SET action='x'`), /not permitted/);
  await assert.rejects(query(`DELETE FROM audit_log`), /not permitted/);
  await assert.rejects(query(`DELETE FROM payments WHERE id=$1`, [p.id]), /not permitted/);
  await assert.rejects(query(`UPDATE payments SET amount=1 WHERE id=$1`, [p.id]), /immutable/);
  assert.equal((await ledger.jobOrderBalance(ctx.jo.id)).outstanding, 1000000 - 100000 - 10000);
});

test('extra: removed rows and unmatched clients are flagged, never silently dropped', async () => {
  const ctx = await setup({ values: [HEADERS, baseRow(), baseRow({ 'JO No.': 'JO-1002', Client: 'TEST Unknown Client', 'Invoice #': 'INV-002' })] });
  await makeClient();
  await runSync();
  ctx.sheets.values.splice(1, 1);
  const s = await runSync();
  assert.equal(s.removed, 1);
  const { rows: [jo] } = await query(`SELECT * FROM job_orders WHERE jo_number='JO-1001'`);
  assert.equal(jo.source_present, false);
  const kinds = (await query(`SELECT kind FROM exceptions WHERE status='open'`)).rows.map((r) => r.kind);
  assert.ok(kinds.includes('removed_from_source'));
  assert.ok(kinds.includes('unmatched_client'));
  // Restored row clears the removal exception automatically
  ctx.sheets.values.push(baseRow());
  await runSync();
  const kinds2 = (await query(`SELECT kind FROM exceptions WHERE status='open'`)).rows.map((r) => r.kind);
  assert.ok(!kinds2.includes('removed_from_source'));
});

test('extra: weekly and monthly reports reconcile with the ledger; exports render', async () => {
  const ctx = await billedScenario();
  await pay(ctx, '2500.00');
  const w = await reports.weeklyReport();
  assert.equal(w.summary.rollForwardReconciles, true, JSON.stringify(w.checks));
  const m = await reports.monthlyReport();
  assert.equal(m.summary.rollForwardReconciles, true);
  assert.equal(m.summary.closingReceivables, 750000);
  const { toCSV, toXLSX, toPDF } = await import('../lib/export.js');
  for (const r of [await reports.dailyReport(), w, m, await reports.mondayReport(WEEK1)]) {
    assert.ok(toCSV(r).length > 10);
    assert.ok((await toXLSX(r)).length > 1000);
    assert.equal((await toPDF(r)).subarray(0, 5).toString(), '%PDF-');
  }
});
