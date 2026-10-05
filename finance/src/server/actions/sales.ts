"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizeTin } from "@/lib/domain/parties";
import { withUser } from "../db";
import { createBilling, createCollection, setBillingStatus } from "../documents";
import { requireEditor } from "../session";
import { isoDate, optionalText, peso, toError, uuid, type ActionResult } from "./util";

const billingSchema = z.object({
  clientId: uuid,
  projectId: uuid.nullable().optional(),
  docType: z.enum(["sales_invoice", "billing_invoice", "billing_statement", "or_converted_invoice"]),
  docNo: z.string().trim().min(1, "Enter the document number."),
  billingDate: isoDate,
  termsDays: z.coerce.number().int().min(0).max(365),
  poNumber: optionalText,
  jobType: optionalText,
  description: optionalText,
  vatTreatment: z.enum(["vat", "zero_rated", "exempt", "non_vat"]),
  cwtRateBp: z.coerce.number().int().min(0).max(1500),
  status: z.enum(["draft", "billed", "for_collection"]),
  lines: z
    .array(z.object({ description: z.string().trim().min(1, "Each line needs a description."), qty: z.coerce.number().positive("Quantity must be more than zero."), unitPrice: peso, revenueAccount: z.string().optional() }))
    .min(1, "Add at least one line."),
});

export async function createBillingAction(input: unknown): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const data = billingSchema.parse(input);
    const id = await withUser(s, (tx) => createBilling(tx, s.orgId, data));
    revalidatePath("/billings");
    revalidatePath("/dashboard");
    return { ok: true, id };
  } catch (e) {
    return toError(e);
  }
}

export async function setBillingStatusAction(billingId: string, status: string, reason?: string): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const st = z.enum(["draft", "billed", "for_collection", "due_follow_up", "rejected", "void"]).parse(status);
    await withUser(s, (tx) => setBillingStatus(tx, s.orgId, uuid.parse(billingId), st, reason));
    revalidatePath(`/billings/${billingId}`);
    revalidatePath("/billings");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function addFollowUpNoteAction(billingId: string, note: string, nextDate?: string): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const n = z.string().trim().min(1, "Write a note first.").max(1000).parse(note);
    const d = nextDate ? isoDate.parse(nextDate) : null;
    await withUser(s, (tx) => tx`insert into follow_up_notes (org_id, billing_id, note, next_follow_up_date) values (${s.orgId}, ${uuid.parse(billingId)}, ${n}, ${d})`);
    revalidatePath(`/billings/${billingId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

const collectionSchema = z.object({
  clientId: uuid,
  collectionDate: isoDate,
  receiptType: z.enum(["sales_invoice", "official_receipt", "collection_receipt", "acknowledgement_receipt", "none"]),
  receiptNo: optionalText,
  paymentMode: z.enum(["cash", "bank_deposit", "cheque_deposit", "cheque_pickup", "online_bank", "bank_wire", "gcash", "offsetting"]),
  paymentReference: optionalText,
  depositAccountId: uuid,
  cash: peso,
  form2307Status: z.enum(["not_required", "pending", "received", "for_revision"]),
  remarks: optionalText,
  allocations: z.array(z.object({ billingId: uuid, applied: peso, cwt: peso })),
});

export async function createCollectionAction(input: unknown): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const data = collectionSchema.parse(input);
    const id = await withUser(s, (tx) => createCollection(tx, s.orgId, data));
    revalidatePath("/collections");
    revalidatePath("/billings");
    revalidatePath("/dashboard");
    return { ok: true, id };
  } catch (e) {
    return toError(e);
  }
}

/** Open billings for the collection form. */
export async function openBillingsForClient(clientId: string) {
  const s = await requireEditor();
  return withUser(s, (tx) => tx<{ id: string; doc_type: string; doc_no: string; billing_date: string; due_date: string; gross_c: number; net_c: number; balance_c: number; cwt_rate_bp: number; cwt_c: number }[]>`
    select v.id, v.doc_type, v.doc_no, v.billing_date, v.due_date, v.gross_c, v.net_c, v.balance_c, b.cwt_rate_bp, v.cwt_c
    from v_billing_balances v join billings b on b.id = v.id
    where v.client_id = ${uuid.parse(clientId)} and v.balance_c > 0 and v.status not in ('void','rejected','draft')
    order by v.due_date`);
}

const partySchema = z.object({
  name: z.string().trim().min(2, "Enter the name."),
  tin: optionalText,
  address: optionalText,
  contactPerson: optionalText,
  email: z.string().trim().email("Enter a valid email.").optional().or(z.literal("")).transform((v) => v || null),
  phone: optionalText,
  termsDays: z.coerce.number().int().min(0).max(365),
  vatStatus: z.enum(["vat", "non_vat", "zero_rated", "exempt"]),
  rateBp: z.coerce.number().int().min(0).max(1500),
  supplierType: z.enum(["goods", "services", "professional", "rental", "utilities", "government", "other"]).optional(),
  notes: optionalText,
});

function splitTin(raw: string | null) {
  if (!raw) return { tin: null, branch: null };
  const t = normalizeTin(raw);
  if (!t) throw new z.ZodError([{ code: "custom", path: ["tin"], message: "TIN must have 9 digits (plus an optional branch code), e.g. 123-456-789-000.", input: raw }]);
  return { tin: t.tin, branch: t.branch };
}

export async function saveClientAction(id: string | null, input: unknown): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const d = partySchema.parse(input);
    const { tin, branch } = splitTin(d.tin);
    const newId = await withUser(s, async (tx) => {
      if (id) {
        await tx`update clients set name = ${d.name}, tin = ${tin}, tin_branch = ${branch}, address = ${d.address}, contact_person = ${d.contactPerson},
                 email = ${d.email}, phone = ${d.phone}, terms_days = ${d.termsDays}, vat_status = ${d.vatStatus}, cwt_rate_bp = ${d.rateBp}, notes = ${d.notes}
                 where id = ${uuid.parse(id)} and org_id = ${s.orgId}`;
        return id;
      }
      const [r] = await tx<{ id: string }[]>`
        insert into clients (org_id, name, tin, tin_branch, address, contact_person, email, phone, terms_days, vat_status, cwt_rate_bp, notes)
        values (${s.orgId}, ${d.name}, ${tin}, ${branch}, ${d.address}, ${d.contactPerson}, ${d.email}, ${d.phone}, ${d.termsDays}, ${d.vatStatus}, ${d.rateBp}, ${d.notes})
        returning id`;
      return r!.id;
    });
    revalidatePath("/clients");
    return { ok: true, id: newId };
  } catch (e) {
    return toError(e);
  }
}

export async function saveSupplierAction(id: string | null, input: unknown): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const d = partySchema.parse(input);
    const { tin, branch } = splitTin(d.tin);
    const newId = await withUser(s, async (tx) => {
      if (id) {
        await tx`update suppliers set name = ${d.name}, tin = ${tin}, tin_branch = ${branch}, address = ${d.address}, contact_person = ${d.contactPerson},
                 email = ${d.email}, phone = ${d.phone}, terms_days = ${d.termsDays}, vat_status = ${d.vatStatus}, ewt_rate_bp = ${d.rateBp},
                 supplier_type = ${d.supplierType ?? "goods"}, notes = ${d.notes}
                 where id = ${uuid.parse(id)} and org_id = ${s.orgId}`;
        return id;
      }
      const [r] = await tx<{ id: string }[]>`
        insert into suppliers (org_id, name, tin, tin_branch, address, contact_person, email, phone, terms_days, vat_status, ewt_rate_bp, supplier_type, notes)
        values (${s.orgId}, ${d.name}, ${tin}, ${branch}, ${d.address}, ${d.contactPerson}, ${d.email}, ${d.phone}, ${d.termsDays}, ${d.vatStatus}, ${d.rateBp},
                ${d.supplierType ?? "goods"}, ${d.notes})
        returning id`;
      return r!.id;
    });
    revalidatePath("/suppliers");
    return { ok: true, id: newId };
  } catch (e) {
    return toError(e);
  }
}

/** Merge client `fromId` into `intoId`: documents move over, the duplicate is kept but marked merged. */
export async function mergeClientsAction(fromId: string, intoId: string): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const [from, into] = [uuid.parse(fromId), uuid.parse(intoId)];
    if (from === into) return { ok: false, error: "Pick two different clients." };
    await withUser(s, async (tx) => {
      const [f] = await tx<{ name: string }[]>`select name from clients where id = ${from}`;
      await tx`update billings set client_id = ${into} where client_id = ${from}`;
      await tx`update collections set client_id = ${into} where client_id = ${from}`;
      await tx`update projects set client_id = ${into} where client_id = ${from}`;
      await tx`update journal_lines set party_id = ${into} where party_type = 'client' and party_id = ${from}`;
      await tx`update clients set merged_into_id = ${into}, deleted_at = now() where id = ${from}`;
      if (f) {
        const { companyKey } = await import("@/lib/domain/parties");
        await tx`insert into party_aliases (org_id, party_type, party_id, alias_normalized, source, approved_by)
                 values (${s.orgId}, 'client', ${into}, ${companyKey(f.name)}, 'merge', ${s.userId}) on conflict do nothing`;
      }
    });
    revalidatePath("/clients");
    return { ok: true, message: "Clients merged." };
  } catch (e) {
    return toError(e);
  }
}

const projectSchema = z.object({
  ceNumber: z.string().trim().min(2, "Enter the CE#."),
  name: z.string().trim().min(2, "Enter a project name."),
  clientId: uuid.nullable(),
  poNumber: optionalText,
  jobType: optionalText,
  quoted: peso.optional(),
  status: z.enum(["quoted", "ongoing", "completed", "billed", "cancelled"]),
  startDate: isoDate.optional().or(z.literal("")).transform((v) => v || null),
});

export async function saveProjectAction(input: unknown): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const d = projectSchema.parse(input);
    const { ceKey } = await import("@/lib/domain/parties");
    const id = await withUser(s, async (tx) => {
      const [r] = await tx<{ id: string }[]>`
        insert into projects (org_id, ce_number, ce_key, name, client_id, po_number, job_type, quoted_c, status, start_date)
        values (${s.orgId}, ${d.ceNumber}, ${ceKey(d.ceNumber)}, ${d.name}, ${d.clientId}, ${d.poNumber}, ${d.jobType}, ${d.quoted ?? null}, ${d.status}, ${d.startDate})
        returning id`;
      return r!.id;
    });
    revalidatePath("/projects");
    return { ok: true, id };
  } catch (e) {
    return toError(e);
  }
}
