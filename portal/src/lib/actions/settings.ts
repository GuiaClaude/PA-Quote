"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { settingSchemas, type SettingKey } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { t } from "@/i18n";
import type { ActionState } from "./account";

const EDITABLE: SettingKey[] = ["company", "branding", "payment_instructions", "email", "security", "uploads", "features"];

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

/** Management uploaded a new logo to the public "brand" bucket; remember its path. */
export async function setBrandLogo(path: string | null): Promise<ActionState> {
  const me = await getSessionUser();
  if (me?.staffRole !== "pa_admin") return { error: t.settings.onlyAdmin };
  if (path !== null && !/^logo-[0-9a-f-]{36}\.(png|jpg|jpeg|svg|webp)$/.test(path)) return { error: "Invalid logo file." };
  const sb = await supabaseServer();
  const { data: row } = await sb.from("settings").select("value").eq("key", "branding").maybeSingle();
  const value = { ...((row?.value as Record<string, unknown>) ?? {}), logo_path: path };
  const { error } = await sb.from("settings").update({ value, updated_by: me.id }).eq("key", "branding");
  if (error) return { error: t.settings.onlyAdmin };
  await audit({ action: "settings.logo_changed", actorId: me.id, actorEmail: me.email, meta: { logo_path: path } });
  revalidatePath("/", "layout");
  return { message: path ? "Logo updated." : "Logo removed — the standard Print Amplified mark is shown." };
}
