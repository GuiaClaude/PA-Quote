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
