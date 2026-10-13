// Pure ledger calculations. All amounts are integer centavos.
//
// Outstanding per invoice = invoice amount + approved debit adjustments − allocated verified payments − approved credits.
//
// basis = 'as_known'  → reproduce what the books showed on the as-of date: a payment only counts if it had been
//                       verified by the end of that day; an adjustment only if approved by then; reversals that
//                       happened later are ignored.
// basis = 'restated'  → today's knowledge applied to transactions effective on/before the as-of date.
import { toCents } from '../lib/money.js';
import { daysBetween, manilaDayEnd } from '../lib/dates.js';

const ts = (v) => (v ? new Date(v).getTime() : null);

function inEffect({ effectiveDate, status, okStatuses, recognizedAt, reversedAt }, asOf, asOfEnd, basis) {
  if (effectiveDate > asOf) return false;
  if (basis === 'as_known') {
    if (!recognizedAt || ts(recognizedAt) > asOfEnd) return false;
    if (status === 'reversed') return ts(reversedAt) > asOfEnd; // reversed only after the as-of date
    return okStatuses.includes(status);
  }
  return okStatuses.includes(status);
}

export function paymentInEffect(p, asOf, basis = 'as_known') {
  const asOfEnd = manilaDayEnd(asOf).getTime();
  return inEffect({ effectiveDate: p.payment_date, status: p.status, okStatuses: ['verified'], recognizedAt: p.verified_at, reversedAt: p.reversed_at }, asOf, asOfEnd, basis);
}

export function agingBucket(daysOverdue) {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'd1_30';
  if (daysOverdue <= 60) return 'd31_60';
  if (daysOverdue <= 90) return 'd61_90';
  return 'd90_plus';
}

/**
 * @param data {invoices, allocations, adjustments, payments} raw DB rows for ONE client (or many — grouped by client_id)
 * @returns per-invoice balances, client totals, aging, unapplied credits, unverified claims
 */
export function computeLedger(data, asOf, basis = 'as_known') {
  const asOfEnd = manilaDayEnd(asOf).getTime();
  const payments = new Map(data.payments.map((p) => [p.id, p]));
  const payOk = (p) => p && paymentInEffect(p, asOf, basis);

  const invoices = data.invoices
    .filter((i) => i.status === 'issued' && i.invoice_date && i.invoice_date <= asOf)
    .map((inv) => {
      const original = toCents(inv.amount);
      const allocs = data.allocations.filter((a) => a.invoice_id === inv.id && payOk(payments.get(a.payment_id)) &&
        inEffect({ effectiveDate: a.effective_date, status: a.status, okStatuses: ['active'], recognizedAt: a.created_at, reversedAt: a.reversed_at }, asOf, asOfEnd, basis));
      const adjs = data.adjustments.filter((a) => a.invoice_id === inv.id &&
        inEffect({ effectiveDate: a.effective_date, status: a.status, okStatuses: ['approved'], recognizedAt: a.decided_at, reversedAt: a.reversed_at }, asOf, asOfEnd, basis));
      const paid = allocs.reduce((s, a) => s + toCents(a.amount), 0);
      const debits = adjs.filter((a) => a.kind === 'debit').reduce((s, a) => s + toCents(a.amount), 0);
      const credits = adjs.filter((a) => a.kind === 'credit_note').reduce((s, a) => s + toCents(a.amount), 0);
      const outstanding = original + debits - paid - credits;
      const daysOverdue = inv.due_date ? Math.max(0, daysBetween(inv.due_date, asOf)) : 0;
      return {
        invoiceId: inv.id, invoiceNumber: inv.invoice_number, clientId: inv.client_id,
        invoiceDate: inv.invoice_date, dueDate: inv.due_date, original, debits, paid, credits,
        paymentsAndCredits: paid + credits - debits, outstanding, daysOverdue: outstanding > 0 ? daysOverdue : 0,
        bucket: outstanding > 0 ? agingBucket(inv.due_date ? daysBetween(inv.due_date, asOf) : 0) : null,
        allocationIds: allocs.map((a) => a.id), adjustmentIds: adjs.map((a) => a.id),
      };
    });

  const totals = { outstanding: 0, notYetDue: 0, overdue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, overpaid: 0 };
  for (const i of invoices) {
    if (i.outstanding < 0) { totals.overpaid += -i.outstanding; continue; }
    if (i.outstanding === 0) continue;
    totals.outstanding += i.outstanding;
    if (i.bucket === 'current') totals.notYetDue += i.outstanding;
    else { totals.overdue += i.outstanding; totals[i.bucket] += i.outstanding; }
  }

  // Unapplied: verified payment amount not (yet) allocated as of the date. Shown separately, never netted silently.
  const unapplied = [];
  for (const p of data.payments) {
    if (!payOk(p)) continue;
    const used = data.allocations.filter((a) => a.payment_id === p.id &&
      inEffect({ effectiveDate: a.effective_date, status: a.status, okStatuses: ['active'], recognizedAt: a.created_at, reversedAt: a.reversed_at }, asOf, asOfEnd, basis))
      .reduce((s, a) => s + toCents(a.amount), 0);
    const rem = toCents(p.amount) - used;
    if (rem > 0) unapplied.push({ paymentId: p.id, reference: p.reference_no, paymentDate: p.payment_date, amount: rem });
  }
  const unverified = data.payments.filter((p) => p.status === 'claimed' && p.payment_date <= asOf)
    .map((p) => ({ paymentId: p.id, reference: p.reference_no, paymentDate: p.payment_date, amount: toCents(p.amount) }));

  totals.unapplied = unapplied.reduce((s, u) => s + u.amount, 0);
  totals.unverifiedClaims = unverified.reduce((s, u) => s + u.amount, 0);
  return { asOf, basis, invoices, totals, unapplied, unverified };
}

/** Allocation validation: never allocate more than the payment's remaining or the invoice's outstanding. */
export function validateAllocation({ paymentAmount, paymentAllocated, invoiceOutstanding, amount }) {
  if (!Number.isInteger(amount) || amount <= 0) return 'Allocation amount must be positive';
  if (amount > paymentAmount - paymentAllocated) return 'Allocation exceeds the unallocated amount of the payment';
  if (amount > invoiceOutstanding) return 'Allocation exceeds the invoice outstanding balance';
  return null;
}
