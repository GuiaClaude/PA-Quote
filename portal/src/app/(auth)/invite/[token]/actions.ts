"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { hashToken } from "@/lib/auth/tokens";
import { passwordProblems } from "@/lib/auth/password";
import { completeSignIn } from "@/lib/auth/after-sign-in";
import { audit } from "@/lib/audit";
import { t } from "@/i18n";
import type { FormState } from "../../login/actions";

const form = z.object({
  token: z.string().min(30).max(100),
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  password: z.string(),
  confirm: z.string(),
});

export async function acceptInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = form.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t.auth.genericError };
  const { token, fullName, password, confirm } = parsed.data;
  if (password !== confirm) return { error: t.auth.passwordsDontMatch };

  const admin = supabaseAdmin();
  const { data: inv } = await admin.from("invitations")
    .select("id, email, status, expires_at, organization_id, client_role, staff_role")
    .eq("token_hash", hashToken(token)).maybeSingle();
  if (!inv || inv.status !== "pending") return { error: t.invite.invalid };
  if (new Date(inv.expires_at as string).getTime() < Date.now()) return { error: t.invite.expired };

  const problems = passwordProblems(password, { email: inv.email as string, name: fullName });
  if (problems.length) return { error: problems.join(" ") };

  // Claim the invite first so the link can only ever be used once.
  const { data: claimed } = await admin.from("invitations").update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", inv.id).eq("status", "pending").select("id").maybeSingle();
  if (!claimed) return { error: t.invite.invalid };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: inv.email as string, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    await admin.from("invitations").update({ status: "pending", accepted_at: null }).eq("id", inv.id);
    return { error: createErr?.message?.toLowerCase().includes("already") ? t.invite.alreadyHasAccount : t.auth.genericError };
  }
  const userId = created.user.id;

  await admin.from("profiles").update({ full_name: fullName, staff_role: inv.staff_role ?? null }).eq("id", userId);
  if (inv.organization_id) {
    await admin.from("memberships").insert({ profile_id: userId, organization_id: inv.organization_id, client_role: inv.client_role });
  }
  await admin.from("invitations").update({ accepted_profile_id: userId }).eq("id", inv.id);
  await audit({
    action: "user.invite_accepted", actorId: userId, actorEmail: inv.email as string, organizationId: inv.organization_id,
    entityType: "invitation", entityId: inv.id as string, meta: { role: inv.client_role ?? inv.staff_role },
  });

  const sb = await supabaseServer();
  const { error: signErr } = await sb.auth.signInWithPassword({ email: inv.email as string, password });
  if (signErr) redirect("/login");
  await completeSignIn(userId, { remember: true, method: "invite" });
  redirect("/");
}
