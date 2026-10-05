import type { BadgeTone } from "@/components/ui";

export const BILLING_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  billed: { label: "Billed", tone: "brand" },
  for_collection: { label: "For collection", tone: "brand" },
  due_follow_up: { label: "Due for follow-up", tone: "warn" },
  paid: { label: "Paid", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
  void: { label: "Void", tone: "neutral" },
};

/** Status shown to the user: unpaid billings past due display as "Due for follow-up". */
export function displayBillingStatus(status: string, balance: number, dueDate: string, today: string) {
  if ((status === "billed" || status === "for_collection") && balance > 0 && dueDate < today) return BILLING_STATUS.due_follow_up!;
  return BILLING_STATUS[status] ?? { label: status, tone: "neutral" as BadgeTone };
}

export const DOC_TYPE: Record<string, string> = {
  sales_invoice: "Sales invoice",
  billing_invoice: "Billing invoice",
  billing_statement: "Billing statement",
  or_converted_invoice: "OR converted invoice",
  official_receipt: "Official receipt",
  collection_receipt: "Collection receipt",
  acknowledgement_receipt: "Acknowledgement receipt",
  acknowledgement: "Acknowledgement",
  cash_invoice: "Cash invoice",
  delivery_receipt: "Delivery receipt",
  none: "No document",
};

export const DOC_SHORT: Record<string, string> = {
  sales_invoice: "SI", billing_invoice: "BI", billing_statement: "BS", or_converted_invoice: "OR-INV",
  official_receipt: "OR", collection_receipt: "CR", acknowledgement_receipt: "AR", acknowledgement: "AR", cash_invoice: "CI", delivery_receipt: "DR", none: "",
};

export const COLLECTION_MODES: Record<string, string> = {
  online_bank: "Online bank transfer",
  bank_deposit: "Bank deposit",
  cheque_pickup: "Cheque pick-up",
  cheque_deposit: "Cheque deposit",
  bank_wire: "Bank wire",
  gcash: "GCash",
  cash: "Cash",
  offsetting: "Offsetting",
};

export const AP_MODES: Record<string, string> = {
  bizlink: "BPI BizLink",
  bank_transfer_spenmo: "Bank transfer via Spenmo",
  gcash_spenmo: "GCash via Spenmo",
  gcash_reimbursement: "GCash for reimbursement",
  cheque: "Check payment",
  bpi_check: "BPI check",
  cash: "Cash",
  lalamove_wallet: "Lalamove wallet",
  paymaya: "PayMaya",
  credit_card: "Credit card",
  project_offsetting: "Project offsetting",
};

export const FORM_2307: Record<string, { label: string; tone: BadgeTone }> = {
  not_required: { label: "Not required", tone: "neutral" },
  pending: { label: "2307 pending", tone: "warn" },
  received: { label: "2307 received", tone: "good" },
  for_revision: { label: "2307 for revision", tone: "bad" },
};

export const APPROVAL: Record<string, { label: string; tone: BadgeTone }> = {
  to_be_processed: { label: "To be processed", tone: "neutral" },
  for_revision: { label: "For revision", tone: "bad" },
  approved_in_process: { label: "Approved", tone: "brand" },
  paid: { label: "Paid", tone: "good" },
  unpaid: { label: "Unpaid", tone: "warn" },
};

export const VAT_TREATMENT: Record<string, string> = { vat: "VAT (12%)", zero_rated: "Zero-rated", exempt: "VAT-exempt", non_vat: "Non-VAT" };
