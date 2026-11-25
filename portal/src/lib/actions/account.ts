"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { t } from "@/i18n";

export type ActionState = { error?: string; message?: string } | undefined;

const profileForm = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  phone: z.string().trim().max(40).optional(),
});

/** Users edit their own name and mobile number (RLS: only their own row; role/active fields are locked). */
export async function updateMyProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me) return { error: "Please sign in again." };
  const parsed = profileForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const sb = await supabaseServer();
  const { error } = await sb.from("profiles").update({ full_name: parsed.data.fullName, phone: parsed.data.phone || null }).eq("id", me.id);
  if (error) return { error: t.auth.genericError };
  await audit({ action: "profile.updated", actorId: me.id, actorEmail: me.email });
  revalidatePath("/", "layout");
  return { message: t.account.saved };
}
