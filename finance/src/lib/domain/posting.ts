/**
 * Posting rules: turn business documents into balanced journal entries.
 * Pure functions (no database), so every rule is unit-tested.
 * Accounts are referred to by code; the caller maps codes to account ids.
 */
import { SYS } from "./coa";
import { prorate, sum, type Centavos } from "./money";
import type { ISODate } from "./dates";

export interface DraftLine {
  account: string; // account code
  debit: Centavos;
  credit: Centavos;
  partyType?: "client" | "supplier" | "employee";
  partyId?: string;
  projectId?: string | null;
  memo?: string;
}

export interface DraftEntry {
  date: ISODate;
  memo: string;
  lines: DraftLine[];
}

export class PostingError extends Error {}

const dr = (account: string, amount: Centavos, extra: Partial<DraftLine> = {}): DraftLine => ({ account, debit: amount, credit: 0, ...extra });
const cr = (account: string, amount: Centavos, extra: Partial<DraftLine> = {}): DraftLine => ({ account, debit: 0, credit: amount, ...extra });

/** Drop zero lines, merge nothing, and check the entry balances. */
export function finalize(entry: DraftEntry): DraftEntry {
  const lines = entry.lines.filter((l) => l.debit !== 0 || l.credit !== 0);
  for (const l of lines) {
    if (l.debit < 0 || l.credit < 0) throw new PostingError(`Negative amount on account ${l.account}`);
    if (l.debit !== 0 && l.credit !== 0) throw new PostingError(`Line on ${l.account} has both debit and credit`);
    if (!Number.isSafeInteger(l.debit) || !Number.isSafeInteger(l.credit)) throw new PostingError("Amounts must be whole centavos");
  }
  const d = sum(lines.map((l) => l.debit));
  const c = sum(lines.map((l) => l.credit));
  if (d !== c) throw new PostingError(`Entry "${entry.memo}" does not balance: debits ${d}, credits ${c}`);
  if (lines.length < 2) throw new PostingError(`Entry "${entry.memo}" needs at least two non-zero lines`);
  return { ...entry, lines };
}

/** Split `total` across `weights` in proportion, so the parts add up exactly (largest remainder). */
export function allocateProportionally(total: Centavos, weights: Centavos[]): Centavos[] {
  const w = sum(weights);
  if (weights.length === 0) return [];
  if (w === 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }
  const raw = weights.map((x) => (total * x) / w);
  const floors = raw.map((x) => Math.floor(x));
  let rest = total - sum(floors);
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) floors[order[k]!.i]! += 1;
  return floors;
}

// ───────────────────────────── Sales ─────────────────────────────

export interface BillingForPosting {
  id: string;
  docLabel: string; // "SI 0412"
  billingDate: ISODate;
  clientId: string;
  projectId?: string | null;
  status: string;
  vatTreatment: "vat" | "zero_rated" | "exempt" | "non_vat";
  vatBasis: "collected" | "billed";
  gross: Centavos;
  net: Centavos;
  vat: Centavos;
  lines: { amount: Centavos; revenueAccount?: string | null }[];
}

const NON_POSTING_STATUSES = new Set(["draft", "void", "rejected"]);

/**
 * Billing (invoice):  Dr AR gross / Cr Revenue net / Cr Output VAT
 * (Deferred Output VAT instead when the period's VAT basis is "collected").
 */
export function postBilling(b: BillingForPosting): DraftEntry | null {
  if (NON_POSTING_STATUSES.has(b.status)) return null;
  if (b.net + b.vat !== b.gross) throw new PostingError(`Billing ${b.docLabel}: net + VAT ≠ gross`);
  if (b.vatTreatment !== "vat" && b.vat !== 0) throw new PostingError(`Billing ${b.docLabel}: ${b.vatTreatment} sale cannot carry VAT`);

  const party = { partyType: "client" as const, partyId: b.clientId, projectId: b.projectId ?? null };
  const lines = b.lines.length ? b.lines : [{ amount: b.gross, revenueAccount: null }];
  const nets = allocateProportionally(b.net, lines.map((l) => l.amount));

  const vatAccount = b.vatBasis === "collected" ? SYS.deferredOutputVat : SYS.outputVat;
  return finalize({
    date: b.billingDate,
    memo: `Billing ${b.docLabel}`,
    lines: [
      dr(SYS.ar, b.gross, party),
      ...lines.map((l, i) => cr(l.revenueAccount || SYS.revenueDefault, nets[i]!, party)),
      cr(vatAccount, b.vat, party),
    ],
  });
}

export interface CollectionForPosting {
  id: string;
  label: string; // "OR 1234" / "Collection 10/05/2026"
  collectionDate: ISODate;
  clientId: string;
  depositAccount: string; // GL code of the bank/cash account
  cash: Centavos;
  cwt: Centavos;
  allocations: {
    billingId: string;
    billingLabel: string;
    applied: Centavos; // cash applied
    cwt: Centavos; // CWT applied
    billing: { gross: Centavos; vat: Centavos; vatBasis: "collected" | "billed"; projectId?: string | null };
    /** Deferred output VAT still on this billing before this collection. */
    deferredVatRemaining: Centavos;
    /** True when this collection pays the billing in full. */
    settlesBilling: boolean;
  }[];
}

/** Deferred output VAT that a payment turns into output VAT (collected-basis billings only). */
export function deferredVatToMove(a: CollectionForPosting["allocations"][number]): Centavos {
  if (a.billing.vatBasis !== "collected" || a.deferredVatRemaining <= 0) return 0;
  return a.settlesBilling
    ? a.deferredVatRemaining
    : Math.min(a.deferredVatRemaining, prorate(a.billing.vat, a.applied + a.cwt, a.billing.gross));
}

/**
 * Collection:  Dr Bank (cash) + Dr CWT (2307) / Cr AR (cash + CWT per billing)
 *              any cash not applied to a billing → Cr Customer Deposits (advance)
 * Collected-basis billings also move VAT: Dr Deferred Output VAT / Cr Output VAT.
 */
export function postCollection(c: CollectionForPosting): DraftEntry {
  const appliedCash = sum(c.allocations.map((a) => a.applied));
  const appliedCwt = sum(c.allocations.map((a) => a.cwt));
  if (appliedCash > c.cash) throw new PostingError(`${c.label}: more cash applied (${appliedCash}) than received (${c.cash})`);
  if (appliedCwt !== c.cwt) throw new PostingError(`${c.label}: CWT applied (${appliedCwt}) must equal CWT on the receipt (${c.cwt})`);

  const client = { partyType: "client" as const, partyId: c.clientId };
  const lines: DraftLine[] = [dr(c.depositAccount, c.cash, client), dr(SYS.cwt, c.cwt, client)];

  for (const a of c.allocations) {
    lines.push(cr(SYS.ar, a.applied + a.cwt, { ...client, projectId: a.billing.projectId ?? null, memo: a.billingLabel }));
    const move = deferredVatToMove(a);
    if (move > 0) {
      lines.push(dr(SYS.deferredOutputVat, move, { ...client, memo: a.billingLabel }));
      lines.push(cr(SYS.outputVat, move, { ...client, memo: a.billingLabel }));
    }
  }
  const unapplied = c.cash - appliedCash;
  if (unapplied > 0) lines.push(cr(SYS.customerDeposits, unapplied, { ...client, memo: "Unapplied / advance payment" }));

  return finalize({ date: c.collectionDate, memo: `Collection ${c.label}`, lines });
}

// ───────────────────────────── Purchases ─────────────────────────────

export interface PurchaseForPosting {
  id: string;
  label: string;
  invoiceDate: ISODate;
  supplierId: string;
  projectId?: string | null;
  total: Centavos;
  inputVat: Centavos;
  ewt: Centavos;
  lines: { account: string; net: Centavos; vat: Centavos; projectId?: string | null }[];
}

/**
 * Supplier bill:  Dr Expense/Asset (net per line) + Dr Input VAT / Cr AP (total − EWT) + Cr EWT Payable
 */
export function postPurchase(p: PurchaseForPosting): DraftEntry {
  const net = sum(p.lines.map((l) => l.net));
  const vat = sum(p.lines.map((l) => l.vat));
  if (net + vat !== p.total) throw new PostingError(`${p.label}: lines (${net + vat}) do not add up to the total (${p.total})`);
  if (vat !== p.inputVat) throw new PostingError(`${p.label}: line VAT (${vat}) ≠ input VAT (${p.inputVat})`);
  if (p.ewt > p.total) throw new PostingError(`${p.label}: EWT is larger than the bill`);

  const supplier = { partyType: "supplier" as const, partyId: p.supplierId };
  return finalize({
    date: p.invoiceDate,
    memo: `Bill ${p.label}`,
    lines: [
      ...p.lines.map((l) => dr(l.account, l.net, { ...supplier, projectId: l.projectId ?? p.projectId ?? null })),
      dr(SYS.inputVat, p.inputVat, supplier),
      cr(SYS.ap, p.total - p.ewt, supplier),
      cr(SYS.ewtPayable, p.ewt, supplier),
    ],
  });
}

export interface ApPaymentForPosting {
  id: string;
  label: string;
  paymentDate: ISODate;
  supplierId: string;
  paidFromAccount: string; // GL code (BPI, Spenmo, GCash, cash, credit card payable…)
  amount: Centavos;
  allocations: { purchaseId: string; applied: Centavos }[];
}

/**
 * Payment to supplier:  Dr AP (applied) + Dr Advances to Suppliers (unapplied) / Cr Bank
 */
export function postApPayment(p: ApPaymentForPosting): DraftEntry {
  const applied = sum(p.allocations.map((a) => a.applied));
  if (applied > p.amount) throw new PostingError(`${p.label}: applied (${applied}) exceeds the payment (${p.amount})`);
  const supplier = { partyType: "supplier" as const, partyId: p.supplierId };
  return finalize({
    date: p.paymentDate,
    memo: `Payment ${p.label}`,
    lines: [
      dr(SYS.ap, applied, supplier),
      dr("1160", p.amount - applied, { ...supplier, memo: "Advance to supplier" }),
      cr(p.paidFromAccount, p.amount, supplier),
    ],
  });
}

/** Reversal of a posted entry: same lines with debit and credit swapped. */
export function reverseEntry(entry: DraftEntry, date: ISODate, memo?: string): DraftEntry {
  return finalize({
    date,
    memo: memo ?? `Reversal of ${entry.memo}`,
    lines: entry.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  });
}
