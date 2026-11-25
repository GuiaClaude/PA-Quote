import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";

/** Email the Print Amplified staff assigned to a client. */
export async function emailStaff(orgId: string, mail: (company: string) => { subject: string; html: string; text: string }) {
  const admin = supabaseAdmin();
  const [{ data: org }, { data: staff }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", orgId).single(),
    admin.from("staff_assignments").select("profiles(email, is_active)").eq("organization_id", orgId),
  ]);
  for (const s of staff ?? []) {
    const p = s.profiles as unknown as { email: string; is_active: boolean } | null;
    if (p?.is_active) await sendEmail({ to: p.email, ...mail((org?.name as string) ?? "Client") });
  }
}

/** Email a client company's active users with the given roles (plus one extra person, e.g. whoever placed the order). */
export async function emailClientUsers(orgId: string, roles: string[], mail: { subject: string; html: string; text: string }, also?: string | null) {
  const { data } = await supabaseAdmin().from("memberships").select("profile_id, client_role, profiles(email, is_active)").eq("organization_id", orgId).eq("is_active", true);
  const sent = new Set<string>();
  for (const m of data ?? []) {
    const p = m.profiles as unknown as { email: string; is_active: boolean } | null;
    if (!p?.is_active || sent.has(p.email)) continue;
    if (!roles.includes(m.client_role as string) && m.profile_id !== also) continue;
    sent.add(p.email);
    await sendEmail({ to: p.email, ...mail });
  }
}
