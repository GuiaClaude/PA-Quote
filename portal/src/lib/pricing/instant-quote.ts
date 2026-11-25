import Decimal from "decimal.js";

/**
 * INSTANT REORDER QUOTE ENGINE (pure functions, no database).
 *
 *   Instant price = Past price × Inflation factor × (1 + Surcharge %) × (1 + Client adjustment %)
 *                   + Fixed add-ons + one-time charges billed again, then rounded UP.
 *
 * Rules (see README → "How instant reorder quotes work"):
 *  - Inflation compounds year by year from the estimate date to today,
 *    prorated by days for partial years. A year without a rate uses the
 *    latest earlier rate (and is flagged "estimated").
 *  - VAT-inclusive past prices are converted to VAT-exclusive first, so VAT
 *    is never inflated twice; the client sees a VAT-inclusive total.
 *  - Minimum rule: never below the past price, unless the client has a
 *    discount (negative client adjustment) — then never below past × (1 − discount).
 *  - Client cap: the total adjustment can't exceed the negotiated cap.
 *  - Instant only if ALL pass: confirmed past price, same specs, no revisions,
 *    quantity is one of the tiers, estimate not too old, adjustment within the
 *    limit, instant quotes switched on for the client. Otherwise "Needs Quote".
 * All money maths uses decimal.js — never JavaScript floats.
 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type BlockReason =
  | "no_past_price" | "specs_changed" | "has_revisions" | "quantity_not_in_tiers"
  | "estimate_too_old" | "adjustment_over_limit" | "instant_quotes_off";

export type InflationRate = { year: number; ratePct: number | string };

export type PricingRules = {
  vatRatePct: number | string;          // 12
  roundingStepPesos: 1 | 5 | 10;
  roundingScope: "order_total" | "unit_price";
  maxEstimateAgeYears: number | string; // 3
  maxAdjustmentPct: number | string;    // 20
  quoteValidityDays: number;            // 15
  version: number;
};

export type InstantQuoteInput = {
  today: string;                        // YYYY-MM-DD, Asia/Manila
  quantity: number;
  /** The confirmed past price for exactly this quantity (null if none). */
  base: { totalCentavos: number; quantity: number; date: string; vatInclusive: boolean; tierId?: string; sourceRef?: string | null } | null;
  /** Quantities that have a confirmed past price for this item. */
  tierQuantities: number[];
  specsMatch: boolean;
  hasRevisions: boolean;
  instantQuotesAllowed: boolean;
  inflation: InflationRate[];
  surchargePct: number | string;        // sum of active category/material surcharges
  clientAdjustmentPct: number | string; // e.g. -3 = 3% loyalty discount
  clientCapPct?: number | string | null;// max total adjustment for this client
  addonsCentavos: number;               // VAT-exclusive fixed add-ons
  rechargeCentavos: number;             // one-time charges billed again (same VAT basis as the base)
  rules: PricingRules;
};

export type YearFactor = { year: number; ratePct: string; fraction: string; estimated: boolean };

export type InstantQuoteResult = {
  status: "offered" | "blocked";
  reasons: BlockReason[];
  /** Present whenever a past price exists — even when blocked (staff see it as the suggested price). */
  price?: {
    baseNet: string;                    // past price, VAT-exclusive, pesos
    inflationFactor: string;            // e.g. 1.05123456
    years: YearFactor[];
    surchargePct: string;
    clientAdjustmentPct: string;
    adjustmentPct: string;              // total change vs past price (before add-ons), %
    addons: string; recharges: string;  // pesos, VAT-exclusive
    preRoundNet: string;                // pesos, VAT-exclusive
    totalCentavos: number;              // what the client pays (VAT-inclusive), after rounding up
    netCentavos: number;
    vatCentavos: number;
    unitPrice: string;                  // VAT-inclusive per piece, 4 decimals
    floorApplied: boolean;
    capApplied: boolean;
    ageYears: string;
  };
  validUntil: string;
};

const DAY = 86_400_000;
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const daysInYear = (y: number) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);
export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * DAY).toISOString().slice(0, 10);
}

/** Compounded, day-prorated inflation factor between two dates. */
export function inflationFactor(from: string, to: string, rates: InflationRate[]): { factor: Decimal; years: YearFactor[] } {
  const start = toUtc(from), end = toUtc(to);
  const years: YearFactor[] = [];
  let factor = new Decimal(1);
  if (end <= start) return { factor, years };
  const byYear = new Map(rates.map((r) => [r.year, new Decimal(r.ratePct)]));
  const known = [...byYear.keys()].sort((a, b) => a - b);
  for (let y = new Date(start).getUTCFullYear(); y <= new Date(end).getUTCFullYear(); y++) {
    const ys = Math.max(start, Date.UTC(y, 0, 1));
    const ye = Math.min(end, Date.UTC(y + 1, 0, 1));
    const days = Math.round((ye - ys) / DAY);
    if (days <= 0) continue;
    let rate = byYear.get(y);
    let estimated = false;
    if (rate === undefined) {
      const prev = known.filter((k) => k < y).pop() ?? known[0];
      rate = prev !== undefined ? byYear.get(prev)! : new Decimal(0);
      estimated = true;
    }
    const fraction = new Decimal(days).div(daysInYear(y));
    factor = factor.mul(rate.div(100).plus(1).pow(fraction));
    years.push({ year: y, ratePct: rate.toString(), fraction: fraction.toDecimalPlaces(6).toString(), estimated });
  }
  return { factor, years };
}

function roundUp(value: Decimal, step: Decimal): Decimal {
  return value.div(step).ceil().mul(step);
}

export function computeInstantQuote(i: InstantQuoteInput): InstantQuoteResult {
  const reasons: BlockReason[] = [];
  const validUntil = addDays(i.today, i.rules.quoteValidityDays);
  if (!i.instantQuotesAllowed) reasons.push("instant_quotes_off");
  if (!i.specsMatch) reasons.push("specs_changed");
  if (i.hasRevisions) reasons.push("has_revisions");
  if (!i.tierQuantities.includes(i.quantity)) reasons.push("quantity_not_in_tiers");
  if (!i.base) {
    if (!reasons.includes("quantity_not_in_tiers")) reasons.push("no_past_price");
    return { status: "blocked", reasons, validUntil };
  }

  const vat = new Decimal(i.rules.vatRatePct).div(100);
  const toNet = (centavos: number, inclusive: boolean) => (inclusive ? new Decimal(centavos).div(100).div(vat.plus(1)) : new Decimal(centavos).div(100));
  const baseNet = toNet(i.base.totalCentavos, i.base.vatInclusive);
  const ageYears = new Decimal(Math.max(0, toUtc(i.today) - toUtc(i.base.date)) / DAY).div(365.25);
  if (ageYears.gt(i.rules.maxEstimateAgeYears)) reasons.push("estimate_too_old");

  const { factor, years } = inflationFactor(i.base.date, i.today, i.inflation);
  const surcharge = new Decimal(i.surchargePct);
  const clientAdj = new Decimal(i.clientAdjustmentPct);
  let adjusted = baseNet.mul(factor).mul(surcharge.div(100).plus(1)).mul(clientAdj.div(100).plus(1));

  let capApplied = false;
  if (i.clientCapPct !== null && i.clientCapPct !== undefined && i.clientCapPct !== "") {
    const capValue = baseNet.mul(new Decimal(i.clientCapPct).div(100).plus(1));
    if (adjusted.gt(capValue)) { adjusted = capValue; capApplied = true; }
  }
  const floor = baseNet.mul(Decimal.min(clientAdj, 0).div(100).plus(1));
  let floorApplied = false;
  if (adjusted.lt(floor)) { adjusted = floor; floorApplied = true; }

  const adjustmentPct = adjusted.div(baseNet).minus(1).mul(100);
  if (adjustmentPct.gt(i.rules.maxAdjustmentPct)) reasons.push("adjustment_over_limit");

  const addons = new Decimal(i.addonsCentavos).div(100);
  const recharges = toNet(i.rechargeCentavos, i.base.vatInclusive);
  const preRoundNet = adjusted.plus(addons).plus(recharges);
  const gross = preRoundNet.mul(vat.plus(1));
  const step = new Decimal(i.rules.roundingStepPesos);
  let total: Decimal, unit: Decimal;
  if (i.rules.roundingScope === "unit_price") {
    unit = roundUp(gross.div(i.quantity), step.div(100));      // ₱1 → ₱0.01, ₱5 → ₱0.05, ₱10 → ₱0.10
    total = unit.mul(i.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else {
    total = roundUp(gross, step);
    unit = total.div(i.quantity);
  }
  const totalCentavos = total.mul(100).toDecimalPlaces(0).toNumber();
  // Same VAT split as the database (private.vat_split): VAT = round(total − total / 1.12)
  const vatCentavos = new Decimal(totalCentavos).minus(new Decimal(totalCentavos).div(vat.plus(1))).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

  return {
    status: reasons.length ? "blocked" : "offered",
    reasons,
    validUntil,
    price: {
      baseNet: baseNet.toDecimalPlaces(4).toString(),
      inflationFactor: factor.toDecimalPlaces(8).toString(),
      years,
      surchargePct: surcharge.toString(),
      clientAdjustmentPct: clientAdj.toString(),
      adjustmentPct: adjustmentPct.toDecimalPlaces(3).toString(),
      addons: addons.toFixed(2), recharges: recharges.toDecimalPlaces(4).toString(),
      preRoundNet: preRoundNet.toDecimalPlaces(4).toString(),
      totalCentavos, netCentavos: totalCentavos - vatCentavos, vatCentavos,
      unitPrice: unit.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
      floorApplied, capApplied,
      ageYears: ageYears.toDecimalPlaces(2).toString(),
    },
  };
}
