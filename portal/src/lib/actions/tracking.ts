"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import Decimal from "decimal.js";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { pesosToCentavos, formatCentavos } from "@/lib/money";
import { manilaToday } from "@/lib/dates";
import { emailClientUsers, emailStaff } from "@/lib/email/staff";
import { orderStatusEmail, paymentReceivedEmail, orderCancelledStaffEmail, paymentSlipStaffEmail } from "@/lib/email/templates";
import { t } from "@/i18n";
import type { ActionState } from "./account";

/**
 * ORDER TRACKING AND PAYMENTS. Every change goes through a database function
 * that checks the person's role again (production can move an order along but
 * can't confirm, cancel or touch money). Emails go out after the response.
 */
const uuid = z.uuid();
const STATUSES = ["prepress", "waiting_for_revisions", "waiting_for_client_approval", "approved_for_print", "printing", "finishing", "quality_check",
  "ready_for_pickup", "out_for_delivery", "delivered", "closed", "on_hold"] as const;
/** Clients get an email for these; every client-visible change also appears in their in-app notifications. */
const EMAIL_STATUSES = new Set(["approved_for_print", "printing", "ready_for_pickup", "out_for_delivery", "delivered", "on_hold"]);
const ALL_CLIENT_ROLES = ["client_admin", "client_buyer", "client_viewer"];
const label = (s: string) => (t.status as Record<string, string>)[s] ?? s;
const site = () => env().NEXT_PUBLIC_SITE_URL;

async function staff(manage: boolean) {
  const me = await getSessionUser();
  if (!me?.staffRole || me.needsMfa) return null;
  if (manage && me.staffRole === "pa_production") return null;
  return me;
}
async function orderInfo(id: string) {
  const { data } = await supabaseAdmin().from("orders").select("id, order_no, organization_id, placed_by, organizations(name)").eq("id", id).single();
  return data as unknown as { id: string; order_no: string; organization_id: string; placed_by: string | null; organizations: { name: string } } | null;
}
const refresh = (id: string) => { revalidatePath(`/staff/orders/${id}`); revalidatePath(`/app/orders/${id}`); revalidatePath("/staff", "layout"); };

// ---------------------------------------------------------------- staff: photos
/** Staff uploaded a production/delivery photo or receipt to attachments/<org>/orders/<order>/… */
export async function recordOrderPhoto(input: { orderId: string; path: string; name: string; size: number; mime?: string; receipt: boolean }): Promise<{ id?: string; error?: string }> {
  const me = await staff(false);
  if (!me || !uuid.safeParse(input.orderId).success) return { error: "Not allowed." };
  const o = await orderInfo(input.orderId);
  if (!o || !input.path.startsWith(`${o.organization_id}/orders/${o.id}/`) || input.path.includes("..")) return { error: "Invalid upload." };
  const maxMb = (await getSetting("uploads")).max_file_mb;
  if (input.size > maxMb * 1024 * 1024) return { error: `Files must be ${maxMb} MB or smaller.` };
  const sb = await supabaseServer();
  const { data, error } = await sb.from("files").insert({
    organization_id: o.organization_id, purpose: input.receipt ? "delivery_receipt" : "order_photo", kind: "upload", bucket: "attachments",
    storage_path: input.path, original_name: input.name.slice(0, 255), size_bytes: input.size, mime_type: input.mime ?? null, uploaded_by: me.id,
  }).select("id").single();
  if (error || !data) return { error: "Could not save the file." };
  await audit({ action: "file.uploaded", actorId: me.id, organizationId: o.organization_id, entityType: "order", entityId: o.id, meta: { name: input.name, purpose: input.receipt ? "delivery_receipt" : "order_photo" } });
  return { id: data.id as string };
}

// ---------------------------------------------------------------- staff: status
const statusInput = z.object({
  orderId: uuid, to: z.enum(STATUSES), note: z.string().max(2000).default(""), clientVisible: z.boolean().default(true),
  fileIds: z.array(uuid).max(20).default([]), kind: z.enum(["production_photo", "delivery_photo", "delivery_receipt", "other"]).default("production_photo"),
});
export async function updateOrderStatus(raw: z.input<typeof statusInput>): Promise<ActionState> {
  const me = await staff(false);
  const p = statusInput.safeParse(raw);
  if (!me || !p.success) return { error: "Not allowed." };
  const d = p.data;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("update_order_status", { p_order_id: d.orderId, p_to: d.to, p_note: d.note, p_client_visible: d.clientVisible, p_file_ids: d.fileIds, p_attachment_kind: d.kind });
  if (error) return { error: error.message };
  const o = await orderInfo(d.orderId);
  await audit({ action: "order.status_changed", actorId: me.id, actorEmail: me.email, organizationId: o?.organization_id, entityType: "order", entityId: d.orderId, meta: { to: d.to, note: d.note, client_visible: d.clientVisible, files: d.fileIds.length } });
  if (o && d.clientVisible && EMAIL_STATUSES.has(d.to)) {
    after(() => emailClientUsers(o.organization_id, ALL_CLIENT_ROLES, orderStatusEmail({ orderNo: o.order_no, status: label(d.to), note: d.note || null, url: `${site()}/app/orders/${o.id}` }), o.placed_by));
  }
  refresh(d.orderId);
  return { message: `Status changed to ${label(d.to)}.${d.clientVisible ? " The client was notified." : " (Internal — not shown to the client.)"}` };
}

export async function addOrderAttachments(orderId: string, fileIds: string[], kind: "production_photo" | "delivery_photo" | "delivery_receipt", note: string): Promise<ActionState> {
  const me = await staff(false);
  if (!me || !uuid.safeParse(orderId).success || !z.array(uuid).min(1).max(20).safeParse(fileIds).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("add_order_attachments", { p_order_id: orderId, p_file_ids: fileIds, p_kind: kind, p_note: note.slice(0, 2000) });
  if (error) return { error: error.message };
  refresh(orderId);
  return { message: kind === "delivery_receipt" ? "Delivery receipt added." : "Photos added." };
}

// ---------------------------------------------------------------- staff: confirm
export async function confirmOrder(orderId: string, prices: { orderItemId: string; total: string }[], note: string): Promise<ActionState> {
  const me = await staff(true);
  if (!me || !uuid.safeParse(orderId).success) return { error: "Not allowed." };
  let adj: { order_item_id: string; total_centavos: number }[];
  try {
    adj = prices.filter((x) => x.total.trim()).map((x) => {
      if (!uuid.safeParse(x.orderItemId).success) throw new Error();
      return { order_item_id: x.orderItemId, total_centavos: pesosToCentavos(x.total) };
    });
  } catch { return { error: "Type prices in pesos, e.g. 1,850.00." }; }
  const sb = await supabaseServer();
  const { error } = await sb.rpc("confirm_order", { p_order_id: orderId, p_prices: adj, p_note: note.slice(0, 2000) });
  if (error) return { error: error.message };
  const o = await orderInfo(orderId);
  await audit({ action: adj.length ? "order.confirmed_price_changed" : "order.confirmed", actorId: me.id, actorEmail: me.email, organizationId: o?.organization_id, entityType: "order", entityId: orderId, meta: { prices: adj, note } });
  if (o) after(() => emailClientUsers(o.organization_id, ["client_admin", "client_buyer"], orderStatusEmail({ orderNo: o.order_no, status: label("confirmed"),
    note: adj.length ? `The price was updated${note ? ` — ${note}` : ""}. Please check the new total.` : note || null, url: `${site()}/app/orders/${o.id}` }), o.placed_by));
  refresh(orderId);
  return { message: "Order confirmed. The client was notified." };
}

// ---------------------------------------------------------------- cancel (client or staff)
export async function cancelOrder(orderId: string, reason: string): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me || me.needsMfa || !uuid.safeParse(orderId).success || reason.trim().length < 3) return { error: "Please give a reason." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("cancel_order", { p_order_id: orderId, p_reason: reason.slice(0, 2000) });
  if (error) return { error: error.message };
  const o = await orderInfo(orderId);
  await audit({ action: "order.cancelled", actorId: me.id, actorEmail: me.email, organizationId: o?.organization_id, entityType: "order", entityId: orderId, meta: { reason } });
  if (o) after(() => (me.staffRole
    ? emailClientUsers(o.organization_id, ["client_admin", "client_buyer"], orderStatusEmail({ orderNo: o.order_no, status: label("cancelled"), note: reason, url: `${site()}/app/orders/${o.id}` }), o.placed_by)
    : emailStaff(o.organization_id, (company) => orderCancelledStaffEmail({ company, orderNo: o.order_no, reason, url: `${site()}/staff/orders/${o.id}` }))));
  refresh(orderId);
  return { message: "Order cancelled." };
}

// ---------------------------------------------------------------- payments
const paymentInput = z.object({
  orderId: uuid, method: z.enum(["bank_transfer", "cheque"]), reference: z.string().trim().min(1).max(80), bank: z.string().max(80).default(""),
  amount: z.string().min(1), receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().max(1000).default(""),
});
export async function recordPayment(raw: z.input<typeof paymentInput>): Promise<ActionState> {
  const me = await staff(true);
  if (!me) return { error: "Only management and sales can record payments." };
  const p = paymentInput.safeParse(raw);
  if (!p.success) return { error: raw.method === "cheque" ? "Fill in the cheque number, amount and date." : "Fill in the reference number, amount and date." };
  const d = p.data;
  let cents: number; try { cents = pesosToCentavos(d.amount); } catch { return { error: "Type the amount in pesos, e.g. 12,500.00." }; }
  const sb = await supabaseServer();
  const { data: id, error } = await sb.rpc("record_payment", { p_order_id: d.orderId, p_method: d.method, p_reference: d.reference, p_bank: d.bank, p_amount_centavos: cents, p_received_on: d.receivedOn, p_notes: d.notes });
  if (error) return { error: error.message };
  const o = await orderInfo(d.orderId);
  const { data: fin } = await supabaseAdmin().from("order_financials").select("total_centavos, amount_paid_centavos, payment_status").eq("order_id", d.orderId).single();
  await audit({ action: "payment.recorded", actorId: me.id, actorEmail: me.email, organizationId: o?.organization_id, entityType: "payment", entityId: id as string,
    meta: { order_id: d.orderId, method: d.method, reference: d.reference, bank: d.bank, amount_centavos: cents, received_on: d.receivedOn, payment_status: fin?.payment_status } });
  const paid = fin?.payment_status === "paid";
  const over = fin ? Number(fin.amount_paid_centavos) - Number(fin.total_centavos) : 0;
  if (o && fin) after(() => emailClientUsers(o.organization_id, ["client_admin", "client_buyer"], paymentReceivedEmail({ orderNo: o.order_no, amount: formatCentavos(cents),
    balance: formatCentavos(Math.max(0, Number(fin.total_centavos) - Number(fin.amount_paid_centavos))), paid, url: `${site()}/app/orders/${o.id}` }), o.placed_by));
  refresh(d.orderId);
  return { message: `Payment recorded. The order is now ${paid ? "Paid" : "Partially Paid"}.${over > 0 ? ` Note: ${formatCentavos(over)} more than the total was received.` : ""}` };
}

export async function voidPayment(paymentId: string, orderId: string, reason: string): Promise<ActionState> {
  const me = await staff(true);
  if (!me || !uuid.safeParse(paymentId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { error } = await sb.rpc("void_payment", { p_payment_id: paymentId, p_reason: reason.slice(0, 500) });
  if (error) return { error: error.message };
  await audit({ action: "payment.voided", actorId: me.id, actorEmail: me.email, entityType: "payment", entityId: paymentId, meta: { order_id: orderId, reason } });
  refresh(orderId);
  return { message: "Payment removed (kept in the audit log). Payment status updated." };
}

// ---------------------------------------------------------------- client: payment slip
export async function submitPaymentSlip(input: { orderId: string; path: string; name: string; size: number; mime?: string; note: string }): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me?.organizationId || me.needsMfa || !(me.clientRole === "client_admin" || me.clientRole === "client_buyer") || !uuid.safeParse(input.orderId).success) return { error: "Not allowed." };
  if (!input.path.startsWith(`${me.organizationId}/payment-slips/`) || input.path.includes("..")) return { error: "Invalid upload." };
  if (input.size > 15 * 1024 * 1024) return { error: "Please upload a photo smaller than 15 MB." };
  const sb = await supabaseServer();
  const { data: file, error: fErr } = await sb.from("files").insert({
    organization_id: me.organizationId, purpose: "payment_slip", kind: "upload", bucket: "attachments", storage_path: input.path,
    original_name: input.name.slice(0, 255), size_bytes: input.size, mime_type: input.mime ?? null, uploaded_by: me.id,
  }).select("id").single();
  if (fErr || !file) return { error: "Could not save the photo." };
  const { error } = await sb.rpc("add_payment_slip", { p_order_id: input.orderId, p_file_id: file.id, p_note: input.note.slice(0, 500) });
  if (error) return { error: error.message };
  const o = await orderInfo(input.orderId);
  await audit({ action: "payment.slip_uploaded", actorId: me.id, actorEmail: me.email, organizationId: me.organizationId, entityType: "order", entityId: input.orderId, meta: { name: input.name } });
  if (o) after(() => emailStaff(o.organization_id, (company) => paymentSlipStaffEmail({ company, orderNo: o.order_no, note: input.note || null, url: `${site()}/staff/orders/${o.id}` })));
  refresh(input.orderId);
  return { message: "Thank you — we've sent the slip to Print Amplified. They'll mark the payment once it's checked." };
}

// ---------------------------------------------------------------- staff: save final price
/** After an order is delivered: make its final prices the items' new agreed prices (so future instant quotes start from them). */
export async function saveOrderPricesAsAgreed(orderId: string): Promise<ActionState> {
  const me = await staff(true);
  if (!me || !uuid.safeParse(orderId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { data: o } = await sb.from("orders").select("id, order_no, status, organization_id, order_items(print_item_id, quantity, order_item_prices(total_centavos, vat_inclusive))").eq("id", orderId).maybeSingle();
  if (!o) return { error: "Order not found." };
  if (!["delivered", "closed"].includes(o.status as string)) return { error: "Save prices once the order is delivered." };
  const today = manilaToday();
  let saved = 0;
  for (const it of (o.order_items as unknown as { print_item_id: string | null; quantity: number; order_item_prices: { total_centavos: number; vat_inclusive: boolean } | null }[])) {
    if (!it.print_item_id || !it.order_item_prices) continue;
    await sb.from("price_tiers").update({ is_current: false }).eq("print_item_id", it.print_item_id).eq("quantity", it.quantity).eq("is_current", true);
    const total = Number(it.order_item_prices.total_centavos);
    const { error } = await sb.from("price_tiers").insert({
      organization_id: o.organization_id, print_item_id: it.print_item_id, quantity: it.quantity, unit_price: new Decimal(total).div(100).div(it.quantity).toFixed(4),
      total_centavos: total, vat_inclusive: it.order_item_prices.vat_inclusive, source: "order", source_ref: o.order_no, base_date: today, created_by: me.id,
    });
    if (!error) saved++;
  }
  await audit({ action: "price.saved_from_order", actorId: me.id, actorEmail: me.email, organizationId: o.organization_id as string, entityType: "order", entityId: orderId, meta: { saved, base_date: today } });
  refresh(orderId);
  return saved ? { message: `Saved ${saved} agreed price${saved === 1 ? "" : "s"} dated today. Future instant quotes start from ${saved === 1 ? "it" : "them"}.` } : { error: "No Print Item prices to save on this order." };
}
