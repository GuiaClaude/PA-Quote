import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { previewKind } from "@/lib/files/types";

/**
 * OPTIONAL, PAID: "Auto-fill from file" for past estimates.
 * Sends the uploaded estimate (PDF or scan) to the Claude API and gets the
 * fields back as checked JSON. The result ONLY pre-fills the staff form —
 * nothing is saved or used for pricing until a staff member confirms it.
 * Off unless Settings → Optional features → AI auto-fill is on AND
 * ANTHROPIC_API_KEY is set.
 */
export const MODEL = "claude-opus-5-5";

const money = z.string().regex(/^\d+(\.\d{1,4})?$/).nullable().describe("Plain number in pesos, no commas or ₱, e.g. 1850.00");
export const extractionSchema = z.object({
  estimate_no: z.string().nullable(),
  estimate_date: z.string().nullable().describe("YYYY-MM-DD"),
  client_name: z.string().nullable(),
  product: z.string().nullable().describe("What is being printed, e.g. 'Brochure A4 trifold'"),
  spec: z.object({
    size: z.string().nullable(),
    material: z.string().nullable().describe("Paper or material name without GSM"),
    gsm: z.number().int().nullable(),
    colors: z.string().nullable().describe("e.g. 4/4, 4/0 + PMS 286C"),
    finishing: z.array(z.string()),
    packaging: z.string().nullable(),
  }),
  vat_inclusive: z.boolean().nullable().describe("true if the prices include 12% VAT, false if VAT is added on top, null if unclear"),
  lines: z.array(z.object({ quantity: z.number().int(), unit_price: money, total: money })).describe("One entry per quoted quantity"),
  charges: z.array(z.object({ label: z.string(), amount: money })).describe("One-time charges: plates, dies, setup, layout, delivery"),
  valid_until: z.string().nullable().describe("YYYY-MM-DD"),
  notes: z.string().nullable(),
  uncertain: z.array(z.string()).describe("Fields you were unsure about, in plain words"),
});
export type Extraction = z.infer<typeof extractionSchema>;

export async function autofillAvailable(): Promise<boolean> {
  return Boolean(env().ANTHROPIC_API_KEY) && (await getSetting("features")).ai_autofill_enabled;
}

const PROMPT = `This is a printing cost estimate / quotation from Print Amplified (a commercial printer in the Philippines) to a client.
Extract the fields. Rules:
- Copy numbers exactly as printed; write money as plain pesos without commas or currency symbols.
- One "lines" entry per quoted quantity. If only a unit price or only a total is shown, leave the other null.
- vat_inclusive: true if prices say "VAT inclusive"/"VAT inc."; false if VAT (12%) is added separately or prices say "VAT exclusive"/"+VAT"; null if not stated.
- Dates as YYYY-MM-DD. Use null for anything not on the document; never guess.
- List anything you are unsure about in "uncertain".`;

export async function extractEstimate(file: Uint8Array): Promise<{ data?: Extraction; error?: string; usage?: { input: number; output: number } }> {
  if (!(await autofillAvailable())) return { error: "Auto-fill is switched off." };
  const kind = previewKind(file.subarray(0, 1024));
  const b64 = Buffer.from(file).toString("base64");
  let content: Anthropic.Beta.BetaContentBlockParam;
  if (kind === "pdf") {
    content = { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } };
  } else if (kind === "image") {
    const isPng = file[0] === 0x89;
    content = { type: "image", source: { type: "base64", media_type: isPng ? "image/png" : "image/jpeg", data: b64 } };
  } else {
    return { error: "Auto-fill reads PDF, JPG and PNG files. For spreadsheets, type the values in." };
  }

  const client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // if the model declines, the API retries on a fallback model in the same call
      output_config: { effort: "low", format: zodOutputFormat(extractionSchema) },
      messages: [{ role: "user", content: [content, { type: "text", text: PROMPT }] }],
    });
    const usage = { input: response.usage.input_tokens, output: response.usage.output_tokens };
    if (response.stop_reason === "refusal") return { error: "The document could not be read automatically. Please type the values in.", usage };
    if (response.stop_reason === "max_tokens") return { error: "The document was too long to read in one go. Please type the values in.", usage };
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
    let json: unknown;
    try { json = JSON.parse(text); } catch { return { error: "Could not read the result. Please type the values in.", usage }; }
    const parsed = extractionSchema.safeParse(json);
    if (!parsed.success) return { error: "The result was incomplete. Please type the values in.", usage };
    return { data: parsed.data, usage };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { error: "The Claude API key is not valid. Check ANTHROPIC_API_KEY." };
    if (e instanceof Anthropic.RateLimitError) return { error: "Too many requests right now — try again in a minute." };
    if (e instanceof Anthropic.APIError) return { error: `Auto-fill failed (${e.status ?? "network"}). Please type the values in.` };
    throw e;
  }
}
