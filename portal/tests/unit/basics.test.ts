import { describe, expect, it } from "vitest";
import { contrastRatio, readableOnWhiteText } from "@/theme/color";
import { passwordProblems } from "@/lib/auth/password";
import { formatCentavos, formatUnitPrice, pesosToCentavos } from "@/lib/money";
import { hashToken, newInviteToken } from "@/lib/auth/tokens";

describe("brand colours stay readable", () => {
  it("darkens the logo teal so white button text passes WCAG AA", () => {
    expect(contrastRatio("#00AEBF", "#ffffff")).toBeLessThan(4.5);
    const fixed = readableOnWhiteText("#00AEBF");
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps colours that are already dark enough", () => {
    expect(readableOnWhiteText("#0f1b2d")).toBe("#0f1b2d");
  });
});

describe("password rules", () => {
  it("rejects short or simple passwords", () => {
    expect(passwordProblems("short1A!")).not.toHaveLength(0);
    expect(passwordProblems("alllowercaseletters")).not.toHaveLength(0);
  });
  it("rejects passwords containing the name or email", () => {
    expect(passwordProblems("Liza-Mendoza-2026", { name: "Liza Mendoza" })).not.toHaveLength(0);
    expect(passwordProblems("Ramon.garcia!2026", { email: "ramon.garcia@abc.com" })).not.toHaveLength(0);
  });
  it("accepts a strong password", () => {
    expect(passwordProblems("Blue-Printer-Morning-42", { name: "Liza Mendoza", email: "liza@abc.com" })).toEqual([]);
  });
});

describe("money", () => {
  it("formats centavos as pesos", () => {
    expect(formatCentavos(123450)).toBe("₱1,234.50");
    expect(formatCentavos(0)).toBe("₱0.00");
    expect(formatCentavos(null)).toBe("—");
  });
  it("keeps 4-decimal unit prices", () => {
    expect(formatUnitPrice("0.8550")).toBe("₱0.855");
    expect(formatUnitPrice("0.8537")).toBe("₱0.8537");
    expect(formatUnitPrice("18.5")).toBe("₱18.50");
  });
  it("converts peso text to centavos exactly (no floating point errors)", () => {
    expect(pesosToCentavos("1,234.50")).toBe(123450);
    expect(pesosToCentavos("0.29")).toBe(29);
    expect(pesosToCentavos("₱ 19.99")).toBe(1999);
    expect(() => pesosToCentavos("12.345")).toThrow();
  });
});

describe("invite tokens", () => {
  it("are random and only their hash is stored", () => {
    const a = newInviteToken();
    expect(a).not.toBe(newInviteToken());
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });
});
