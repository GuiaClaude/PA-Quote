"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import Decimal from "decimal.js";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { pesosToCentavos } from "@/lib/money";
import { specSchema, specSignature } from "@/lib/specs";
import { processUploadedFile } from "@/lib/files/process";
import { extractEstimate, type Extraction, MODEL } from "@/lib/pricing/autofill";
import type { ActionState } from "./account";

const uuid = z.uuid();
async function priceStaff() { const me = await getSessionUser(); return (me?.staffRole === "pa_admin" || me?.staffRole === "pa_sales") && !me.needsMfa ? me : null; }

/** Staff uploaded the original estimate file (print-files bucket) — create a draft estimate. */
export async function createEstimateFromUpload(raw: { organizationId: string; printItemId: string | null; path: string; name: string; size: number }): Promise<{ id?: string; error?: string }> {
  const me = await priceStaff();
  if (!me || !uuid.safeParse(raw.organizationId).success) return { error: "Not allowed." };
  if (!raw.path.startsWith(`${raw.organizationId}/estimates/`) || raw.path.includes("..")) return { error: "Invalid upload." };
  const sb = await supabaseServer();
  const { data: file, error } = await sb.from("files").insert({
    organization_id: raw.organizationId, purpose: "estimate_original", kind: "upload", bucket: "print-files", storage_path: raw.path,
    original_name: raw.name.slice(0, 255), size_bytes: raw.size, uploaded_by: me.id,
  }).select("id").single();
  if (error || !file) return { error: "You can't add estimates for this client." };
  const { data: est, error: eErr } = await sb.from("past_estimates").insert({
    organization_id: raw.organizationId, print_item_id: raw.printItemId && uuid.safeParse(raw.printItemId).success ? raw.printItemId : null,
    estimate_date: new Date().toISOString().slice(0, 10), status: "draft", extracted_by: "staff", original_file_id: file.id, created_by: me.id,
  }).select("id").single();
  if (eErr || !est) return { error: "Could not create the estimate." };
  after(async () => { await processUploadedFile(file.id as string); });
  await audit({ action: "estimate.uploaded", actorId: me.id, organizationId: raw.organizationId, entityType: "past_estimate", entityId: est.id as string, meta: { name: raw.name } });
  return { id: est.id as string };
}

/** Start an estimate with no file (typed in from paper). */
export async function createEmptyEstimate(fd: FormData): Promise<void> {
  const me = await priceStaff();
  const org = String(fd.get("organizationId") ?? "");
  if (!me || !uuid.safeParse(org).success) return;
  const sb = await supabaseServer();
  const { data } = await sb.from("past_estimates").insert({ organization_id: org, estimate_date: new Date().toISOString().slice(0, 10), status: "draft", created_by: me.id }).select("id").single();
  if (data) redirect(`/staff/estimates/${data.id}`);
}

const saveInput = z.object({
  id: uuid, printItemId: uuid.nullable(), estimateNo: z.string().max(60), estimateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vatInclusive: z.boolean(), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), notes: z.string().max(2000),
  extractedBy: z.enum(["staff", "ai", "import"]),
  spec: z.record(z.string(), z.unknown()),
  lines: z.array(z.object({ quantity: z.number().int().positive().max(10_000_000), unitPrice: z.string(), total: z.string() })).max(20),
  charges: z.array(z.object({ label: z.string().trim().min(1).max(80), amount: z.string(), recharge: z.boolean() })).max(20),
});

/** Save the draft (lines and charges are replaced). Confirmed estimates are read-only. */
export async function saveEstimate(raw: z.infer<typeof saveInput>): Promise<ActionState> {
  const me = await priceStaff();
  if (!me) return { error: "Not allowed." };
  const p = saveInput.safeParse(raw);
  if (!p.success) return { error: "Check the dates, quantities and prices." };
  const d = p.data;
  const spec = specSchema.safeParse(d.spec);
  if (!spec.success) return { error: "Check the specs." };
  let lines, charges;
  try {
    lines = d.lines.map((l) => {
      // Either total or unit price may be typed; the other is derived exactly.
      const total = l.total.trim() ? pesosToCentavos(l.total) : new Decimal(l.unitPrice.replace(/[₱,\s]/g, "")).mul(l.quantity).mul(100).toDecimalPlaces(0).toNumber();
      const unit = l.unitPrice.trim() ? new Decimal(l.unitPrice.replace(/[₱,\s]/g, "")).toFixed(4) : new Decimal(total).div(100).div(l.quantity).toFixed(4);
      if (total <= 0) throw new Error();
      return { quantity: l.quantity, unit, total };
    });
    charges = d.charges.map((c) => ({ label: c.label, amount: pesosToCentavos(c.amount), recharge: c.recharge }));
  } catch {
    return { error: "Type prices as numbers, e.g. 18.50 or 1,850.00." };
  }
  if (new Set(lines.map((l) => l.quantity)).size !== lines.length) return { error: "Each quantity can appear only once." };
  const sb = await supabaseServer();
  const { data: est } = await sb.from("past_estimates").select("organization_id, status").eq("id", d.id).maybeSingle();
  if (!est) return { error: "Estimate not found." };
  if (est.status === "confirmed") return { error: "This estimate is confirmed and can't be changed. Upload a newer estimate instead." };
  const sig = specSignature(spec.data);
  const { error } = await sb.from("past_estimates").update({
    print_item_id: d.printItemId, estimate_no: d.estimateNo || null, estimate_date: d.estimateDate, vat_inclusive: d.vatInclusive,
    valid_until: d.validUntil, notes: d.notes || null, extracted_by: d.extractedBy,
  }).eq("id", d.id);
  if (error) return { error: "Could not save." };
  await sb.from("past_estimate_lines").delete().eq("past_estimate_id", d.id);
  await sb.from("past_estimate_charges").delete().eq("past_estimate_id", d.id);
  if (lines.length) await sb.from("past_estimate_lines").insert(lines.map((l) => ({ organization_id: est.organization_id, past_estimate_id: d.id, spec: spec.data, spec_signature: sig, quantity: l.quantity, unit_price: l.unit, total_centavos: l.total })));
  if (charges.length) await sb.from("past_estimate_charges").insert(charges.map((c) => ({ organization_id: est.organization_id, past_estimate_id: d.id, label: c.label, amount_centavos: c.amount, recharge_on_reorder: c.recharge })));
  await audit({ action: "estimate.saved", actorId: me.id, organizationId: est.organization_id, entityType: "past_estimate", entityId: d.id, meta: { lines, charges, extracted_by: d.extractedBy } });
  revalidatePath(`/staff/estimates/${d.id}`);
  return { message: "Draft saved." };
}

export async function confirmEstimate(id: string): Promise<ActionState> {
  const me = await priceStaff();
  if (!me || !uuid.safeParse(id).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("confirm_past_estimate", { p_estimate_id: id });
  if (error) return { error: error.message };
  await audit({ action: "estimate.confirmed", actorId: me.id, actorEmail: me.email, entityType: "past_estimate", entityId: id, meta: { tiers_updated: data } });
  revalidatePath(`/staff/estimates/${id}`);
  return { message: data ? `Confirmed. ${data} agreed price${data === 1 ? "" : "s"} updated — instant reorder quotes now start from them.` : "Confirmed. The item already has newer agreed prices, so none were replaced." };
}

/** Optional, paid: read the original file with the Claude API to pre-fill the form. Nothing is saved. */
export async function autofillEstimate(id: string): Promise<{ data?: Extraction; error?: string }> {
  const me = await priceStaff();
  if (!me || !uuid.safeParse(id).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { data: est } = await sb.from("past_estimates").select("organization_id, files!past_estimates_original_file_id_fkey(bucket, storage_path)").eq("id", id).maybeSingle();
  const f = est?.files as unknown as { bucket: string; storage_path: string } | null;
  if (!est || !f) return { error: "Upload the estimate file first." };
  const { data: blob } = await supabaseAdmin().storage.from(f.bucket).download(f.storage_path);
  if (!blob) return { error: "Could not open the file." };
  const result = await extractEstimate(new Uint8Array(await blob.arrayBuffer()));
  await audit({ action: "estimate.ai_autofill", actorId: me.id, organizationId: est.organization_id, entityType: "past_estimate", entityId: id,
    meta: { model: MODEL, ok: Boolean(result.data), error: result.error ?? null, input_tokens: result.usage?.input, output_tokens: result.usage?.output } });
  return { data: result.data, error: result.error };
}

/** Make a Print Item from the estimate's specs (when the item doesn't exist yet). */
export async function createItemForEstimate(estimateId: string, name: string, spec: Record<string, unknown>): Promise<{ id?: string; error?: string }> {
  const me = await priceStaff();
  if (!me || !uuid.safeParse(estimateId).success || name.trim().length < 2) return { error: "Type the item name." };
  const s = specSchema.safeParse(spec);
  if (!s.success) return { error: "Check the specs." };
  const sb = await supabaseServer();
  const { data: est } = await sb.from("past_estimates").select("organization_id").eq("id", estimateId).maybeSingle();
  if (!est) return { error: "Estimate not found." };
  const { data: item, error } = await sb.from("print_items").insert({ organization_id: est.organization_id, name: name.trim().slice(0, 160), spec: s.data, spec_signature: specSignature(s.data), created_by: me.id }).select("id").single();
  if (error || !item) return { error: "Could not create the item." };
  await sb.rpc("create_artwork_version", { p_print_item_id: item.id, p_change_notes: "Created from a past estimate — add the approved file" });
  await sb.from("past_estimates").update({ print_item_id: item.id }).eq("id", estimateId);
  revalidatePath(`/staff/estimates/${estimateId}`);
  return { id: item.id as string };
}

const importRow = z.object({
  client_name: z.string().trim().min(2), item_code: z.string().trim().min(1), estimate_no: z.string().trim().min(1),
  estimate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "estimate_date must be YYYY-MM-DD"),
  vat_inclusive: z.string().trim().transform((v) => !/^(no|false|0|excl)/i.test(v)), quantity: z.string().regex(/^\d+$/, "quantity must be a whole number"),
  total_price: z.string().min(1, "total_price is required"), valid_until: z.string().optional().default(""), notes: z.string().optional().default(""),
});

/** Bulk import of past estimates from CSV: one row per quantity line. */
export async function importEstimates(rows: unknown[], confirm: boolean): Promise<{ created: number; confirmed: number; problems: string[]; estimates: { estimateNo: string; id: string; organizationId: string }[]; error?: string }> {
  const out = { created: 0, confirmed: 0, problems: [] as string[], estimates: [] as { estimateNo: string; id: string; organizationId: string }[] };
  const me = await priceStaff();
  if (!me) return { ...out, error: "Not allowed." };
  if (!Array.isArray(rows) || !rows.length || rows.length > 2000) return { ...out, error: "Import 1 to 2,000 rows at a time." };
  const sb = await supabaseServer();
  const { data: orgs } = await sb.from("organizations").select("id, name");
  const orgByName = new Map((orgs ?? []).map((o) => [String(o.name).toLowerCase(), o.id as string]));
  const groups = new Map<string, { orgId: string; itemCode: string; r: z.infer<typeof importRow>; lines: { quantity: number; total: number }[] }>();
  rows.forEach((raw, i) => {
    const p = importRow.safeParse(raw);
    if (!p.success) { out.problems.push(`Row ${i + 2}: ${p.error.issues[0]?.message}`); return; }
    const orgId = orgByName.get(p.data.client_name.toLowerCase());
    if (!orgId) { out.problems.push(`Row ${i + 2}: client “${p.data.client_name}” not found (create it first).`); return; }
    let total: number; try { total = pesosToCentavos(p.data.total_price); } catch { out.problems.push(`Row ${i + 2}: total_price “${p.data.total_price}” isn't a peso amount.`); return; }
    const key = `${orgId}|${p.data.item_code}|${p.data.estimate_no}`;
    const g = groups.get(key) ?? { orgId, itemCode: p.data.item_code, r: p.data, lines: [] };
    g.lines.push({ quantity: Number(p.data.quantity), total });
    groups.set(key, g);
  });
  for (const g of groups.values()) {
    const { data: item } = await sb.from("print_items").select("id, spec, spec_signature").eq("organization_id", g.orgId).eq("code", g.itemCode).is("deleted_at", null).maybeSingle();
    if (!item) { out.problems.push(`${g.r.estimate_no}: item code “${g.itemCode}” not found for ${g.r.client_name}.`); continue; }
    const { data: est, error } = await sb.from("past_estimates").insert({
      organization_id: g.orgId, print_item_id: item.id, estimate_no: g.r.estimate_no, estimate_date: g.r.estimate_date, vat_inclusive: g.r.vat_inclusive,
      valid_until: g.r.valid_until || null, notes: g.r.notes || null, status: "draft", extracted_by: "import", created_by: me.id,
    }).select("id").single();
    if (error || !est) { out.problems.push(`${g.r.estimate_no}: could not be saved.`); continue; }
    await sb.from("past_estimate_lines").insert(g.lines.map((l) => ({ organization_id: g.orgId, past_estimate_id: est.id, spec: item.spec, spec_signature: item.spec_signature,
      quantity: l.quantity, unit_price: new Decimal(l.total).div(100).div(l.quantity).toFixed(4), total_centavos: l.total })));
    out.created++;
    out.estimates.push({ estimateNo: g.r.estimate_no, id: est.id as string, organizationId: g.orgId });
    if (confirm) { const { error: cErr } = await sb.rpc("confirm_past_estimate", { p_estimate_id: est.id }); if (!cErr) out.confirmed++; }
  }
  await audit({ action: "estimate.imported", actorId: me.id, actorEmail: me.email, meta: { rows: rows.length, created: out.created, confirmed: out.confirmed, problems: out.problems.length } });
  revalidatePath("/staff/estimates");
  return out;
}

/** Attach an uploaded original file (from the bulk import) to an estimate. */
export async function attachEstimateOriginal(estimateId: string, path: string, name: string, size: number): Promise<ActionState> {
  const me = await priceStaff();
  if (!me || !uuid.safeParse(estimateId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { data: est } = await sb.from("past_estimates").select("organization_id").eq("id", estimateId).maybeSingle();
  if (!est || !path.startsWith(`${est.organization_id}/estimates/`)) return { error: "Not allowed." };
  const { data: file } = await sb.from("files").insert({ organization_id: est.organization_id, purpose: "estimate_original", kind: "upload", bucket: "print-files", storage_path: path, original_name: name.slice(0, 255), size_bytes: size, uploaded_by: me.id }).select("id").single();
  if (!file) return { error: "Could not save the file." };
  await sb.from("past_estimates").update({ original_file_id: file.id }).eq("id", estimateId);
  after(async () => { await processUploadedFile(file.id as string); });
  return { message: "Attached." };
}
