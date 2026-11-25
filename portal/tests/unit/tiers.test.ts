import { describe, expect, it } from "vitest";
import { tierFromTotal, tierFromUnit } from "@/lib/pricing/tiers";

describe("quote tier maths", () => {
  it("derives the unit price from a total", () => {
    expect(tierFromTotal(1000, "2,900.00")).toEqual({ unit: "2.9000", totalCentavos: 290000 });
    expect(tierFromTotal(3, "100")).toEqual({ unit: "33.3333", totalCentavos: 10000 });
  });
  it("derives the total from a unit price without float errors", () => {
    expect(tierFromUnit(15000, "0.84")).toEqual({ unit: "0.8400", totalCentavos: 1260000 });
    expect(tierFromUnit(3, "0.1")).toEqual({ unit: "0.1000", totalCentavos: 30 });   // 0.1 × 3 is exactly ₱0.30
    expect(tierFromUnit(7, "1.23456")).toEqual({ unit: "1.2346", totalCentavos: 864 }); // rounded half-up
  });
  it("rejects zero, negative and junk", () => {
    expect(() => tierFromTotal(100, "0")).toThrow();
    expect(() => tierFromUnit(100, "-1")).toThrow();
    expect(() => tierFromTotal(100, "abc")).toThrow();
  });
});
