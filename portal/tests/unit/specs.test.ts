import { describe, expect, it } from "vitest";
import { specSignature, canonicalSpec } from "@/lib/specs";

describe("spec signature (instant-quote matching)", () => {
  const base = { size: "12 x 10 x 8 in", material: "SBS Board", gsm: 300, colors: "4/0 + PMS 286C", finishing: ["spot UV", "die-cut"], packaging: "50 per bundle" };
  it("ignores spacing, letter case and finishing order", () => {
    const same = { size: "12x10x8 IN", material: " sbs  board ", gsm: 300, colors: "4 / 0 + pms 286c", finishing: ["Die-cut", "Spot UV"], packaging: "50 per bundle", notes: "different notes" };
    expect(specSignature(same)).toBe(specSignature(base));
  });
  it("changes when any real spec changes", () => {
    const sig = specSignature(base);
    expect(specSignature({ ...base, gsm: 350 })).not.toBe(sig);
    expect(specSignature({ ...base, colors: "4/4" })).not.toBe(sig);
    expect(specSignature({ ...base, finishing: ["spot UV"] })).not.toBe(sig);
    expect(specSignature({ ...base, size: "12 x 10 x 9 in" })).not.toBe(sig);
    expect(specSignature({ ...base, packaging: "100 per bundle" })).not.toBe(sig);
  });
  it("is stable text", () => {
    expect(canonicalSpec({ size: "A4" })).toBe('{"size":"a4","material":"","gsm":null,"colors":"","finishing":[],"packaging":""}');
  });
});

import { codeFromFileName, importRowSchema } from "@/lib/import/rows";

describe("CSV import", () => {
  it("validates rows", () => {
    expect(importRowSchema.safeParse({ client_name: "ABC", item_name: "Flyer" }).success).toBe(true);
    expect(importRowSchema.safeParse({ client_name: "ABC", item_name: "" }).success).toBe(false);
    expect(importRowSchema.safeParse({ client_name: "ABC", item_name: "Flyer", gsm: "heavy" }).success).toBe(false);
    expect(importRowSchema.safeParse({ client_name: "ABC", item_name: "Flyer", drive_link: "https://dropbox.com/x" }).success).toBe(false);
  });
  it("matches bulk files to item codes by file name", () => {
    const codes = ["ABC-BR-01", "ABC-BR-010", "SF-LBL-80"];
    expect(codeFromFileName("ABC-BR-01.pdf", codes)).toBe("ABC-BR-01");
    expect(codeFromFileName("abc-br-01__front.pdf", codes)).toBe("ABC-BR-01");
    expect(codeFromFileName("ABC-BR-010 final.ai", codes)).toBe("ABC-BR-010");
    expect(codeFromFileName("ABC-BR-012.pdf", codes)).toBeNull();
    expect(codeFromFileName("random.pdf", codes)).toBeNull();
  });
});
