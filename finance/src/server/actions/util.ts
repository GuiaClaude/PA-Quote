import { z } from "zod";
import { pesoInputToCentavos } from "@/lib/domain/money";
import { UserInputError } from "../documents";

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

/** Turn any thrown error into a message a non-accountant can act on. */
export function toError(e: unknown): ActionResult {
  if (e instanceof UserInputError) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(" ") };
  const msg = e instanceof Error ? e.message : String(e);
  if (/row-level security|permission denied/i.test(msg)) return { ok: false, error: "Your role doesn't allow this change." };
  if (/is closed\. Ask the Owner|before the books start date/.test(msg)) return { ok: false, error: msg.replace(/^.*?: /, "") };
  if (/duplicate key value.*billings_org_doc/.test(msg)) return { ok: false, error: "That document number is already used." };
  if (/duplicate key value.*(clients|suppliers)_org_tin/.test(msg)) return { ok: false, error: "Another record already has this TIN." };
  if (/duplicate key value.*projects_org_ce/.test(msg)) return { ok: false, error: "That CE# already exists." };
  if (/duplicate key value.*accounts_org_id_code_key/.test(msg)) return { ok: false, error: "That account code is already used." };
  console.error(e);
  return { ok: false, error: "Something went wrong while saving. Nothing was changed." };
}

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");
export const uuid = z.string().uuid();
export const optionalText = z.string().trim().max(500).nullish().transform((v) => (v ? v : null));
/** Peso text from a form ("12,345.60") → centavos. */
export const peso = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try {
    return typeof v === "number" ? Math.round(v * 100) : pesoInputToCentavos(v);
  } catch {
    ctx.addIssue({ code: "custom", message: `"${v}" is not a valid amount.` });
    return z.NEVER;
  }
});
