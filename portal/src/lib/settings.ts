import "server-only";
import { cache } from "react";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Shapes and defaults for each settings key (see the `settings` table). */
export const settingSchemas = {
  company: z.object({
    name: z.string().default("Print Amplified"),
    legal_name: z.string().default(""),
    address: z.string().default(""),
    phone: z.string().default(""),
    email: z.string().default(""),
    website: z.string().default("https://www.printamplified.com"),
  }),
  branding: z.object({
    primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#00AEBF"),
    accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#E0295A"),
    logo_path: z.string().nullable().default(null),
  }),
  payment_instructions: z.object({
    bank_accounts: z.array(z.object({
      bank: z.string(), account_name: z.string(), account_no: z.string(), branch: z.string().optional().default(""),
    })).default([]),
    cheque_payee: z.string().default(""),
    notes: z.string().default(""),
  }),
  email: z.object({
    from_name: z.string().default("Print Amplified"),
    from_email: z.string().default("orders@order.printamplified.com"),
    reply_to: z.string().default(""),
  }),
  security: z.object({
    require_mfa: z.boolean().default(true),
    web_session_hours: z.number().int().min(1).max(24 * 30).default(12),
    app_session_days: z.number().int().min(1).max(365).default(30),
    lockout_max_attempts: z.number().int().min(3).max(20).default(5),
    lockout_minutes: z.number().int().min(1).max(240).default(15),
  }),
  uploads: z.object({ max_file_mb: z.number().int().min(1).max(500).default(50) }),
  features: z.object({ ai_autofill_enabled: z.boolean().default(false) }),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>;

const loadAll = cache(async (): Promise<Record<string, unknown>> => {
  const { data, error } = await supabaseAdmin().from("settings").select("key, value");
  if (error) throw new Error(`Could not load settings: ${error.message}`);
  return Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
});

/**
 * Read a setting on the server (bypasses RLS: settings are needed before
 * sign-in, e.g. company name and logo on the login page). Never pass a
 * `staff` setting to a client component unless the viewer is staff.
 */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const all = await loadAll();
  const parsed = settingSchemas[key].safeParse(all[key] ?? {});
  return (parsed.success ? parsed.data : settingSchemas[key].parse({})) as SettingValue<K>;
}
