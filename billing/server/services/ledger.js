import { query, tx } from '../db.js';
import { computeLedger, validateAllocation } from '../domain/ledger.js';
import { toCents, fromCents } from '../lib/money.js';
import { manilaDate, isValidDateStr } from '../lib/dates.js';
import { audit } from './audit.js';
import { AppError, badRequest, notFound, conflict, forbidden } from '../lib/errors.js';
import { normInvoice } from '../domain/sheetParse.js';

export async function loadLedgerData(db, clientId) {
  const q = db || { query };
  const where = clientId == null ? 'TRUE' : 'client_id=$1';
  const p = clientId == null ? [] : [clientId];
  // Sequential: `db` may be a single transaction client.
  const inv = await q.query(`SELECT * FROM invoices WHERE ${where}`, p);
  const pay = await q.query(`SELECT * FROM payments WHERE ${where}`, p);
  const alloc = await q.query(`SELECT a.* FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE ${clientId == null ? 'TRUE' : 'p.client_id=$1'}`, p);
  const adj = await q.query(`SELECT a.* FROM adjustments a JOIN invoices i ON i.id=a.invoice_id WHERE ${clientId == null ? 'TRUE' : 'i.client_id=$1'}`, p);
  return { invoices: inv.rows, payments: pay.rows, allocations: alloc.rows, adjustments: adj.rows };
}

export async function clientLedger(clientId, asOf = manilaDate(), basis = 'as_known', db) {
  return computeLedger(await loadLedgerData(db, clientId), asOf, basis);
}

/** Ledger balances for all clients, grouped. */
export async function allLedgers(asOf = manilaDate(), basis = 'as_known') {
  const data = await loadLedgerData(null, null);
  const byClient = new Map();
  const bucket = (cid) => {
    if (!byClient.has(cid)) byClient.set(cid, { invoices: [], payments: [], allocations: [], adjustments: [] });
    return byClient.get(cid);
  };
  const invClient = new Map(data.invoices.map((i) => [i.id, i.client_id]));
  data.invoices.forEach((i) => bucket(i.client_id).invoices.push(i));
  data.payments.forEach((p) => bucket(p.client_id).payments.push(p));
  const payClient = new Map(data.payments.map((p) => [p.id, p.client_id]));
  data.allocations.forEach((a) => bucket(payClient.get(a.payment_id)).allocations.push(a));
  data.adjustments.forEach((a) => bucket(invClient.get(a.invoice_id)).adjustments.push(a));
  const out = new Map();
  for (const [cid, d] of byClient) out.set(cid, computeLedger(d, asOf, basis));
  return out;
}

/** Ledger view of one job order: its distinct invoices (each counted once) and their balances. */
export async function jobOrderBalance(jobOrderId, asOf = manilaDate(), db) {
  const q = db || { query };
  const { rows: invs } = await q.query(
    `SELECT i.* FROM invoices i JOIN invoice_job_orders ij ON ij.invoice_id=i.id WHERE ij.job_order_id=$1`, [jobOrderId]);
  const clientIds = [...new Set(invs.map((i) => i.client_id).filter((x) => x != null))];
  const unreconciled = invs.filter((i) => i.status === 'unreconciled');
  if (!invs.length) return { invoices: [], unreconciled: [], outstanding: null, original: null, paid: null, hasLedger: false };
  if (clientIds.length !== 1) return { invoices: [], unreconciled, outstanding: null, hasLedger: false, problem: 'Invoice has no single client' };
  const ledger = await clientLedger(clientIds[0], asOf, 'as_known', db);
  const ids = new Set(invs.map((i) => i.id));
  const lines = ledger.invoices.filter((l) => ids.has(l.invoiceId));
  const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
  return {
    clientId: clientIds[0], invoices: lines, unreconciled, hasLedger: lines.length > 0,
    original: sum('original'), paid: sum('paid'), credits: sum('credits'), debits: sum('debits'),
    outstanding: sum('outstanding'), overdue: lines.filter((l) => l.daysOverdue > 0).reduce((s, l) => s + Math.max(0, l.outstanding), 0),
    maxDaysOverdue: Math.max(0, ...lines.map((l) => l.daysOverdue)),
    unverifiedClaims: ledger.unverified, unapplied: ledger.unapplied,
  };
}

// ───────────────────────── Invoices ─────────────────────────

export async function createInvoice({ invoiceNumber, clientId, invoiceDate, dueDate, amount, jobOrderIds = [] }, actor) {
  const no = normInvoice(invoiceNumber);
  const cents = toCents(amount);
  if (!no) throw badRequest('Invoice number is required');
  if (cents === null || cents < 0) throw badRequest('Invalid amount');
  if (!isValidDateStr(invoiceDate) || !isValidDateStr(dueDate)) throw badRequest('Invoice and due dates are required (YYYY-MM-DD)');
  return tx(async (db) => {
    const { rows: ex } = await db.query('SELECT id FROM invoices WHERE invoice_number=$1', [no]);
    if (ex.length) throw conflict(`Invoice ${no} already exists in the ledger; it will not be created twice`);
    const { rows: [inv] } = await db.query(
      `INSERT INTO invoices(invoice_number, client_id, invoice_date, due_date, amount, status, source, created_by, reconciled_by, reconciled_at)
       VALUES ($1,$2,$3,$4,$5,'issued','app',$6,$6,now()) RETURNING *`, [no, clientId, invoiceDate, dueDate, fromCents(cents), actor.id]);
    for (const jid of jobOrderIds) await db.query('INSERT INTO invoice_job_orders(invoice_id, job_order_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [inv.id, jid]);
    await audit(db, actor, 'invoice.created', 'invoice', no, { after: inv, related: { jobOrderIds } });
    return inv;
  });
}

/** Staff confirm a sheet-derived invoice: amount/dates/client are verified and it enters the reconciled ledger. */
export async function reconcileInvoice(id, { amount, invoiceDate, dueDate, clientId }, actor) {
  return tx(async (db) => {
    const { rows: [inv] } = await db.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [id]);
    if (!inv) throw notFound();
    if (inv.status !== 'unreconciled') throw conflict(`Invoice is already ${inv.status}`);
    const cents = toCents(amount ?? inv.amount);
    const final = { amount: fromCents(cents), invoice_date: invoiceDate || inv.invoice_date, due_date: dueDate || inv.due_date, client_id: clientId || inv.client_id };
    if (!final.client_id) throw badRequest('Link the invoice to a client before reconciling');
    if (!final.invoice_date || !final.due_date) throw badRequest('Invoice date and due date are required before reconciling');
    await db.query(`UPDATE invoices SET amount=$2, invoice_date=$3, due_date=$4, client_id=$5, status='issued', reconciled_by=$6, reconciled_at=now() WHERE id=$1`,
      [id, final.amount, final.invoice_date, final.due_date, final.client_id, actor.id]);
    await audit(db, actor, 'invoice.reconciled', 'invoice', inv.invoice_number, { before: inv, after: final });
    return { ...inv, ...final, status: 'issued' };
  });
}

export async function confirmInvoiceSent(id, actor) {
  const { rows } = await query(`UPDATE invoices SET sent_confirmed_at=now() WHERE id=$1 AND sent_confirmed_at IS NULL RETURNING *`, [id]);
  if (!rows.length) throw conflict('Invoice not found or already confirmed sent');
  await audit(null, actor, 'invoice.sent_confirmed', 'invoice', rows[0].invoice_number);
  return rows[0];
}

export async function voidInvoice(id, reason, actor) {
  if (!reason?.trim()) throw badRequest('A reason is required');
  return tx(async (db) => {
    const { rows: [inv] } = await db.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [id]);
    if (!inv) throw notFound();
    const { rows: [{ n }] } = await db.query(`SELECT count(*)::int n FROM payment_allocations WHERE invoice_id=$1 AND status='active'`, [id]);
    if (n) throw conflict('Reverse the payment allocations on this invoice before voiding it');
    await db.query(`UPDATE invoices SET status='void', voided_reason=$2 WHERE id=$1`, [id, reason]);
    await audit(db, actor, 'invoice.voided', 'invoice', inv.invoice_number, { before: { status: inv.status }, after: { status: 'void' }, reason });
  });
}

// ───────────────────────── Payments ─────────────────────────

export async function recordPayment({ clientId, paymentDate, amount, method, referenceNo, notes }, actor) {
  const cents = toCents(amount);
  if (!clientId) throw badRequest('Client is required');
  if (cents === null || cents <= 0) throw badRequest('Invalid amount');
  if (!isValidDateStr(paymentDate)) throw badRequest('Payment date is required (YYYY-MM-DD)');
  try {
    const { rows: [p] } = await query(
      `INSERT INTO payments(client_id, payment_date, amount, method, reference_no, notes, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [clientId, paymentDate, fromCents(cents), method || null, referenceNo?.trim() || null, notes || null, actor.id]);
    await audit(null, actor, 'payment.recorded', 'payment', p.id, { after: p });
    return p;
  } catch (e) {
    if (e.code === '23505') throw conflict('A payment with this reference number is already recorded for this client');
    throw e;
  }
}

export async function verifyPayment(id, actor, note) {
  return tx(async (db) => {
    const { rows: [p] } = await db.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [id]);
    if (!p) throw notFound();
    if (p.status !== 'claimed') throw conflict(`Payment is ${p.status}`);
    if (p.recorded_by === actor.id) throw forbidden('The person who recorded a payment cannot verify it');
    await db.query(`UPDATE payments SET status='verified', verified_by=$2, verified_at=now() WHERE id=$1`, [id, actor.id]);
    await audit(db, actor, 'payment.verified', 'payment', id, { before: { status: 'claimed' }, after: { status: 'verified' }, reason: note });
  });
}

export async function rejectPayment(id, actor, reason) {
  if (!reason?.trim()) throw badRequest('A reason is required');
  const { rows } = await query(`UPDATE payments SET status='rejected', reversed_reason=$2 WHERE id=$1 AND status='claimed' RETURNING *`, [id, reason]);
  if (!rows.length) throw conflict('Only unverified payment claims can be rejected');
  await audit(null, actor, 'payment.rejected', 'payment', id, { reason });
}

/** Reversal (e.g. bounced cheque). The payment and its allocations stay on record, marked reversed. */
export async function reversePayment(id, actor, reason) {
  if (!reason?.trim()) throw badRequest('A reason is required');
  return tx(async (db) => {
    const { rows: [p] } = await db.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [id]);
    if (!p) throw notFound();
    if (p.status !== 'verified') throw conflict('Only verified payments can be reversed');
    await db.query(`UPDATE payments SET status='reversed', reversed_at=now(), reversed_reason=$2 WHERE id=$1`, [id, reason]);
    const { rows: allocs } = await db.query(`UPDATE payment_allocations SET status='reversed', reversed_at=now(), reversed_reason=$2 WHERE payment_id=$1 AND status='active' RETURNING id`, [id, reason]);
    await audit(db, actor, 'payment.reversed', 'payment', id, { before: { status: 'verified' }, after: { status: 'reversed', allocationsReversed: allocs.map((a) => a.id) }, reason });
  });
}

export async function allocatePayment({ paymentId, invoiceId, amount, effectiveDate }, actor) {
  const cents = toCents(amount);
  return tx(async (db) => {
    const { rows: [p] } = await db.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [paymentId]);
    const { rows: [inv] } = await db.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [invoiceId]);
    if (!p || !inv) throw notFound('Payment or invoice not found');
    if (p.status !== 'verified') throw conflict('Only verified payments can be allocated');
    if (inv.status !== 'issued') throw conflict('Allocate only to reconciled (issued) invoices');
    if (inv.client_id !== p.client_id) throw conflict('Payment and invoice belong to different clients');
    const { rows: [{ s: payUsed }] } = await db.query(`SELECT COALESCE(sum(amount),0) s FROM payment_allocations WHERE payment_id=$1 AND status='active'`, [paymentId]);
    const ledger = computeLedger(await loadLedgerData(db, p.client_id), '9999-12-31', 'restated');
    const line = ledger.invoices.find((l) => l.invoiceId === inv.id);
    const err = validateAllocation({ paymentAmount: toCents(p.amount), paymentAllocated: toCents(payUsed), invoiceOutstanding: line ? line.outstanding : toCents(inv.amount), amount: cents });
    if (err) throw badRequest(err);
    // An allocation cannot take effect before the invoice exists (keeps period roll-forwards reconcilable).
    const eff = [effectiveDate || p.payment_date, inv.invoice_date].filter(Boolean).sort().pop();
    const { rows: [a] } = await db.query(
      `INSERT INTO payment_allocations(payment_id, invoice_id, amount, effective_date, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [paymentId, invoiceId, fromCents(cents), eff, actor.id]);
    await audit(db, actor, 'payment.allocated', 'payment_allocation', a.id, { after: a, related: { payment: paymentId, invoice: inv.invoice_number } });
    return a;
  });
}

export async function reverseAllocation(id, actor, reason) {
  if (!reason?.trim()) throw badRequest('A reason is required');
  const { rows } = await query(`UPDATE payment_allocations SET status='reversed', reversed_at=now(), reversed_reason=$2 WHERE id=$1 AND status='active' RETURNING *`, [id, reason]);
  if (!rows.length) throw conflict('Allocation not found or already reversed');
  await audit(null, actor, 'allocation.reversed', 'payment_allocation', id, { reason });
}

// ───────────────────────── Adjustments ─────────────────────────

export async function requestAdjustment({ invoiceId, kind, amount, effectiveDate, reference, reason }, actor) {
  const cents = toCents(amount);
  if (!['debit', 'credit_note'].includes(kind)) throw badRequest('Invalid adjustment kind');
  if (cents === null || cents <= 0) throw badRequest('Invalid amount');
  if (!reason?.trim()) throw badRequest('A reason is required');
  if (!isValidDateStr(effectiveDate)) throw badRequest('Effective date required');
  const { rows: [a] } = await query(
    `INSERT INTO adjustments(invoice_id, kind, amount, effective_date, reference, reason, requested_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [invoiceId, kind, fromCents(cents), effectiveDate, reference || null, reason, actor.id]);
  await audit(null, actor, 'adjustment.requested', 'adjustment', a.id, { after: a, reason });
  return a;
}

export async function decideAdjustment(id, approve, actor, note) {
  return tx(async (db) => {
    const { rows: [a] } = await db.query('SELECT * FROM adjustments WHERE id=$1 FOR UPDATE', [id]);
    if (!a) throw notFound();
    if (a.status !== 'pending') throw conflict(`Adjustment is ${a.status}`);
    if (a.requested_by === actor.id) throw forbidden('Adjustments require approval by someone other than the requester');
    const status = approve ? 'approved' : 'rejected';
    await db.query('UPDATE adjustments SET status=$2, decided_by=$3, decided_at=now() WHERE id=$1', [id, status, actor.id]);
    await audit(db, actor, `adjustment.${status}`, 'adjustment', id, { before: { status: 'pending' }, after: { status }, reason: note });
  });
}

export async function reverseAdjustment(id, actor, reason) {
  if (!reason?.trim()) throw badRequest('A reason is required');
  const { rows } = await query(`UPDATE adjustments SET status='reversed', reversed_at=now(), reversed_reason=$2 WHERE id=$1 AND status='approved' RETURNING *`, [id, reason]);
  if (!rows.length) throw conflict('Only approved adjustments can be reversed');
  await audit(null, actor, 'adjustment.reversed', 'adjustment', id, { reason });
}

export async function issueReceipt({ paymentId, receiptNumber, issuedDate }, actor) {
  const { rows: [p] } = await query('SELECT * FROM payments WHERE id=$1', [paymentId]);
  if (!p) throw notFound();
  if (p.status !== 'verified') throw conflict('Receipts are issued only for verified payments');
  try {
    const { rows: [r] } = await query('INSERT INTO receipts(payment_id, receipt_number, issued_date, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [paymentId, receiptNumber, issuedDate || manilaDate(), actor.id]);
    await audit(null, actor, 'receipt.issued', 'receipt', r.receipt_number, { after: r });
    return r;
  } catch (e) {
    if (e.code === '23505') throw conflict('Receipt number already used');
    throw e;
  }
}

export { AppError };
