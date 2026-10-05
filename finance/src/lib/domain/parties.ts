/** TIN and company-name normalisation used for matching and duplicate detection. */

export interface NormalizedTin {
  tin: string; // 9 digits
  branch: string; // 3–5 digits, "000" = head office
}

/**
 * "004-832-713-000", "004832713", "004-832-713-0000", "010-279-515-00000" → { tin, branch }.
 * Returns null when there are not at least 9 digits.
 */
export function normalizeTin(raw: unknown): NormalizedTin | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 9) return null;
  const tin = digits.slice(0, 9);
  const rest = digits.slice(9);
  if (rest.length > 5) return null;
  // Branch codes are written with 3, 4 or 5 digits ("000", "0000", "00012"); keep the number, 3 digits minimum.
  const branch = String(Number(rest || "0")).padStart(3, "0");
  return { tin, branch };
}

export function formatTin(tin: string | null | undefined, branch?: string | null): string {
  if (!tin) return "";
  const t = tin.replace(/\D/g, "");
  if (t.length !== 9) return tin;
  return `${t.slice(0, 3)}-${t.slice(3, 6)}-${t.slice(6, 9)}-${(branch || "000").padStart(3, "0")}`;
}

const SUFFIXES = new Set([
  "INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COMPANY", "OPC", "LTD", "LIMITED", "LLC", "THE",
  "PHILS", "PHILIPPINES", "PHIL", "ENT", "ENTERPRISE", "ENTERPRISES", "TRADING", "SERVICES",
]);

/** "AP Blue Whale Corp." / "A.P. BLUE WHALE CORPORATION" → "APBLUEWHALE" */
export function companyKey(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept = words.filter((w) => !SUFFIXES.has(w));
  return (kept.length ? kept : words).join("");
}

/** Jaro–Winkler similarity, 0..1. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a.length ? 1 : 0;
  if (!a.length || !b.length) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aM = new Array<boolean>(a.length).fill(false);
  const bM = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (bM[j] || a[i] !== b[j]) continue;
      aM[i] = bM[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  for (let i = 0, k = 0; i < a.length; i++) {
    if (!aM[i]) continue;
    while (!bM[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

export interface DuplicateCandidate<T> {
  a: T;
  b: T;
  score: number;
  reason: "same_tin" | "similar_name";
}

/** Pairs that are probably the same company: same TIN, or very similar normalised names. */
export function findDuplicateCandidates<T extends { name: string; tin?: string | null }>(
  parties: T[],
  threshold = 0.92,
): DuplicateCandidate<T>[] {
  const out: DuplicateCandidate<T>[] = [];
  const keys = parties.map((p) => companyKey(p.name));
  for (let i = 0; i < parties.length; i++) {
    for (let j = i + 1; j < parties.length; j++) {
      const a = parties[i]!;
      const b = parties[j]!;
      if (a.tin && b.tin && a.tin === b.tin) {
        out.push({ a, b, score: 1, reason: "same_tin" });
        continue;
      }
      if (a.tin && b.tin && a.tin !== b.tin) continue; // different TINs: different taxpayers
      const score = jaroWinkler(keys[i]!, keys[j]!);
      if (score >= threshold) out.push({ a, b, score, reason: "similar_name" });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/** "CE# ABC2024-001 (Business Cards)" / "PA-CE-2026-0001" → matching key "ABC2024-001" / "PA-CE-2026-0001". */
export function ceKey(raw: string): string {
  const s = raw.toUpperCase().trim();
  const pa = /PA-CE-[A-Z0-9-]+/.exec(s.replace(/\s+/g, ""));
  if (pa) return pa[0];
  const m = /CE\s*#?\s*([A-Z]+\s*\d{4}\s*-\s*\d{2,4}[A-Z]?)/.exec(s);
  if (m) return m[1]!.replace(/\s+/g, "");
  return s.replace(/^CE\s*#?\s*/, "").replace(/[\s#]+/g, "");
}
