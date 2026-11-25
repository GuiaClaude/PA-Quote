"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { settingSchemas, type SettingKey } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { t } from "@/i18n";
import type { ActionState } from "./account";

const EDITABLE: SettingKey[] = ["company", "branding", "payment_instructions", "email", "security", "uploads"];

/**
 * Save one settings section. Each form posts its values as JSON in a
 * "value" field. Validated with the same schema the app reads with, and
 * written AS THE USER so the database only lets pa_admin change settings.
 */
export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await getSessionUser();
  if (me?.staffRole !== "pa_admin") return { error: t.settings.onlyAdmin };
  const key = String(formData.get("key")) as SettingKey;
  if (!EDITABLE.includes(key)) return { error: "Unknown setting." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("value") ?? "{}"));
  } catch {
    return { error: "Could not read the form." };
  }
  const parsed = settingSchemas[key].safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `Please check "${issue?.path.join(".") ?? key}": ${issue?.message}` };
  }
  const sb = await supabaseServer();
  const { data: before } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  const { data: saved, error } = await sb.from("settings").update({ value: parsed.data, updated_by: me.id }).eq("key", key).select("key").maybeSingle();
  if (error || !saved) return { error: t.settings.onlyAdmin };
  await audit({ action: "settings.updated", actorId: me.id, actorEmail: me.email, entityType: "settings", entityId: key, meta: { before: before?.value ?? null, after: parsed.data } });
  revalidatePath("/", "layout");
  return { message: t.settings.saved };
}
