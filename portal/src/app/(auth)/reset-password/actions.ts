"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { passwordProblems } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { t } from "@/i18n";
import type { FormState } from "../login/actions";

export async function saveNewPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login?reason=link");
  if (password !== confirm) return { error: t.auth.passwordsDontMatch };
  const { data: profile } = await sb.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle();
  const problems = passwordProblems(password, { email: auth.user.email, name: profile?.full_name ?? "" });
  if (problems.length) return { error: problems.join(" ") };
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: error.message.includes("different") ? "Choose a password you haven't used before." : t.auth.genericError };
  await audit({ action: "auth.password_changed", actorId: auth.user.id, actorEmail: auth.user.email });
  redirect("/?password=changed");
}
