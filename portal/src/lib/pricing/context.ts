import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { manilaToday } from "@/lib/dates";
import { computeInstantQuote, type InflationRate, type InstantQuoteResult, type PricingRules } from "./instant-quote";

/**
 * Loads everything the instant-quote engine needs and runs it — on the
 * server only. Uses the admin client because pricing rules are staff-only
 * data; every caller first checks (with the user's own access) that the
 * user may see the Print Item.
 */
export { manilaToday };

export async function loadPricingRules(): Promise<{ rules: PricingRules; inflation: (InflationRate & { needsConfirmation: boolean; note: string | null; id: string })[] }> {
  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  const [{ data: s }, { data: rates }] = await Promise.all([
    admin.from("pricing_settings").select("*").lte("effective_from", now).order("version_no", { ascending: false }).limit(1).single(),
    admin.from("inflation_rates").select("id, year, rate_pct, needs_confirmation, source_note, effective_from").lte("effective_from", now).order("effective_from", { ascending: false }),
  ]);
  // latest effective row per year
  const byYear = new Map<number, { id: string; year: number; ratePct: string; needsConfirmation: boolean; note: string | null }>();
  for (const r of rates ?? []) if (!byYear.has(r.year as number)) byYear.set(r.year as number, { id: r.id as string, year: r.year as number, ratePct: String(r.rate_pct), needsConfirmation: r.needs_confirmation as boolean, note: r.source_note as string | null });
  return {
    rules: {
      vatRatePct: String(s?.vat_rate_pct ?? 12), roundingStepPesos: (s?.rounding_step_pesos ?? 5) as 1 | 5 | 10, roundingScope: (s?.rounding_scope ?? "order_total") as PricingRules["roundingScope"],
      maxEstimateAgeYears: String(s?.max_estimate_age_years ?? 3), maxAdjustmentPct: String(s?.max_adjustment_pct ?? 20), quoteValidityDays: (s?.quote_validity_days as number) ?? 15,
      version: (s?.version_no as number) ?? 1,
    },
    inflation: [...byYear.values()].sort((a, b) => a.year - b.year),
  };
}

export type Tier = { id: string; quantity: number; totalCentavos: number; unitPrice: string; vatInclusive: boolean; baseDate: string; source: string; sourceRef: string | null; lineId: string | null };

export type ItemQuote = {
  item: { id: string; name: string; organizationId: string; approvedVersionId: string | null; leadTime: string | null; categoryId: string | null };
  tiers: Tier[];
  result: InstantQuoteResult;
  inputs: Record<string, unknown>;
  base: Tier | null;
};

export async function quoteForItem(opts: { printItemId: string; quantity: number; specsChanged?: boolean; clientRevisions?: boolean; today?: string }): Promise<ItemQuote | null> {
  const admin = supabaseAdmin();
  const today = opts.today ?? manilaToday();
  const { data: item } = await admin.from("print_items")
    .select("id, name, organization_id, approved_version_id, category_id, spec, spec_signature, products(default_lead_time_text), organizations(allow_instant_quotes, client_adjustment_pct, client_adjustment_cap_pct)")
    .eq("id", opts.printItemId).is("deleted_at", null).maybeSingle();
  if (!item) return null;
  const org = item.organizations as unknown as { allow_instant_quotes: boolean; client_adjustment_pct: string; client_adjustment_cap_pct: string | null };

  const [{ data: tierRows }, { rules, inflation }, { data: surcharges }, { data: addons }, { count: openRevisions }] = await Promise.all([
    admin.from("price_tiers").select("id, quantity, total_centavos, unit_price, vat_inclusive, base_date, source, source_ref, past_estimate_line_id, past_estimate_lines(spec_signature)").eq("print_item_id", item.id).eq("is_current", true).order("quantity"),
    loadPricingRules(),
    admin.from("category_surcharges").select("category_id, material_key, pct").lte("effective_from", today).or(`effective_to.is.null,effective_to.gte.${today}`),
    admin.from("fixed_addons").select("scope, category_id, amount_centavos").lte("effective_from", today).or(`effective_to.is.null,effective_to.gte.${today}`),
    admin.from("revision_requests").select("id", { count: "exact", head: true }).eq("print_item_id", item.id).in("status", ["open", "in_prepress", "proof_sent"]),
  ]);

  const tiers: Tier[] = (tierRows ?? []).map((t) => ({
    id: t.id as string, quantity: t.quantity as number, totalCentavos: Number(t.total_centavos), unitPrice: String(t.unit_price), vatInclusive: t.vat_inclusive as boolean,
    baseDate: t.base_date as string, source: t.source as string, sourceRef: t.source_ref as string | null, lineId: t.past_estimate_line_id as string | null,
  }));
  const base = tiers.find((t) => t.quantity === opts.quantity) ?? null;
  const baseRow = (tierRows ?? []).find((t) => t.id === base?.id);
  const lineSig = (baseRow?.past_estimate_lines as unknown as { spec_signature: string | null } | null)?.spec_signature ?? null;
  // The estimate was for different specs than the item has now → treat as a spec change.
  const estimateSpecsDiffer = Boolean(lineSig && item.spec_signature && lineSig !== item.spec_signature);

  const material = String((item.spec as { material?: string })?.material ?? "").toLowerCase();
  const surchargePct = (surcharges ?? [])
    .filter((s) => (s.category_id && s.category_id === item.category_id) || (s.material_key && material.includes(String(s.material_key).toLowerCase())))
    .reduce((sum, s) => sum + Number(s.pct), 0);
  const addonsCentavos = (addons ?? [])
    .filter((a) => a.scope === "order" || a.category_id === item.category_id)
    .reduce((sum, a) => sum + Number(a.amount_centavos), 0);
  let rechargeCentavos = 0;
  if (base?.lineId) {
    const { data: line } = await admin.from("past_estimate_lines").select("past_estimate_id").eq("id", base.lineId).maybeSingle();
    if (line) {
      const { data: charges } = await admin.from("past_estimate_charges").select("amount_centavos").eq("past_estimate_id", line.past_estimate_id).eq("recharge_on_reorder", true);
      rechargeCentavos = (charges ?? []).reduce((sum, c) => sum + Number(c.amount_centavos), 0);
    }
  }

  const inputs = {
    today, quantity: opts.quantity,
    base: base ? { totalCentavos: base.totalCentavos, quantity: base.quantity, date: base.baseDate, vatInclusive: base.vatInclusive, tierId: base.id, sourceRef: base.sourceRef } : null,
    tierQuantities: tiers.map((t) => t.quantity),
    specsMatch: !opts.specsChanged && !estimateSpecsDiffer,
    hasRevisions: Boolean(opts.clientRevisions) || (openRevisions ?? 0) > 0,
    instantQuotesAllowed: org.allow_instant_quotes && Boolean(item.approved_version_id),
    inflation: inflation.map((r) => ({ year: r.year, ratePct: r.ratePct })),
    surchargePct, clientAdjustmentPct: String(org.client_adjustment_pct ?? 0), clientCapPct: org.client_adjustment_cap_pct, addonsCentavos, rechargeCentavos, rules,
  };
  const result = computeInstantQuote(inputs);
  return {
    item: { id: item.id as string, name: item.name as string, organizationId: item.organization_id as string, approvedVersionId: item.approved_version_id as string | null,
      leadTime: (item.products as unknown as { default_lead_time_text: string | null } | null)?.default_lead_time_text ?? null, categoryId: item.category_id as string | null },
    tiers, result, inputs, base,
  };
}

/** Store an instant quote with EVERY input, so it can be explained later. Returns its id. */
export async function saveInstantQuote(q: ItemQuote, createdBy: string, quoteRequestId: string | null = null): Promise<string> {
  const p = q.result.price;
  const i = q.inputs as { surchargePct: number; clientAdjustmentPct: string; addonsCentavos: number; rechargeCentavos: number; rules: PricingRules; quantity: number };
  const { data, error } = await supabaseAdmin().from("instant_quotes").insert({
    organization_id: q.item.organizationId, print_item_id: q.item.id, quote_request_id: quoteRequestId, quantity: i.quantity,
    base_price_tier_id: q.base?.id ?? null, base_unit_price: q.base?.unitPrice ?? null, base_total_centavos: q.base?.totalCentavos ?? null,
    base_date: q.base?.baseDate ?? null, base_vat_inclusive: q.base?.vatInclusive ?? null,
    inflation_factor: p?.inflationFactor ?? null, inflation_detail: p?.years ?? null, surcharge_pct: i.surchargePct, client_adjustment_pct: i.clientAdjustmentPct,
    addons_centavos: i.addonsCentavos, addons_detail: { inputs: q.inputs }, recharged_centavos: i.rechargeCentavos, pricing_settings_version: i.rules.version,
    adjustment_pct: p?.adjustmentPct ?? null, pre_round_total: p?.preRoundNet ?? null, final_net_centavos: p?.netCentavos ?? null, vat_centavos: p?.vatCentavos ?? null,
    final_total_centavos: p?.totalCentavos ?? null, valid_until: q.result.validUntil, status: q.result.status, block_reasons: q.result.reasons,
    lead_time_text: q.item.leadTime, created_by: createdBy,
  }).select("id").single();
  if (error || !data) throw new Error(`Could not save the instant quote: ${error?.message}`);
  return data.id as string;
}
