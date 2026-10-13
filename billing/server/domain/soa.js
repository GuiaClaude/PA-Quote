// Statement of Account model built from reconciled ledger data.
import { sha256, stableStringify } from '../lib/crypto.js';

export function buildStatementModel({ client, ledger, jobOrdersByInvoice, mode }) {
  const lines = ledger.invoices
    .filter((l) => mode === 'full_history' || l.outstanding !== 0)
    .sort((a, b) => (a.invoiceDate < b.invoiceDate ? -1 : a.invoiceDate > b.invoiceDate ? 1 : a.invoiceNumber.localeCompare(b.invoiceNumber)))
    .map((l) => {
      const jos = jobOrdersByInvoice.get(l.invoiceId) || [];
      return {
        invoiceId: l.invoiceId,
        invoiceDate: l.invoiceDate,
        invoiceNumber: l.invoiceNumber,
        jobOrders: jos.map((j) => j.jo_number).join(', '),
        description: jos.map((j) => j.project_name || j.description).filter(Boolean).join('; '),
        dueDate: l.dueDate,
        original: l.original,
        paymentsAndCredits: l.paymentsAndCredits,
        outstanding: l.outstanding,
        daysOverdue: l.daysOverdue,
      };
    });
  const totals = { ...ledger.totals };
  const includedRefs = {
    invoices: ledger.invoices.filter((l) => lines.some((x) => x.invoiceId === l.invoiceId)).map((l) => ({ id: l.invoiceId, number: l.invoiceNumber, allocations: l.allocationIds, adjustments: l.adjustmentIds })),
    unappliedPayments: ledger.unapplied.map((u) => u.paymentId),
  };
  const contentHash = sha256(stableStringify({ clientId: client.id, asOf: ledger.asOf, basis: ledger.basis, mode, lines, totals, unapplied: ledger.unapplied }));
  return { lines, totals, includedRefs, unapplied: ledger.unapplied, contentHash };
}
