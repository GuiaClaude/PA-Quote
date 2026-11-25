import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { StaffUsersPanel } from "./staff-users-panel";
import { t } from "@/i18n";

export default async function StaffUsersPage() {
  const me = await requireStaff(["pa_admin"]);
  const sb = await supabaseServer();
  const [{ data: staff }, { data: invites }] = await Promise.all([
    sb.from("profiles").select("id, full_name, email, staff_role, is_active, last_login_at").not("staff_role", "is", null).order("full_name"),
    sb.from("invitations").select("id, email, staff_role, status, expires_at, send_count").is("organization_id", null).eq("status", "pending"),
  ]);
  return (
    <>
      <PageHeader title={t.staffUsers.title} description={t.staffUsers.intro} />
      <StaffUsersPanel meId={me.id}
        staff={(staff ?? []).map((s) => ({ id: s.id as string, name: (s.full_name as string) || (s.email as string), email: s.email as string, role: s.staff_role as string, isActive: s.is_active as boolean, lastLoginAt: s.last_login_at as string | null }))}
        invites={(invites ?? []).map((i) => ({ id: i.id as string, email: i.email as string, role: i.staff_role as string, expiresAt: i.expires_at as string }))} />
    </>
  );
}
