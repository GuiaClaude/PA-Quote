import { z } from "zod";

/** One row of the Print Items import CSV (see public/templates/print-items-import.csv). */
export const importRowSchema = z.object({
  client_name: z.string().trim().min(2, "client_name is required").max(160),
  client_billing_name: z.string().trim().max(200).optional().default(""),
  client_tin: z.string().trim().max(40).optional().default(""),
  client_email_domains: z.string().trim().max(300).optional().default(""),
  item_code: z.string().trim().max(60).optional().default(""),
  item_name: z.string().trim().min(2, "item_name is required").max(160),
  category: z.string().trim().max(120).optional().default(""),
  size: z.string().trim().max(120).optional().default(""),
  material: z.string().trim().max(120).optional().default(""),
  gsm: z.string().trim().regex(/^\d{0,4}$/, "gsm must be a number").optional().default(""),
  colors: z.string().trim().max(120).optional().default(""),
  finishing: z.string().trim().max(400).optional().default(""),
  packaging: z.string().trim().max(160).optional().default(""),
  notes: z.string().trim().max(2000).optional().default(""),
  tags: z.string().trim().max(300).optional().default(""),
  drive_link: z.string().trim().max(500).optional().default("")
    .refine((v) => !v || /^https:\/\/(drive|docs)\.google\.com\//.test(v), "drive_link must be a Google Drive link"),
  drive_label: z.string().trim().max(160).optional().default(""),
});
export type ImportRow = z.infer<typeof importRowSchema>;

/** Lists inside a cell are separated by ";" (commas are the CSV separator). */
export const cellList = (v: string) => v.split(/[;|]+/).map((x) => x.trim()).filter(Boolean);

export const MAX_IMPORT_ROWS = 500;

/** Bulk file names start with the item code: "ABC-BR-01.pdf", "ABC-BR-01__front.pdf", "ABC-BR-01 v2.ai". */
export function codeFromFileName(name: string, codes: string[]): string | null {
  const upper = name.toUpperCase();
  const sorted = [...codes].sort((a, b) => b.length - a.length); // longest first: "ABC-BR-01A" before "ABC-BR-01"
  for (const code of sorted) {
    const c = code.toUpperCase();
    if (upper.startsWith(c) && !/[A-Z0-9]/.test(upper.charAt(c.length))) return code;
  }
  return null;
}
