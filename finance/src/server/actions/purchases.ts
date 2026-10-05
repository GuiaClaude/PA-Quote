"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "../db";
import { createApPayment, createPurchase } from "../documents";
import { requireEditor } from "../session";
import { isoDate, optionalText, peso, toError, uuid, type ActionResult } from "./util";

const purchaseSchema = z.object({
  supplierId: uuid,
  projectId: uuid.nullable().optional(),
  docType: z.enum(["sales_invoice", "official_receipt", "collection_receipt", "billing_invoice", "cash_invoice", "delivery_receipt", "acknowledgement", "none"]),
  referenceNo: optionalText,
  invoiceDate: isoDate,
  termsDays: z.coerce.number().int().min(0).max(365),
  vatTreatment: z.enum(["vat", "zero_rated", "exempt", "non_vat"]),
  noReceipt: z.boolean(),
  ewtRateBp: z.coerce.number().int().min(0).max(1500),
  description: optionalText,
  approvalStatus: z.enum(["to_be_processed", "for_revision", "approved_in_process"]),
  lines: z.array(z.object({ categoryId: uuid, description: optionalText, gross: peso })).min(1, "Add at least one line."),
});

export async function createPurchaseAction(input: unknown): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const data = purchaseSchema.parse(input);
    const id = await withUser(s, (tx) => createPurchase(tx, s.orgId, data));
    revalidatePath("/purchases");
    revalidatePath("/dashboard");
    return { ok: true, id };
  } catch (e) {
    return toError(e);
  }
}

const paymentSchema = z.object({
  supplierId: uuid,
  paymentDate: isoDate,
  paymentMode: z.enum(["bizlink", "bank_transfer_spenmo", "gcash_spenmo", "gcash_reimbursement", "cheque", "bpi_check", "cash", "lalamove_wallet", "paymaya", "credit_card", "project_offsetting"]),
  paidFromAccountId: uuid,
  referenceNo: optionalText,
  remarks: optionalText,
  advance: peso,
  allocations: z.array(z.object({ purchaseId: uuid, applied: peso })),
});

export async function createApPaymentAction(input: unknown): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const data = paymentSchema.parse(input);
    const id = await withUser(s, (tx) => createApPayment(tx, s.orgId, data));
    revalidatePath("/payments");
    revalidatePath("/purchases");
    revalidatePath("/dashboard");
    return { ok: true, id };
  } catch (e) {
    return toError(e);
  }
}

export async function openBillsForSupplier(supplierId: string) {
  const s = await requireEditor();
  return withUser(s, (tx) => tx<{ id: string; reference_no: string | null; invoice_date: string; due_date: string; payable_c: number; balance_c: number }[]>`
    select id, reference_no, invoice_date, due_date, payable_c, balance_c from v_purchase_balances
    where supplier_id = ${uuid.parse(supplierId)} and balance_c > 0 order by due_date`);
}
