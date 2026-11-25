import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { computeInstantQuote, inflationFactor, type InstantQuoteInput } from "@/lib/pricing/instant-quote";

const RATES = [
  { year: 2022, ratePct: 5.8 }, { year: 2023, ratePct: 6.0 }, { year: 2024, ratePct: 3.2 }, { year: 2025, ratePct: 2.0 }, { year: 2026, ratePct: 2.0 },
];
const RULES = { vatRatePct: 12, roundingStepPesos: 1 as const, roundingScope: "order_total" as const, maxEstimateAgeYears: 3, maxAdjustmentPct: 20, quoteValidityDays: 15, version: 1 };

function input(p: Partial<InstantQuoteInput> = {}): InstantQuoteInput {
  return {
    today: "2026-01-01", quantity: 1000,
    base: { totalCentavos: 100_000, quantity: 1000, date: "2025-01-01", vatInclusive: false },
    tierQuantities: [1000, 2000], specsMatch: true, hasRevisions: false, instantQuotesAllowed: true,
    inflation: RATES, surchargePct: 0, clientAdjustmentPct: 0, clientCapPct: null, addonsCentavos: 0, rechargeCentavos: 0,
    rules: RULES, ...p,
  };
}

describe("inflation factor", () => {
  it("a full year at 2% is exactly 1.02", () => {
    expect(inflationFactor("2025-01-01", "2026-01-01", RATES).factor.toString()).toBe("1.02");
  });
  it("compounds across years (2023 at 6% then 2024 at 3.2%)", () => {
    const { factor, years } = inflationFactor("2023-01-01", "2025-01-01", RATES);
    expect(factor.toDecimalPlaces(10).toString()).toBe("1.09392");
    expect(years.map((y) => y.fraction)).toEqual(["1", "1"]);       // 2024 is a leap year: 366/366
  });
  it("prorates partial years by days", () => {
    const { factor, years } = inflationFactor("2023-07-01", "2024-07-01", RATES);
    expect(years.map((y) => [y.year, y.fraction])).toEqual([[2023, "0.50411"], [2024, "0.497268"]]); // 184/365, 182/366
    const expected = new Decimal(1.06).pow(new Decimal(184).div(365)).mul(new Decimal(1.032).pow(new Decimal(182).div(366)));
    expect(factor.toDecimalPlaces(12).eq(expected.toDecimalPlaces(12))).toBe(true);
    expect(factor.gt(1.03) && factor.lt(1.06)).toBe(true);
  });
  it("half a year of 2% is about 1%, not 2%", () => {
    const f = inflationFactor("2025-07-02", "2026-01-01", RATES).factor;
    expect(f.gt(1.0098) && f.lt(1.0101)).toBe(true);
  });
  it("uses the latest known rate for a year without one, and flags it", () => {
    const { years } = inflationFactor("2026-06-01", "2027-03-01", RATES);
    expect(years.find((y) => y.year === 2027)).toMatchObject({ ratePct: "2", estimated: true });
  });
  it("no time passed = no inflation", () => {
    expect(inflationFactor("2026-01-01", "2026-01-01", RATES).factor.toString()).toBe("1");
  });
});

describe("instant price", () => {
  it("past price × inflation, plus VAT, rounded up to ₱1", () => {
    const r = computeInstantQuote(input());
    expect(r.status).toBe("offered");
    // ₱1,000 × 1.02 = ₱1,020 net → × 1.12 = ₱1,142.40 → round up → ₱1,143
    expect(r.price).toMatchObject({ totalCentavos: 114_300, vatCentavos: 12_246, netCentavos: 102_054, adjustmentPct: "2", unitPrice: "1.1430" });
    expect(r.validUntil).toBe("2026-01-16");
  });

  it("rounds up to ₱5 or ₱10 when chosen (never down)", () => {
    expect(computeInstantQuote(input({ rules: { ...RULES, roundingStepPesos: 5 } })).price!.totalCentavos).toBe(114_500);
    expect(computeInstantQuote(input({ rules: { ...RULES, roundingStepPesos: 10 } })).price!.totalCentavos).toBe(115_000);
    // already on the step: stays
    const exact = computeInstantQuote(input({ today: "2025-01-01", base: { totalCentavos: 112_000, quantity: 1000, date: "2025-01-01", vatInclusive: true }, rules: { ...RULES, roundingStepPesos: 10 } }));
    expect(exact.price!.totalCentavos).toBe(112_000);
  });

  it("handles VAT-inclusive and VAT-exclusive past prices correctly (VAT is never inflated twice)", () => {
    const incl = computeInstantQuote(input({ base: { totalCentavos: 112_000, quantity: 1000, date: "2025-01-01", vatInclusive: true } }));
    const excl = computeInstantQuote(input({ base: { totalCentavos: 100_000, quantity: 1000, date: "2025-01-01", vatInclusive: false } }));
    expect(incl.price!.baseNet).toBe("1000");
    expect(incl.price!.totalCentavos).toBe(excl.price!.totalCentavos);   // same real price
  });

  it("rounds the unit price instead when the scope is per piece", () => {
    const base = { totalCentavos: 290_000, quantity: 1000, date: "2026-01-01", vatInclusive: true };
    const r = computeInstantQuote(input({ today: "2026-01-01", base, rules: { ...RULES, roundingStepPesos: 5, roundingScope: "unit_price" } }));
    expect(r.price).toMatchObject({ unitPrice: "2.9000", totalCentavos: 290_000 });
    const r2 = computeInstantQuote(input({ today: "2026-01-01", base, surchargePct: 0.1, rules: { ...RULES, roundingStepPesos: 5, roundingScope: "unit_price" } }));
    expect(r2.price).toMatchObject({ unitPrice: "2.9500", totalCentavos: 295_000 });
  });

  it("adds the material surcharge, client adjustment, fixed add-ons and charges billed again", () => {
    const r = computeInstantQuote(input({ surchargePct: 5, clientAdjustmentPct: -3, addonsCentavos: 10_000, rechargeCentavos: 6_000 }));
    // 1000 × 1.02 × 1.05 × 0.97 = 1038.87 ; + 100 add-on + 60 plates = 1198.87 net ; × 1.12 = 1342.7344 → ₱1,343
    expect(r.price!.preRoundNet).toBe("1198.87");
    expect(r.price!.totalCentavos).toBe(134_300);
    expect(r.price!.adjustmentPct).toBe("3.887");
  });

  it("minimum rule: never below the past price…", () => {
    const r = computeInstantQuote(input({ inflation: [{ year: 2025, ratePct: -2 }] }));
    expect(r.price!.floorApplied).toBe(true);
    expect(r.price!.totalCentavos).toBe(112_000);   // ₱1,000 × 1.12
  });

  it("…unless the client has a discount", () => {
    const r = computeInstantQuote(input({ inflation: [{ year: 2025, ratePct: 0 }], clientAdjustmentPct: -5 }));
    expect(r.price!.floorApplied).toBe(false);
    expect(r.price!.totalCentavos).toBe(106_400);   // ₱950 × 1.12
  });

  it("applies a negotiated client cap", () => {
    const r = computeInstantQuote(input({ inflation: [{ year: 2025, ratePct: 10 }], clientCapPct: 5 }));
    expect(r.price).toMatchObject({ capApplied: true, adjustmentPct: "5", totalCentavos: 117_600 });
  });
});

describe("when an instant quote is NOT allowed (Needs Quote)", () => {
  it("estimate older than the limit", () => {
    const r = computeInstantQuote(input({ today: "2026-11-25", base: { totalCentavos: 320_000, quantity: 1000, date: "2022-05-18", vatInclusive: true } }));
    expect(r.status).toBe("blocked");
    expect(r.reasons).toEqual(["estimate_too_old"]);
    expect(r.price?.totalCentavos).toBeGreaterThan(320_000);   // staff still get a suggested price
    expect(Number(r.price!.ageYears)).toBeGreaterThan(4.4);
  });
  it("adjustment over the limit", () => {
    const r = computeInstantQuote(input({ inflation: [{ year: 2025, ratePct: 25 }] }));
    expect(r.reasons).toEqual(["adjustment_over_limit"]);
  });
  it("a spec change ALWAYS blocks — even with a perfect past price", () => {
    expect(computeInstantQuote(input({ specsMatch: false })).reasons).toEqual(["specs_changed"]);
  });
  it("a revision ALWAYS blocks", () => {
    expect(computeInstantQuote(input({ hasRevisions: true })).reasons).toEqual(["has_revisions"]);
  });
  it("a quantity that is not one of the tiers blocks (no interpolation)", () => {
    const r = computeInstantQuote(input({ quantity: 1500, base: null }));
    expect(r.status).toBe("blocked");
    expect(r.reasons).toEqual(["quantity_not_in_tiers"]);
    expect(r.price).toBeUndefined();
  });
  it("no confirmed past price", () => {
    expect(computeInstantQuote(input({ base: null, tierQuantities: [] , quantity: 1000 })).reasons).toEqual(["quantity_not_in_tiers"]);
    expect(computeInstantQuote(input({ base: null })).reasons).toEqual(["no_past_price"]);
  });
  it("instant quotes switched off for the client", () => {
    expect(computeInstantQuote(input({ instantQuotesAllowed: false })).reasons).toEqual(["instant_quotes_off"]);
  });
  it("reports every reason at once", () => {
    const r = computeInstantQuote(input({ specsMatch: false, hasRevisions: true, instantQuotesAllowed: false }));
    expect(r.reasons.sort()).toEqual(["has_revisions", "instant_quotes_off", "specs_changed"]);
  });
});
