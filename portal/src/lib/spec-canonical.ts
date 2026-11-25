/** Browser-safe spec helpers (no Node APIs). Server code uses ./specs. */
import { z } from "zod";

/** The structured specs of a Print Item (also used by estimates and orders). */
export const specSchema = z.object({
  size: z.string().trim().max(120).default(""),
  material: z.string().trim().max(120).default(""),
  gsm: z.union([z.number().int().positive().max(2000), z.null()]).default(null),
  colors: z.string().trim().max(120).default(""),
  finishing: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  packaging: z.string().trim().max(160).default(""),
  notes: z.string().trim().max(2000).default(""),
});
export type Spec = z.infer<typeof specSchema>;

/** The fields that decide whether two jobs are "the same specs" (notes don't count). */
const MATCH_FIELDS = ["size", "material", "gsm", "colors", "finishing", "packaging"] as const;

function norm(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[×✕]/g, "x")
    .replace(/\s*x\s*/g, "x")           // "12 x 10" == "12x10"
    .replace(/\s*\/\s*/g, "/")          // "4 / 4" == "4/4"
    .replace(/["”″]/g, "in")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical form: same specs always give exactly the same text. */
export function canonicalSpec(spec: Partial<Spec>): string {
  const s = specSchema.parse(spec);
  const obj: Record<string, unknown> = {};
  for (const k of MATCH_FIELDS) {
    const v = s[k];
    obj[k] = Array.isArray(v) ? [...new Set(v.map(norm).filter(Boolean))].sort() : typeof v === "string" ? norm(v) : v;
  }
  return JSON.stringify(obj);
}

/** Form text "matte lamination, spot UV" -> ["matte lamination", "spot UV"] */
export function splitList(text: string): string[] {
  return text.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
}
