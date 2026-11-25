import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type { PendingInvite, TeamMember } from "@/components/account/team-panel";

/** Users, open invites and approved domains of one company — read through RLS. */
export async function loadTeam(organizationId: string, myId: string) {
  const sb = await supabaseServer();
  const [{ data: members }, { data: invites }, { data: domains }] = await Promise.all([
    sb.from("memberships").select("client_role, is_active, profiles(id, full_name, email, is_active, last_login_at)")
      .eq("organization_id", organizationId),
    sb.from("invitations").select("id, email, client_role, status, expires_at, send_count")
      .eq("organization_id", organizationId).in("status", ["pending", "needs_approval"]).order("created_at", { ascending: false }),
    sb.from("organization_domains").select("domain").eq("organization_id", organizationId).order("domain"),
  ]);
  const team: TeamMember[] = (members ?? []).map((m) => {
    const p = m.profiles as unknown as { id: string; full_name: string; email: string; is_active: boolean; last_login_at: string | null };
    return {
      profileId: p.id, fullName: p.full_name || p.email, email: p.email, role: m.client_role as string,
      isActive: p.is_active && (m.is_active as boolean), lastLoginAt: p.last_login_at, isMe: p.id === myId,
    };
  }).sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.fullName.localeCompare(b.fullName));
  const pending: PendingInvite[] = (invites ?? []).map((i) => ({
    id: i.id as string, email: i.email as string, role: i.client_role as string, status: i.status as string,
    expiresAt: i.expires_at as string, sendCount: i.send_count as number,
  }));
  return { team, pending, domains: (domains ?? []).map((d) => d.domain as string) };
}
