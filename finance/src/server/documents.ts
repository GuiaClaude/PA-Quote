/**
 * Business documents → database + automatic journal posting, in one transaction.
 * All functions take a transaction opened with withUser(), so RLS applies.
 */
import { addDays, type ISODate } from "@/lib/domain/dates";
import { splitVatInclusive, sum, withholdingOnNet, roundHalfUp, type Centavos } from "@/lib/domain/money";
import {
  deferredVatToMove,
  postApPayment,
  postBilling,
  postCollection,
  postPurchase,
  PostingError,
  type CollectionForPosting,
} from "@/lib/domain/posting";
import type { Tx } from "./db";
import { bumpVersion, postDocument } from "./ledger";

export class UserInputError extends Error {}

const DOC_LABEL: Record<string, string> = {
  sales_invoice: "SI",
  billing_invoice: "BI",
  billing_statement: "BS",
  or_converted_invoice: "OR-INV",
};

export async function vatBasisFor(tx: Tx, orgId: string, date: ISODate): Promise<"collected" | "billed"> {
  const [row] = await tx<{ basis: "collected" | "billed" }[]>`
    select basis from vat_basis_periods
    where org_id = ${orgId} and start_date <= ${date} and (end_date is null or end_date >= ${date})
    order by start_date desc limit 1`;
  return row?.basis ?? "billed";
}

// ───────────────────────────── Billings ─────────────────────────────

export interface BillingInput {
  clientId: string;
  projectId?: string | null;
  docType: "sales_invoice" | "billing_invoice" | "billing_statement" | "or_converted_invoice";
  docNo: string;
  billingDate: ISODate;
  termsDays: number;
  poNumber?: string | null;
  jobType?: string | null;
  description?: string | null;
  vatTreatment: "vat" | "zero_rated" | "exempt" | "non_vat";
  cwtRateBp: number;
  status?: "draft" | "billed" | "for_collection";
  lines: { description: string; qty: number; unitPrice: Centavos; revenueAccount?: string | null }[];
  source?: { type: string; id: string; rowKey: string; hash?: string };
}

export async function createBilling(tx: Tx, orgId: string, input: BillingInput): Promise<string> {
  if (!input.lines.length) throw new UserInputError("Add at least one line.");
  const lines = input.lines.map((l) => ({ ...l, amount: roundHalfUp(l.qty * l.unitPrice) }));
  const gross = sum(lines.map((l) => l.amount));
  if (gross <= 0) throw new UserInputError("The billing total must be more than zero.");
  const { net, vat } = input.vatTreatment === "vat" ? splitVatInclusive(gross) : { net: gross, vat: 0 };
  const vatBasis = await vatBasisFor(tx, orgId, input.billingDate);
  const status = input.status ?? "billed";

  const [row] = await tx<{ id: string }[]>`
    insert into billings (org_id, doc_type, doc_no, client_id, project_id, billing_date, terms_days, due_date, po_number, job_type,
                          description, vat_treatment, gross_c, net_c, vat_c, cwt_rate_bp, vat_basis, status,
                          source_type, source_id, source_row_key, content_hash)
    values (${orgId}, ${input.docType}, ${input.docNo.trim()}, ${input.clientId}, ${input.projectId ?? null}, ${input.billingDate},
            ${input.termsDays}, ${addDays(input.billingDate, input.termsDays)}, ${input.poNumber ?? null}, ${input.jobType ?? null},
            ${input.description ?? null}, ${input.vatTreatment}, ${gross}, ${net}, ${vat}, ${input.cwtRateBp}, ${vatBasis}, ${status},
            ${input.source?.type ?? null}, ${input.source?.id ?? null}, ${input.source?.rowKey ?? null}, ${input.source?.hash ?? null})
    returning id`;
  const id = row!.id;
  await tx`insert into billing_lines ${tx(
    lines.map((l, i) => ({
      org_id: orgId, billing_id: id, line_no: i + 1, description: l.description, qty: l.qty,
      unit_price_c: l.unitPrice, amount_c: l.amount, revenue_account_id: null,
    })),
  )}`;
  await postDocument(
    tx, orgId, "billing", id,
    postBilling({
      id, docLabel: `${DOC_LABEL[input.docType]} ${input.docNo}`, billingDate: input.billingDate, clientId: input.clientId,
      projectId: input.projectId ?? null, status, vatTreatment: input.vatTreatment, vatBasis, gross, net, vat,
      lines: lines.map((l) => ({ amount: l.amount, revenueAccount: l.revenueAccount ?? null })),
    }),
  );
  await bumpVersion(tx, orgId, ["billings", "journal_entries"]);
  return id;
}

/** Change workflow status. Void/rejected reverse the posting; only unpaid billings can be voided. */
export async function setBillingStatus(tx: Tx, orgId: string, billingId: string, status: string, reason?: string) {
  const [b] = await tx<{ id: string; status: string; paid_c: number; cwt_c: number; doc_type: string; doc_no: string }[]>`
    select id, status, paid_c, cwt_c, doc_type, doc_no from v_billing_balances where id = ${billingId} and org_id = ${orgId}`;
  if (!b) throw new UserInputError("Billing not found.");
  if ((status === "void" || status === "rejected" || status === "draft") && b.paid_c + b.cwt_c > 0) {
    throw new UserInputError("This billing already has payments. Remove the payments first.");
  }
  await tx`update billings set status = ${status}, status_reason = ${reason ?? null} where id = ${billingId}`;
  const wasPosting = !["draft", "void", "rejected"].includes(b.status);
  const nowPosting = !["draft", "void", "rejected"].includes(status);
  if (wasPosting !== nowPosting) {
    if (!nowPosting) {
      await postDocument(tx, orgId, "billing", billingId, null);
    } else {
      await repostBilling(tx, orgId, billingId);
    }
  }
  await bumpVersion(tx, orgId, ["billings"]);
}

async function repostBilling(tx: Tx, orgId: string, billingId: string) {
  const [b] = await tx<{ id: string; doc_type: string; doc_no: string; billing_date: string; client_id: string; project_id: string | null; status: string;
    vat_treatment: "vat" | "zero_rated" | "exempt" | "non_vat"; vat_basis: "collected" | "billed"; gross_c: number; net_c: number; vat_c: number }[]>`
    select * from billings where id = ${billingId}`;
  if (!b) return;
  const lines = await tx<{ amount_c: number }[]>`select amount_c from billing_lines where billing_id = ${billingId} order by line_no`;
  await postDocument(tx, orgId, "billing", billingId, postBilling({
    id: b.id, docLabel: `${DOC_LABEL[b.doc_type]} ${b.doc_no}`, billingDate: b.billing_date, clientId: b.client_id, projectId: b.project_id,
    status: b.status, vatTreatment: b.vat_treatment, vatBasis: b.vat_basis, gross: b.gross_c, net: b.net_c, vat: b.vat_c,
    lines: lines.map((l) => ({ amount: l.amount_c })),
  }));
}

// ───────────────────────────── Collections ─────────────────────────────

export interface CollectionInput {
  clientId: string;
  collectionDate: ISODate;
  receiptType: "sales_invoice" | "official_receipt" | "collection_receipt" | "acknowledgement_receipt" | "none";
  receiptNo?: string | null;
  paymentMode: "cash" | "bank_deposit" | "cheque_deposit" | "cheque_pickup" | "online_bank" | "bank_wire" | "gcash" | "offsetting";
  paymentReference?: string | null;
  depositAccountId: string;
  cash: Centavos;
  form2307Status?: "not_required" | "pending" | "received" | "for_revision";
  remarks?: string | null;
  allocations: { billingId: string; applied: Centavos; cwt: Centavos }[];
  source?: { type: string; id: string; rowKey: string; hash?: string };
}

export async function createCollection(tx: Tx, orgId: string, input: CollectionInput): Promise<string> {
  const allocs = input.allocations.filter((a) => a.applied > 0 || a.cwt > 0);
  const cwt = sum(allocs.map((a) => a.cwt));
  if (input.cash <= 0 && cwt <= 0) throw new UserInputError("Enter the amount received.");

  const [acct] = await tx<{ code: string }[]>`
    select a.code from bank_accounts b join accounts a on a.id = b.gl_account_id where b.id = ${input.depositAccountId} and b.org_id = ${orgId}`;
  if (!acct) throw new UserInputError("Choose where the money was deposited.");

  const ids = allocs.map((a) => a.billingId);
  if (ids.length) await tx`select id from billings where id in ${tx(ids)} for update`;
  const bal = ids.length
    ? await tx<{ id: string; client_id: string; doc_type: string; doc_no: string; gross_c: number; vat_c: number; vat_basis: "collected" | "billed"; balance_c: number; vat_reclass_c: number; project_id: string | null; status: string }[]>`
        select id, client_id, doc_type, doc_no, gross_c, vat_c, vat_basis, balance_c, vat_reclass_c, project_id, status from v_billing_balances where id in ${tx(ids)}`
    : [];
  const byId = new Map(bal.map((b) => [b.id, b]));

  const postingAllocs: CollectionForPosting["allocations"] = allocs.map((a) => {
    const b = byId.get(a.billingId);
    if (!b) throw new UserInputError("A selected billing no longer exists.");
    if (b.client_id !== input.clientId) throw new UserInputError(`${DOC_LABEL[b.doc_type]} ${b.doc_no} belongs to another client.`);
    if (["void", "rejected", "draft"].includes(b.status)) throw new UserInputError(`${DOC_LABEL[b.doc_type]} ${b.doc_no} is ${b.status} and cannot be paid.`);
    if (a.applied + a.cwt > b.balance_c) {
      throw new UserInputError(`${DOC_LABEL[b.doc_type]} ${b.doc_no}: payment is more than the open balance.`);
    }
    return {
      billingId: b.id,
      billingLabel: `${DOC_LABEL[b.doc_type]} ${b.doc_no}`,
      applied: a.applied,
      cwt: a.cwt,
      billing: { gross: b.gross_c, vat: b.vat_c, vatBasis: b.vat_basis, projectId: b.project_id },
      deferredVatRemaining: b.vat_basis === "collected" ? b.vat_c - b.vat_reclass_c : 0,
      settlesBilling: a.applied + a.cwt === b.balance_c,
    };
  });

  const label = input.receiptNo ? `${receiptAbbrev(input.receiptType)} ${input.receiptNo}` : input.collectionDate;
  let draft;
  try {
    draft = postCollection({
      id: "new", label, collectionDate: input.collectionDate, clientId: input.clientId, depositAccount: acct.code,
      cash: input.cash, cwt, allocations: postingAllocs,
    });
  } catch (e) {
    if (e instanceof PostingError) throw new UserInputError(e.message);
    throw e;
  }

  const [row] = await tx<{ id: string }[]>`
    insert into collections (org_id, client_id, collection_date, receipt_type, receipt_no, payment_mode, payment_reference,
                             deposit_account_id, cash_c, cwt_c, form_2307_status, remarks, source_type, source_id, source_row_key, content_hash)
    values (${orgId}, ${input.clientId}, ${input.collectionDate}, ${input.receiptType}, ${input.receiptNo ?? null}, ${input.paymentMode},
            ${input.paymentReference ?? null}, ${input.depositAccountId}, ${input.cash}, ${cwt},
            ${input.form2307Status ?? (cwt > 0 ? "pending" : "not_required")}, ${input.remarks ?? null},
            ${input.source?.type ?? null}, ${input.source?.id ?? null}, ${input.source?.rowKey ?? null}, ${input.source?.hash ?? null})
    returning id`;
  const id = row!.id;
  if (postingAllocs.length) {
    await tx`insert into collection_allocations ${tx(
      postingAllocs.map((a) => ({
        org_id: orgId, collection_id: id, billing_id: a.billingId, applied_c: a.applied, cwt_c: a.cwt, vat_reclass_c: deferredVatToMove(a),
      })),
    )}`;
    // Fully settled billings become Paid.
    await tx`update billings b set status = 'paid'
             from v_billing_balances v where v.id = b.id and b.id in ${tx(ids)} and v.balance_c = 0 and b.status <> 'paid'`;
  }
  await postDocument(tx, orgId, "collection", id, { ...draft, memo: `Collection ${label}` });
  await bumpVersion(tx, orgId, ["collections", "billings", "journal_entries"]);
  return id;
}

function receiptAbbrev(t: string) {
  return { sales_invoice: "SI", official_receipt: "OR", collection_receipt: "CR", acknowledgement_receipt: "AR", none: "" }[t] ?? "";
}

// ───────────────────────────── Purchases ─────────────────────────────

export interface PurchaseInput {
  supplierId: string;
  projectId?: string | null;
  docType: "sales_invoice" | "official_receipt" | "collection_receipt" | "billing_invoice" | "cash_invoice" | "delivery_receipt" | "acknowledgement" | "none";
  referenceNo?: string | null;
  invoiceDate: ISODate;
  termsDays: number;
  vatTreatment: "vat" | "zero_rated" | "exempt" | "non_vat";
  noReceipt?: boolean;
  ewtRateBp?: number;
  description?: string | null;
  approvalStatus?: "to_be_processed" | "for_revision" | "approved_in_process";
  lines: { categoryId: string; description?: string | null; gross: Centavos }[];
  source?: { type: string; id: string; rowKey: string; hash?: string };
}

export async function createPurchase(tx: Tx, orgId: string, input: PurchaseInput): Promise<string> {
  const lines0 = input.lines.filter((l) => l.gross > 0);
  if (!lines0.length) throw new UserInputError("Add at least one expense line with an amount.");
  const claimVat = input.vatTreatment === "vat" && !input.noReceipt;
  const catIds = [...new Set(lines0.map((l) => l.categoryId))];
  const cats = await tx<{ id: string; code: string }[]>`
    select c.id, a.code from expense_categories c join accounts a on a.id = c.account_id where c.id in ${tx(catIds)} and c.org_id = ${orgId}`;
  const codeOf = new Map(cats.map((c) => [c.id, c.code]));
  const lines = lines0.map((l) => {
    const code = codeOf.get(l.categoryId);
    if (!code) throw new UserInputError("Unknown expense category.");
    const { net, vat } = claimVat ? splitVatInclusive(l.gross) : { net: l.gross, vat: 0 };
    return { ...l, code, net, vat };
  });
  const total = sum(lines.map((l) => l.gross));
  const net = sum(lines.map((l) => l.net));
  const inputVat = sum(lines.map((l) => l.vat));
  const ewt = withholdingOnNet(net, input.ewtRateBp ?? 0);

  const [row] = await tx<{ id: string }[]>`
    insert into purchases (org_id, supplier_id, project_id, doc_type, reference_no, invoice_date, terms_days, due_date, description,
                           vat_treatment, total_c, net_c, input_vat_c, ewt_c, no_receipt, approval_status,
                           source_type, source_id, source_row_key, content_hash)
    values (${orgId}, ${input.supplierId}, ${input.projectId ?? null}, ${input.docType}, ${input.referenceNo ?? null}, ${input.invoiceDate},
            ${input.termsDays}, ${addDays(input.invoiceDate, input.termsDays)}, ${input.description ?? null}, ${input.vatTreatment},
            ${total}, ${net}, ${inputVat}, ${ewt}, ${input.noReceipt ?? false}, ${input.approvalStatus ?? "approved_in_process"},
            ${input.source?.type ?? null}, ${input.source?.id ?? null}, ${input.source?.rowKey ?? null}, ${input.source?.hash ?? null})
    returning id`;
  const id = row!.id;
  await tx`insert into purchase_lines ${tx(
    lines.map((l, i) => ({
      org_id: orgId, purchase_id: id, line_no: i + 1, category_id: l.categoryId, description: l.description ?? null,
      gross_c: l.gross, net_c: l.net, vat_c: l.vat, project_id: input.projectId ?? null,
    })),
  )}`;
  await postDocument(tx, orgId, "purchase", id, postPurchase({
    id, label: input.referenceNo || input.invoiceDate, invoiceDate: input.invoiceDate, supplierId: input.supplierId,
    projectId: input.projectId ?? null, total, inputVat, ewt,
    lines: lines.map((l) => ({ account: l.code, net: l.net, vat: l.vat })),
  }));
  await bumpVersion(tx, orgId, ["purchases", "journal_entries"]);
  return id;
}

export interface ApPaymentInput {
  supplierId: string;
  paymentDate: ISODate;
  paymentMode: "bizlink" | "bank_transfer_spenmo" | "gcash_spenmo" | "gcash_reimbursement" | "cheque" | "bpi_check" | "cash" | "lalamove_wallet" | "paymaya" | "credit_card" | "project_offsetting";
  paidFromAccountId: string;
  referenceNo?: string | null;
  remarks?: string | null;
  allocations: { purchaseId: string; applied: Centavos }[];
  /** Extra paid beyond the bills (advance). Defaults to 0. */
  advance?: Centavos;
  source?: { type: string; id: string; rowKey: string; hash?: string };
}

export async function createApPayment(tx: Tx, orgId: string, input: ApPaymentInput): Promise<string> {
  const allocs = input.allocations.filter((a) => a.applied > 0);
  const amount = sum(allocs.map((a) => a.applied)) + (input.advance ?? 0);
  if (amount <= 0) throw new UserInputError("Enter the amount paid.");
  const [acct] = await tx<{ code: string }[]>`
    select a.code from bank_accounts b join accounts a on a.id = b.gl_account_id where b.id = ${input.paidFromAccountId} and b.org_id = ${orgId}`;
  if (!acct) throw new UserInputError("Choose the account the payment came from.");

  const ids = allocs.map((a) => a.purchaseId);
  if (ids.length) {
    await tx`select id from purchases where id in ${tx(ids)} for update`;
    const bal = await tx<{ id: string; supplier_id: string; balance_c: number; reference_no: string | null }[]>`
      select id, supplier_id, balance_c, reference_no from v_purchase_balances where id in ${tx(ids)}`;
    const byId = new Map(bal.map((b) => [b.id, b]));
    for (const a of allocs) {
      const b = byId.get(a.purchaseId);
      if (!b) throw new UserInputError("A selected bill no longer exists.");
      if (b.supplier_id !== input.supplierId) throw new UserInputError(`Bill ${b.reference_no ?? ""} belongs to another supplier.`);
      if (a.applied > b.balance_c) throw new UserInputError(`Bill ${b.reference_no ?? ""}: payment is more than the open balance.`);
    }
  }
  const [row] = await tx<{ id: string }[]>`
    insert into ap_payments (org_id, supplier_id, payment_date, payment_mode, paid_from_account_id, amount_c, reference_no, remarks,
                             source_type, source_id, source_row_key, content_hash)
    values (${orgId}, ${input.supplierId}, ${input.paymentDate}, ${input.paymentMode}, ${input.paidFromAccountId}, ${amount},
            ${input.referenceNo ?? null}, ${input.remarks ?? null},
            ${input.source?.type ?? null}, ${input.source?.id ?? null}, ${input.source?.rowKey ?? null}, ${input.source?.hash ?? null})
    returning id`;
  const id = row!.id;
  if (allocs.length) {
    await tx`insert into ap_payment_allocations ${tx(allocs.map((a) => ({ org_id: orgId, ap_payment_id: id, purchase_id: a.purchaseId, applied_c: a.applied })))}`;
    await tx`update purchases p set approval_status = 'paid'
             from v_purchase_balances v where v.id = p.id and p.id in ${tx(ids)} and v.balance_c = 0`;
  }
  await postDocument(tx, orgId, "ap_payment", id, postApPayment({
    id, label: input.referenceNo || input.paymentDate, paymentDate: input.paymentDate, supplierId: input.supplierId,
    paidFromAccount: acct.code, amount, allocations: allocs,
  }));
  await bumpVersion(tx, orgId, ["ap_payments", "purchases", "journal_entries"]);
  return id;
}
