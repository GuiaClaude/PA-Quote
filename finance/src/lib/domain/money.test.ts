import { describe, expect, it } from "vitest";
import { AmountParseError, formatPeso, formatPesoCompact, parseAmount, prorate, splitVatInclusive, withholdingOnNet } from "./money";

describe("parseAmount", () => {
  it.each([
    [1234.5, 123450],
    [2130.76, 213076],
    [1234.565, 123457], // Excel shows 1234.57
    ["1,234.50", 123450],
    ["PHP 2,130.76", 213076],
    ["₱1,234", 123400],
    ["(1,000.00)", -100000],
    ["-500", -50000],
    ["12, 345.67", 1234567],
    ["12.345.67", 1234567],
    ["0.005", 1],
    ["  38,667.95 ", 3866795],
  ])("%s → %d centavos", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each([[""], ["-"], [null], [undefined], ["  "]])("blank %s → null", (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it.each([["#REF!"], ["#DIV/0!"], ["#N/A"], ["abc"], ["1,2a"]])("rejects %s", (input) => {
    expect(() => parseAmount(input)).toThrow(AmountParseError);
  });
});

describe("formatPeso", () => {
  it("formats with thousands separators and two decimals", () => {
    expect(formatPeso(123456789)).toBe("₱1,234,567.89");
    expect(formatPeso(5)).toBe("₱0.05");
    expect(formatPeso(-100000)).toBe("-₱1,000.00");
    expect(formatPeso(0, { blankZero: true })).toBe("");
  });
  it("compact form", () => {
    expect(formatPesoCompact(123_456_700)).toBe("₱1.23M");
    expect(formatPesoCompact(84_500_000)).toBe("₱845K");
    expect(formatPesoCompact(95_000)).toBe("₱950");
  });
});

describe("VAT", () => {
  it("splits ₱11,200.00 into ₱10,000.00 + ₱1,200.00", () => {
    expect(splitVatInclusive(1_120_000)).toEqual({ net: 1_000_000, vat: 120_000 });
  });
  it("parts always add back to the gross", () => {
    for (let g = 0; g < 50_000; g += 7) {
      const { net, vat } = splitVatInclusive(g);
      expect(net + vat).toBe(g);
      expect(Math.abs(vat - Math.round(g * 12 / 112))).toBeLessThanOrEqual(1);
    }
  });
  it("matches the sheet formula Total/1.12 for ₱38,667.95", () => {
    // 38,667.95 / 1.12 = 34,524.955… → 34,524.96; VAT = 4,142.99
    expect(splitVatInclusive(3_866_795)).toEqual({ net: 3_452_496, vat: 414_299 });
  });
  it("zero rate leaves everything as net", () => {
    expect(splitVatInclusive(10_000, 0)).toEqual({ net: 10_000, vat: 0 });
  });
});

describe("withholding", () => {
  it("2% CWT on the net of VAT (gross ₱11,200 → ₱200)", () => {
    const { net } = splitVatInclusive(1_120_000);
    expect(withholdingOnNet(net, 200)).toBe(20_000);
  });
  it("1% EWT", () => {
    expect(withholdingOnNet(3_452_496, 100)).toBe(34_525);
  });
  it("prorates deferred VAT on a partial payment", () => {
    expect(prorate(120_000, 560_000, 1_120_000)).toBe(60_000);
  });
});
