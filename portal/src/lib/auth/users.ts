import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { getSessionUser } from "./session";
import type { ClientRole } from "./roles";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Who may manage this user? Checked with the actor's OWN database access
 * (RLS): staff who manage the company, or the company's client_admin.
 * Staff accounts can only be managed by pa_admin.
 */
async function authorise(targetId: string) {
  const me = await getSessionUser();
  if (!me || me.needsMfa) return { error: "Please sign in again." } as const;
  if (targetId === me.id) return { error: "You can't change your own access. Ask another admin." } as const;
  const sb = await supabaseServer();
  const { data: target } = await sb.from("profiles").select("id, email, full_name, staff_role, is_active").eq("id", targetId).maybeSingle();
  if (!target) return { error: "User not found." } as const;
  if (target.staff_role) {
    if (me.staffRole !== "pa_admin") return { error: "Only management can change staff accounts." } as const;
    return { me, target, membership: null } as const;
  }
  const { data: membership } = await sb.from("memberships").select("id, organization_id, client_role").eq("profile_id", targetId).maybeSingle();
  if (!membership) return { error: "User not found." } as const;
  const isStaffManager = me.staffRole === "pa_admin" || me.staffRole === "pa_sales";
  const isCompanyAdmin = me.clientRole === "client_admin" && me.organizationId === membership.organization_id;
  if (!isStaffManager && !isCompanyAdmin) return { error: "You can't manage this user." } as const;
  // pa_sales: RLS only returned the membership if the company is assigned to them.
  return { me, target, membership } as const;
}

async function activeAdminCount(organizationId: string): Promise<number> {
  const { count } = await supabaseAdmin().from("memberships")
    .select("id, profiles!inner(is_active)", { count: "exact", head: true })
    .eq("organization_id", organizationId).eq("client_role", "client_admin").eq("is_active", true)
    .eq("profiles.is_active", true);
  return count ?? 0;
}

/** Deactivate: signs the person out everywhere at once and blocks sign-in. Their records stay with the company. */
export async function deactivateUser(targetId: string): Promise<Result> {
  const a = await authorise(targetId);
  if ("error" in a) return { ok: false, error: a.error ?? "Not allowed." };
  const { me, target, membership } = a;
  if (membership?.client_role === "client_admin" && !me.staffRole && (await activeAdminCount(membership.organization_id)) <= 1) {
    return { ok: false, error: "Your company needs at least one Company admin. Make someone else an admin first." };
  }
  const admin = supabaseAdmin();
  await admin.from("profiles").update({ is_active: false, deactivated_at: new Date().toISOString(), deactivated_by: me.id }).eq("id", targetId);
  // Ban = no new sign-ins and existing refresh tokens stop working. RLS already
  // hides all data the moment is_active is false.
  await admin.auth.admin.updateUserById(targetId, { ban_duration: "876000h" });
  await audit({
    action: "user.deactivated", actorId: me.id, actorEmail: me.email, organizationId: membership?.organization_id ?? null,
    entityType: "profile", entityId: targetId, meta: { email: target.email },
  });
  return { ok: true };
}

export async function reactivateUser(targetId: string): Promise<Result> {
  const a = await authorise(targetId);
  if ("error" in a) return { ok: false, error: a.error ?? "Not allowed." };
  const admin = supabaseAdmin();
  await admin.from("profiles").update({ is_active: true, deactivated_at: null, deactivated_by: null }).eq("id", targetId);
  await admin.auth.admin.updateUserById(targetId, { ban_duration: "none" });
  await audit({
    action: "user.reactivated", actorId: a.me.id, actorEmail: a.me.email, organizationId: a.membership?.organization_id ?? null,
    entityType: "profile", entityId: targetId, meta: { email: a.target.email },
  });
  return { ok: true };
}

export async function changeClientRole(targetId: string, role: ClientRole): Promise<Result> {
  const a = await authorise(targetId);
  if ("error" in a) return { ok: false, error: a.error ?? "Not allowed." };
  if (!a.membership) return { ok: false, error: "Not a client user." };
  if (a.membership.client_role === "client_admin" && role !== "client_admin" && (await activeAdminCount(a.membership.organization_id)) <= 1) {
    return { ok: false, error: "Your company needs at least one Company admin. Make someone else an admin first." };
  }
  const sb = await supabaseServer();
  const { error } = await sb.from("memberships").update({ client_role: role }).eq("id", a.membership.id);
  if (error) return { ok: false, error: "Could not change the role." };
  await audit({
    action: "user.role_changed", actorId: a.me.id, organizationId: a.membership.organization_id,
    entityType: "profile", entityId: targetId, meta: { from: a.membership.client_role, to: role },
  });
  return { ok: true };
}
