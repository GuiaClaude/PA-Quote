"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { kickPush } from "@/lib/push/send";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { requestMeta } from "@/lib/request-meta";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { emailStaff } from "@/lib/email/staff";
import { newOrderStaffEmail, quoteRequestStaffEmail } from "@/lib/email/templates";
import { quoteForItem, saveInstantQuote, manilaToday } from "@/lib/pricing/context";
import type { BlockReason } from "@/lib/pricing/instant-quote";
import type { ActionState } from "./account";

/**
 * ONE-CLICK REORDER. Prices are always recomputed here on the server from
 * the agreed price and today's rules — never taken from the browser. The
 * user's own database access is checked first (they must be able to see the
 * Print Item); the order itself is created by accept_instant_quotes, which
 * checks again that they may order for this company.
 */
const uuid = z.uuid();
const qty = z.number().int().positive().max(10_000_000);
const delivery = z.object({
  addressId: uuid.nullable(), requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  clientPo: z.string().max(60).default(""), notes: z.string().max(2000).default(""),
});

async function buyer() {
  const me = await getSessionUser();
  return me?.organizationId && (me.clientRole === "client_admin" || me.clientRole === "client_buyer") && !me.needsMfa ? (me as typeof me & { organizationId: string }) : null;
}
async function canSeeItem(printItemId: string): Promise<boolean> {
  if (!uuid.safeParse(printItemId).success) return false;
  const sb = await supabaseServer();
  const { data } = await sb.from("print_items").select("id").eq("id", printItemId).is("deleted_at", null).maybeSingle();
  return Boolean(data);
}

type Offer = { status: "offered" | "blocked"; reasons: BlockReason[]; totalCentavos: number | null; validUntil: string };

async function placeOrder(me: NonNullable<Awaited<ReturnType<typeof buyer>>>, ids: string[], d: z.infer<typeof delivery>, source: string) {
  const sb = await supabaseServer();
  const { ip } = await requestMeta();
  const { data, error } = await sb.rpc("accept_instant_quotes", { p_ids: ids, p_address_id: d.addressId, p_requested_date: d.requestedDate, p_client_po: d.clientPo, p_notes: d.notes, p_ip: ip });
  if (error || !data) return { error: error?.message ?? "Could not place the order." };
  await audit({ action: "order.reorder_placed", actorId: me.id, actorEmail: me.email, organizationId: me.organizationId, entityType: "order", entityId: data as string, meta: { instant_quote_ids: ids, source } });
  after(async () => {
    const { data: o } = await supabaseAdmin().from("orders").select("order_no, order_items(title, quantity)").eq("id", data).single();
    const items = (o?.order_items as { title: string; quantity: number }[] | undefined) ?? [];
    await emailStaff(me.organizationId, (company) => newOrderStaffEmail({ company, orderNo: o?.order_no as string, item: items.map((i) => i.title).join(", "), quantity: items.reduce((s, i) => s + i.quantity, 0), url: `${env().NEXT_PUBLIC_SITE_URL}/staff/orders/${data}` }));
  });
  revalidatePath("/app", "layout");
  return { orderId: data as string };
}

/** "Reorder now": price at today's rates; if it differs from what the client saw, ask them to look again. */
export async function reorderNow(input: { printItemId: string; quantity: number; expectedTotalCentavos: number } & z.input<typeof delivery>): Promise<{ orderId?: string; error?: string; changed?: Offer }> {
  kickPush();
  const me = await buyer();
  if (!me) return { error: "Only company admins and buyers can order." };
  const d = delivery.safeParse(input);
  if (!d.success || !qty.safeParse(input.quantity).success || !(await canSeeItem(input.printItemId))) return { error: "Please check the form." };
  const q = await quoteForItem({ printItemId: input.printItemId, quantity: input.quantity });
  if (!q) return { error: "Print Item not found." };
  const offer: Offer = { status: q.result.status, reasons: q.result.reasons, totalCentavos: q.result.price?.totalCentavos ?? null, validUntil: q.result.validUntil };
  if (q.result.status !== "offered" || offer.totalCentavos !== input.expectedTotalCentavos) return { changed: offer };
  const id = await saveInstantQuote(q, me.id);
  return placeOrder(me, [id], d.data, "reorder_now");
}

// ---------------------------------------------------------------- cart
type CartLine = { printItemId: string; quantity: number; instantQuoteId: string };

async function cart(me: { id: string; organizationId: string }) {
  const sb = await supabaseServer();
  const { data } = await sb.from("draft_orders").select("id, payload").eq("kind", "reorder_cart").eq("created_by", me.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { sb, id: (data?.id as string) ?? null, lines: (((data?.payload as { lines?: CartLine[] })?.lines) ?? []) as CartLine[] };
}
async function saveCart(me: { id: string; organizationId: string }, id: string | null, lines: CartLine[]) {
  const sb = await supabaseServer();
  if (id) await sb.from("draft_orders").update({ payload: { lines }, updated_at: new Date().toISOString(), ...(lines.length ? {} : { deleted_at: new Date().toISOString() }) }).eq("id", id);
  else if (lines.length) await sb.from("draft_orders").insert({ organization_id: me.organizationId, created_by: me.id, kind: "reorder_cart", title: "Reorder cart", payload: { lines } });
  revalidatePath("/app", "layout");
}

export async function addToCart(printItemId: string, quantity: number): Promise<ActionState> {
  kickPush();
  const me = await buyer();
  if (!me || !qty.safeParse(quantity).success || !(await canSeeItem(printItemId))) return { error: "Not allowed." };
  const q = await quoteForItem({ printItemId, quantity });
  if (!q || q.result.status !== "offered") return { error: "This quantity needs a quote from Print Amplified." };
  const id = await saveInstantQuote(q, me.id);
  const c = await cart(me);
  await saveCart(me, c.id, [...c.lines.filter((l) => l.printItemId !== printItemId), { printItemId, quantity, instantQuoteId: id }].slice(-30));
  return { message: `Added ${q.item.name} to your cart.` };
}

export async function removeFromCart(printItemId: string): Promise<ActionState> {
  kickPush();
  const me = await buyer();
  if (!me) return { error: "Not allowed." };
  const c = await cart(me);
  await saveCart(me, c.id, c.lines.filter((l) => l.printItemId !== printItemId));
  return { message: "Removed." };
}

/** Check out: expired or changed quotes are re-priced at today's rates first; if any price changed, the client sees it before ordering. */
export async function checkoutCart(input: z.input<typeof delivery>): Promise<{ orderId?: string; error?: string; repriced?: boolean }> {
  kickPush();
  const me = await buyer();
  if (!me) return { error: "Only company admins and buyers can order." };
  const d = delivery.safeParse(input);
  if (!d.success) return { error: "Please check the form." };
  const c = await cart(me);
  if (!c.lines.length) return { error: "Your cart is empty." };
  const { data: quotes } = await c.sb.from("instant_quotes").select("id, status, valid_until, final_total_centavos").in("id", c.lines.map((l) => l.instantQuoteId));
  const byId = new Map((quotes ?? []).map((q) => [q.id as string, q]));
  const today = manilaToday();
  let repriced = false;
  const next: CartLine[] = [];
  for (const l of c.lines) {
    const old = byId.get(l.instantQuoteId);
    if (old && old.status === "offered" && (old.valid_until as string) >= today) { next.push(l); continue; }
    if (!(await canSeeItem(l.printItemId))) { repriced = true; continue; }
    const q = await quoteForItem({ printItemId: l.printItemId, quantity: l.quantity });
    repriced = true;
    if (!q || q.result.status !== "offered") continue;                 // dropped: now needs a quote
    next.push({ ...l, instantQuoteId: await saveInstantQuote(q, me.id) });
  }
  if (repriced) { await saveCart(me, c.id, next); return { repriced: true, error: "Some prices were updated to today's rates (or an item now needs a quote). Please check your cart again." }; }
  const r = await placeOrder(me, next.map((l) => l.instantQuoteId), d.data, "cart");
  if (r.orderId) await saveCart(me, c.id, []);
  return r;
}

// ---------------------------------------------------------------- needs a quote
const ALLOWED_REASONS = ["specs_changed", "has_revisions", "quantity_not_in_tiers", "no_past_price", "estimate_too_old", "adjustment_over_limit", "instant_quotes_off"] as const;

/** Different quantity or specs (or the instant price isn't allowed): send it to Print Amplified as a reorder quote request. */
export async function requestReorderQuote(input: { printItemId: string; quantities: number[]; changes: string } & z.input<typeof delivery>): Promise<{ requestId?: string; error?: string }> {
  kickPush();
  const me = await buyer();
  if (!me) return { error: "Only company admins and buyers can request quotes." };
  const d = delivery.safeParse(input);
  const qs = z.array(qty).min(1).max(8).safeParse(input.quantities);
  if (!d.success || !qs.success || input.changes.length > 4000 || !(await canSeeItem(input.printItemId))) return { error: "Please check the form." };
  const changes = input.changes.trim();
  // Work out the reasons (and a suggested price for staff) the same way an instant quote would.
  const q = await quoteForItem({ printItemId: input.printItemId, quantity: qs.data[0]!, specsChanged: Boolean(changes) });
  if (!q) return { error: "Print Item not found." };
  const reasons = new Set<string>(q.result.reasons);
  for (const n of qs.data) if (!q.tiers.some((t) => t.quantity === n)) reasons.add("quantity_not_in_tiers");
  if (changes) reasons.add("specs_changed");
  const iq = await saveInstantQuote({ ...q, result: { ...q.result, status: "blocked", reasons: [...reasons] as BlockReason[] } }, me.id);
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("submit_reorder_request", {
    p_print_item_id: input.printItemId, p_quantities: qs.data, p_reasons: [...reasons].filter((r) => (ALLOWED_REASONS as readonly string[]).includes(r)),
    p_changes: changes || null, p_address_id: d.data.addressId, p_requested_date: d.data.requestedDate, p_client_po: d.data.clientPo, p_notes: d.data.notes, p_instant_quote_id: iq,
  });
  if (error || !data) return { error: error?.message ?? "Could not send the request." };
  await audit({ action: "quote.reorder_requested", actorId: me.id, actorEmail: me.email, organizationId: me.organizationId, entityType: "quote_request", entityId: data as string, meta: { quantities: qs.data, reasons: [...reasons] } });
  after(async () => {
    const { data: r } = await supabaseAdmin().from("quote_requests").select("request_no").eq("id", data).single();
    await emailStaff(me.organizationId, (company) => quoteRequestStaffEmail({ company, requestNo: r?.request_no as string, title: `Reorder: ${q.item.name}`, url: `${env().NEXT_PUBLIC_SITE_URL}/staff/quotes/${data}` }));
  });
  revalidatePath("/app", "layout");
  return { requestId: data as string };
}
