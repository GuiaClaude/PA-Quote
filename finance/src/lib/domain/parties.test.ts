import { describe, expect, it } from "vitest";
import { ceKey, companyKey, findDuplicateCandidates, formatTin, normalizeTin } from "./parties";

describe("TIN", () => {
  it.each([
    ["123-456-789-000", { tin: "123456789", branch: "000" }],
    ["123-456-789-0000", { tin: "123456789", branch: "000" }],
    ["123-456-789-00000", { tin: "123456789", branch: "000" }],
    ["123-456-789", { tin: "123456789", branch: "000" }],
    ["123-456789-161", { tin: "123456789", branch: "161" }],
    ["123456789 00012", { tin: "123456789", branch: "012" }],
  ])("%s", (raw, expected) => {
    expect(normalizeTin(raw)).toEqual(expected);
  });
  it("rejects short values", () => {
    expect(normalizeTin("123-456")).toBeNull();
    expect(normalizeTin(null)).toBeNull();
  });
  it("formats", () => {
    expect(formatTin("123456789", "000")).toBe("123-456-789-000");
  });
});

describe("company matching", () => {
  it("ignores suffixes, punctuation and case", () => {
    expect(companyKey("Acme Printing Corp.")).toBe(companyKey("ACME PRINTING CORPORATION"));
    expect(companyKey("Acme Printing, Inc.")).toBe("ACMEPRINTING");
  });
  it("suggests near-identical names and same TINs, never different TINs", () => {
    const parties = [
      { id: 1, name: "Bluefin Trading Corp", tin: null },
      { id: 2, name: "BLUE FINN TRADING CORPORATION", tin: null },
      { id: 3, name: "Orion Foods", tin: "111111111" },
      { id: 4, name: "Orion Food Inc", tin: "222222222" },
      { id: 5, name: "Sampaguita Press", tin: "333333333" },
      { id: 6, name: "Totally Different", tin: "333333333" },
    ];
    const pairs = findDuplicateCandidates(parties).map((p) => [p.a.id, p.b.id, p.reason]);
    expect(pairs).toContainEqual([1, 2, "similar_name"]);
    expect(pairs).toContainEqual([5, 6, "same_tin"]);
    expect(pairs.find((p) => p[0] === 3 && p[1] === 4)).toBeUndefined();
  });
});

describe("CE numbers", () => {
  it.each([
    ["CE# ABC2024-001 (Business Cards)", "ABC2024-001"],
    ["CE#XY2023 - 004 - Flyers", "XY2023-004"],
    ["CE# ZZ2024-001A (box)", "ZZ2024-001A"],
    ["PA-CE-2026-0001", "PA-CE-2026-0001"],
    ["pa-ce-2026-acme-0003", "PA-CE-2026-ACME-0003"],
  ])("%s → %s", (raw, key) => {
    expect(ceKey(raw)).toBe(key);
  });
});
