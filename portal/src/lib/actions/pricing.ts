"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import Decimal from "decimal.js";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { pesosToCentavos } from "@/lib/money";
import { quoteForItem, type ItemQuote } from "@/lib/pricing/context";
import type { ActionState } from "./account";

const uuid = z.uuid();
async function admin() { const me = await getSessionUser(); return me?.staffRole === "pa_admin" && !me.needsMfa ? me : null; }
async function priceStaff() { const me = await getSessionUser(); return (me?.staffRole === "pa_admin" || me?.staffRole === "pa_sales") && !me.needsMfa ? me : null; }
const ONLY_ADMIN = "Only management (pa_admin) can change pricing rules.";

const settingsInput = z.object({
  roundingStepPesos: z.union([z.literal(1), z.literal(5), z.literal(10)]), roundingScope: z.enum(["order_total", "unit_price"]),
  vatRatePct: z.number().min(0).max(30), quoteValidityDays: z.number().int().min(1).max(120), maxEstimateAgeYears: z.number().min(0.5).max(20),
  maxAdjustmentPct: z.number().min(0).max(200), showBreakdownToClients: z.boolean(), quoteReplyTargetHours: z.number().int().min(1).max(240),
});
/** Each change is a NEW version — old quotes keep pointing at the version they used. */
export async function savePricingSettings(raw: z.infer<typeof settingsInput>): Promise<ActionState> {
  const me = await admin();
  if (!me) return { error: ONLY_ADMIN };
  const p = settingsInput.safeParse(raw);
  if (!p.success) return { error: "Check the values." };
  const sb = await supabaseServer();
  const { data: cur } = await sb.from("pricing_settings").select("version_no").order("version_no", { ascending: false }).limit(1).maybeSingle();
  const d = p.data;
  const { error } = await sb.from("pricing_settings").insert({
    version_no: ((cur?.version_no as number) ?? 0) + 1, rounding_step_pesos: d.roundingStepPesos, rounding_scope: d.roundingScope, vat_rate_pct: d.vatRatePct,
    quote_validity_days: d.quoteValidityDays, max_estimate_age_years: d.maxEstimateAgeYears, max_adjustment_pct: d.maxAdjustmentPct,
    show_breakdown_to_clients: d.showBreakdownToClients, quote_reply_target_hours: d.quoteReplyTargetHours, created_by: me.id,
  });
  if (error) return { error: ONLY_ADMIN };
  await audit({ action: "pricing.settings_changed", actorId: me.id, actorEmail: me.email, meta: d });
  revalidatePath("/staff/pricing");
  return { message: "Pricing rules saved as a new version." };
}

/** Change (or confirm) one year's inflation rate. History is kept: a new row, effective now. */
export async function saveInflationRate(year: number, ratePct: string, note: string): Promise<ActionState> {
  const me = await admin();
  if (!me) return { error: ONLY_ADMIN };
  let rate: Decimal;
  try { rate = new Decimal(ratePct); } catch { return { error: "Type the rate as a number, e.g. 3.2" }; }
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || rate.lte(-50) || rate.gte(100)) return { error: "Check the year and rate." };
  const sb = await supabaseServer();
  const { error } = await sb.from("inflation_rates").insert({ year, rate_pct: rate.toFixed(3), source_note: note.slice(0, 200) || "Confirmed by management", needs_confirmation: false, set_by: me.id });
  if (error) return { error: ONLY_ADMIN };
  await audit({ action: "pricing.inflation_changed", actorId: me.id, actorEmail: me.email, meta: { year, rate_pct: rate.toString(), note } });
  revalidatePath("/staff/pricing");
  return { message: `${year}: ${rate.toString()}% saved.` };
}

const surchargeInput = z.object({ kind: z.enum(["surcharge", "addon"]), categoryId: uuid.nullable(), materialKey: z.string().max(60).nullable(),
  label: z.string().trim().min(2).max(120), value: z.string(), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), scope: z.enum(["order", "category"]).optional() });
export async function addSurchargeOrAddon(raw: z.infer<typeof surchargeInput>): Promise<ActionState> {
  const me = await admin();
  if (!me) return { error: ONLY_ADMIN };
  const p = surchargeInput.safeParse(raw);
  if (!p.success) return { error: "Fill in the label, value and start date." };
  const d = p.data;
  const sb = await supabaseServer();
  let error;
  if (d.kind === "surcharge") {
    if (!d.categoryId && !d.materialKey) return { error: "Choose a category or type a material." };
    let pct: Decimal; try { pct = new Decimal(d.value); } catch { return { error: "Type a percentage, e.g. 5" }; }
    ({ error } = await sb.from("category_surcharges").insert({ category_id: d.categoryId, material_key: d.materialKey?.toLowerCase() || null, label: d.label, pct: pct.toFixed(3), effective_from: d.effectiveFrom, set_by: me.id }));
  } else {
    let cents: number; try { cents = pesosToCentavos(d.value); } catch { return { error: "Type an amount in pesos, e.g. 350" }; }
    ({ error } = await sb.from("fixed_addons").insert({ scope: d.scope ?? "order", category_id: d.scope === "category" ? d.categoryId : null, label: d.label, amount_centavos: cents, effective_from: d.effectiveFrom, set_by: me.id }));
  }
  if (error) return { error: error.message.includes("check") ? "Choose a category for a category add-on." : ONLY_ADMIN };
  await audit({ action: `pricing.${d.kind}_added`, actorId: me.id, meta: d });
  revalidatePath("/staff/pricing");
  return { message: "Saved." };
}

export async function endSurchargeOrAddon(kind: "surcharge" | "addon", id: string): Promise<ActionState> {
  const me = await admin();
  if (!me || !uuid.safeParse(id).success) return { error: ONLY_ADMIN };
  const sb = await supabaseServer();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await sb.from(kind === "surcharge" ? "category_surcharges" : "fixed_addons").update({ effective_to: yesterday }).eq("id", id);
  await audit({ action: `pricing.${kind}_ended`, actorId: me.id, entityId: id });
  revalidatePath("/staff/pricing");
  return { message: "Ended — it no longer applies from today." };
}

/** Quote preview tool: what would the instant quote be today? Nothing is saved. */
export async function previewInstantQuote(printItemId: string, quantity: number): Promise<{ quote?: ItemQuote; error?: string }> {
  const me = await priceStaff();
  if (!me || !uuid.safeParse(printItemId).success || !Number.isInteger(quantity) || quantity <= 0) return { error: "Choose an item and quantity." };
  const sb = await supabaseServer();
  const { data: visible } = await sb.from("print_items").select("id").eq("id", printItemId).maybeSingle();   // RLS: only items this staff member manages
  if (!visible) return { error: "Item not found." };
  const quote = await quoteForItem({ printItemId, quantity });
  return quote ? { quote } : { error: "Item not found." };
}

/** Set an agreed price by hand (keeps the old one in price history). */
export async function setPriceTier(raw: { printItemId: string; quantity: number; total: string; vatInclusive: boolean; reference: string; baseDate: string; validUntil: string | null }): Promise<ActionState> {
  const me = await priceStaff();
  if (!me || !uuid.safeParse(raw.printItemId).success || !Number.isInteger(raw.quantity) || raw.quantity <= 0) return { error: "Check the quantity." };
  let cents: number; try { cents = pesosToCentavos(raw.total); } catch { return { error: "Type the total in pesos." }; }
  if (cents <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(raw.baseDate)) return { error: "Check the price and date." };
  const sb = await supabaseServer();
  const { data: item } = await sb.from("print_items").select("organization_id").eq("id", raw.printItemId).maybeSingle();
  if (!item) return { error: "Item not found." };
  await sb.from("price_tiers").update({ is_current: false }).eq("print_item_id", raw.printItemId).eq("quantity", raw.quantity).eq("is_current", true);
  const { error } = await sb.from("price_tiers").insert({
    organization_id: item.organization_id, print_item_id: raw.printItemId, quantity: raw.quantity, unit_price: new Decimal(cents).div(100).div(raw.quantity).toFixed(4),
    total_centavos: cents, vat_inclusive: raw.vatInclusive, source: "manual", source_ref: raw.reference.slice(0, 60) || null, base_date: raw.baseDate,
    valid_until: raw.validUntil || null, created_by: me.id,
  });
  if (error) return { error: "Could not save the price." };
  await audit({ action: "price.changed", actorId: me.id, actorEmail: me.email, organizationId: item.organization_id, entityType: "print_item", entityId: raw.printItemId, meta: { ...raw, total_centavos: cents } });
  revalidatePath(`/staff/items/${raw.printItemId}`);
  return { message: "Agreed price saved. The previous one is kept in the price history." };
}

export async function overrideInstantQuote(id: string, total: string, reason: string): Promise<ActionState> {
  const me = await priceStaff();
  if (!me || !uuid.safeParse(id).success) return { error: "Not allowed." };
  let cents: number; try { cents = pesosToCentavos(total); } catch { return { error: "Type the new total in pesos." }; }
  const sb = await supabaseServer();
  const { error } = await sb.rpc("override_instant_quote", { p_id: id, p_total_centavos: cents, p_reason: reason });
  if (error) return { error: error.message };
  await audit({ action: "instant_quote.overridden", actorId: me.id, actorEmail: me.email, entityType: "instant_quote", entityId: id, meta: { total_centavos: cents, reason } });
  revalidatePath("/staff", "layout");
  return { message: "Quote changed. The client sees the new price." };
}
