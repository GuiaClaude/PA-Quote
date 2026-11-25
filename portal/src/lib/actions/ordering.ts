"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { requestMeta } from "@/lib/request-meta";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { newOrderStaffEmail, quoteRequestStaffEmail } from "@/lib/email/templates";
import { specSchema } from "@/lib/specs";
import type { ActionState } from "./account";

const uuid = z.uuid();
async function buyer() {
  const me = await getSessionUser();
  return me?.organizationId && (me.clientRole === "client_admin" || me.clientRole === "client_buyer") ? (me as typeof me & { organizationId: string }) : null;
}

async function emailStaff(orgId: string, mail: (company: string) => { subject: string; html: string; text: string }) {
  const admin = supabaseAdmin();
  const [{ data: org }, { data: staff }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", orgId).single(),
    admin.from("staff_assignments").select("profiles(email, is_active)").eq("organization_id", orgId),
  ]);
  for (const s of staff ?? []) {
    const p = s.profiles as unknown as { email: string; is_active: boolean } | null;
    if (p?.is_active) await sendEmail({ to: p.email, ...mail((org?.name as string) ?? "Client") });
  }
}

/** Client uploaded artwork for a new order / quote request to the attachments bucket. */
export async function recordOrderArtwork(input: { path: string; name: string; size: number; mime?: string }): Promise<{ id?: string; error?: string }> {
  const me = await buyer();
  if (!me) return { error: "Not allowed." };
  if (!input.path.startsWith(`${me.organizationId}/orders/`) || input.path.includes("..")) return { error: "Invalid upload." };
  const maxMb = (await getSetting("uploads")).max_file_mb;
  if (input.size > maxMb * 1024 * 1024) return { error: `Files must be ${maxMb} MB or smaller.` };
  const sb = await supabaseServer();
  const { data, error } = await sb.from("files").insert({
    organization_id: me.organizationId, purpose: "quote_request_artwork", kind: "upload", bucket: "attachments",
    storage_path: input.path, original_name: input.name.slice(0, 255), size_bytes: input.size, mime_type: input.mime ?? null, uploaded_by: me.id,
  }).select("id").single();
  return error || !data ? { error: "Could not save the file." } : { id: data.id as string };
}

const common = {
  addressId: uuid.nullable(), requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), clientPo: z.string().max(60).default(""),
  notes: z.string().max(2000).default(""), artworkFileIds: z.array(uuid).max(20), artworkLinks: z.array(z.string().url().max(500)).max(10),
  needsDesign: z.boolean(), draftId: uuid.nullable().optional(),
};

const standardInput = z.object({ standardPriceId: uuid, ...common });
export async function placeStandardOrder(input: z.infer<typeof standardInput>): Promise<{ orderId?: string; error?: string }> {
  const me = await buyer();
  if (!me) return { error: "Only company admins and buyers can place orders." };
  const p = standardInput.safeParse(input);
  if (!p.success) return { error: "Please check the form." };
  const d = p.data;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("place_standard_order", {
    p_standard_price_id: d.standardPriceId, p_address_id: d.addressId, p_requested_date: d.requestedDate, p_client_po: d.clientPo,
    p_notes: d.notes, p_artwork_file_ids: d.artworkFileIds, p_artwork_links: d.artworkLinks, p_needs_design: d.needsDesign,
  });
  if (error || !data) return { error: error?.message ?? "Could not place the order." };
  if (d.draftId) await sb.from("draft_orders").update({ deleted_at: new Date().toISOString() }).eq("id", d.draftId);
  await audit({ action: "order.placed", actorId: me.id, actorEmail: me.email, organizationId: me.organizationId, entityType: "order", entityId: data as string, meta: { standard_price_id: d.standardPriceId } });
  after(async () => {
    const { data: o } = await supabaseAdmin().from("orders").select("order_no, order_items(title, quantity)").eq("id", data).single();
    const it = (o?.order_items as { title: string; quantity: number }[] | undefined)?.[0];
    await emailStaff(me.organizationId, (company) => newOrderStaffEmail({ company, orderNo: o?.order_no as string, item: it?.title ?? "", quantity: it?.quantity ?? 0, url: `${env().NEXT_PUBLIC_SITE_URL}/staff/orders/${data}` }));
  });
  revalidatePath("/app", "layout");
  return { orderId: data as string };
}

const quoteInput = z.object({ productId: uuid, title: z.string().min(2).max(160), spec: z.record(z.string(), z.unknown()), quantities: z.array(z.number().int().positive().max(10_000_000)).min(1).max(8), ...common });
export async function requestQuote(input: z.infer<typeof quoteInput>): Promise<{ requestId?: string; error?: string }> {
  const me = await buyer();
  if (!me) return { error: "Only company admins and buyers can request quotes." };
  const p = quoteInput.safeParse(input);
  if (!p.success) return { error: "Please check the form." };
  const d = p.data;
  const spec = specSchema.safeParse(d.spec);
  if (!spec.success) return { error: "Please check the specs." };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("submit_quote_request", {
    p_product_id: d.productId, p_title: d.title, p_spec: spec.data, p_quantities: d.quantities, p_address_id: d.addressId,
    p_requested_date: d.requestedDate, p_client_po: d.clientPo, p_notes: d.notes, p_artwork_file_ids: d.artworkFileIds,
    p_artwork_links: d.artworkLinks, p_needs_design: d.needsDesign,
  });
  if (error || !data) return { error: error?.message ?? "Could not send the request." };
  if (d.draftId) await sb.from("draft_orders").update({ deleted_at: new Date().toISOString() }).eq("id", d.draftId);
  await audit({ action: "quote.requested", actorId: me.id, actorEmail: me.email, organizationId: me.organizationId, entityType: "quote_request", entityId: data as string });
  after(async () => {
    const { data: r } = await supabaseAdmin().from("quote_requests").select("request_no").eq("id", data).single();
    await emailStaff(me.organizationId, (company) => quoteRequestStaffEmail({ company, requestNo: r?.request_no as string, title: d.title, url: `${env().NEXT_PUBLIC_SITE_URL}/staff/quotes/${data}` }));
  });
  revalidatePath("/app", "layout");
  return { requestId: data as string };
}

export async function saveDraft(input: { draftId?: string | null; title: string; payload: Record<string, unknown> }): Promise<{ draftId?: string; error?: string }> {
  const me = await buyer();
  if (!me) return { error: "Not allowed." };
  const json = JSON.stringify(input.payload ?? {});
  if (json.length > 50_000) return { error: "Draft is too large." };
  const sb = await supabaseServer();
  if (input.draftId && uuid.safeParse(input.draftId).success) {
    const { error } = await sb.from("draft_orders").update({ title: input.title.slice(0, 160), payload: input.payload }).eq("id", input.draftId);
    return error ? { error: "Could not save the draft." } : { draftId: input.draftId };
  }
  const { data, error } = await sb.from("draft_orders").insert({ organization_id: me.organizationId, created_by: me.id, kind: "new", title: input.title.slice(0, 160), payload: input.payload }).select("id").single();
  return error || !data ? { error: "Could not save the draft." } : { draftId: data.id as string };
}

export async function deleteDraft(draftId: string): Promise<ActionState> {
  const me = await buyer();
  if (!me || !uuid.safeParse(draftId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  await sb.from("draft_orders").update({ deleted_at: new Date().toISOString() }).eq("id", draftId);
  revalidatePath("/app/order/new");
  return { message: "Draft deleted." };
}

const addressInput = z.object({ label: z.string().trim().min(2).max(80), recipient: z.string().max(120).default(""), phone: z.string().max(40).default(""),
  line1: z.string().trim().min(3).max(200), barangay: z.string().max(120).default(""), city: z.string().trim().min(2).max(120), province: z.string().max(120).default(""), zip: z.string().max(10).default("") });
export async function addAddress(input: z.infer<typeof addressInput>): Promise<{ id?: string; error?: string }> {
  const me = await buyer();
  if (!me) return { error: "Not allowed." };
  const p = addressInput.safeParse(input);
  if (!p.success) return { error: "Fill in the label, street and city." };
  const sb = await supabaseServer();
  const { data, error } = await sb.from("addresses").insert({ organization_id: me.organizationId, ...p.data }).select("id").single();
  return error || !data ? { error: "Could not save the address." } : { id: data.id as string };
}

// ---------------------------------------------------------------- quotes
export async function acceptQuote(quoteId: string, tierId: string, clientPo: string): Promise<{ orderId?: string; error?: string }> {
  const me = await buyer();
  if (!me || !uuid.safeParse(quoteId).success || !uuid.safeParse(tierId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { ip } = await requestMeta();
  const { data, error } = await sb.rpc("accept_quote", { p_quote_id: quoteId, p_tier_id: tierId, p_client_po: clientPo.slice(0, 60), p_ip: ip });
  if (error || !data) return { error: error?.message ?? "Could not accept the quote." };
  await audit({ action: "quote.accepted", actorId: me.id, actorEmail: me.email, organizationId: me.organizationId, entityType: "quote", entityId: quoteId, meta: { tier_id: tierId, order_id: data, ip } });
  revalidatePath("/app", "layout");
  return { orderId: data as string };
}

export async function declineQuote(quoteId: string, reason: string): Promise<ActionState> {
  const me = await buyer();
  if (!me || !uuid.safeParse(quoteId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("decline_quote", { p_quote_id: quoteId, p_reason: reason.slice(0, 500) });
  if (error) return { error: error.message };
  await audit({ action: "quote.declined", actorId: me.id, organizationId: me.organizationId, entityType: "quote", entityId: quoteId, meta: { reason } });
  revalidatePath("/app", "layout");
  return { message: "Quote declined. Your account manager has been told." };
}

/** Questions about a quote — from the client or from staff. */
export async function postQuoteMessage(requestId: string, body: string): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me || !uuid.safeParse(requestId).success || !body.trim()) return { error: "Type a message." };
  const sb = await supabaseServer();
  const { data: r } = await sb.from("quote_requests").select("organization_id, title, submitted_by").eq("id", requestId).maybeSingle();
  if (!r) return { error: "Not found." };
  const { error } = await sb.from("quote_messages").insert({ organization_id: r.organization_id, quote_request_id: requestId, author_id: me.id, body: body.trim().slice(0, 2000) });
  if (error) return { error: "Could not send." };
  const admin = supabaseAdmin();
  if (me.staffRole && r.submitted_by) {
    await admin.from("notifications").insert({ profile_id: r.submitted_by, organization_id: r.organization_id, kind: "quote_message", title: "New message about your quote", body: r.title, link: `/app/quotes/${requestId}` });
  } else {
    const { data: staff } = await admin.from("staff_assignments").select("staff_profile_id").eq("organization_id", r.organization_id);
    if (staff?.length) await admin.from("notifications").insert(staff.map((s) => ({ profile_id: s.staff_profile_id, organization_id: r.organization_id, kind: "quote_message", title: "Client question about a quote", body: r.title, link: `/staff/quotes/${requestId}` })));
  }
  revalidatePath(me.staffRole ? `/staff/quotes/${requestId}` : `/app/quotes/${requestId}`);
  return { message: "Sent." };
}
