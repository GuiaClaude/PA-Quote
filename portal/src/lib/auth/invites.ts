import "server-only";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email/send";
import { inviteEmail, inviteNeedsApprovalEmail } from "@/lib/email/templates";
import { getSessionUser } from "./session";
import { emailSchema } from "./password";
import { hashToken, newInviteToken } from "./tokens";
import { CLIENT_ROLES, STAFF_ROLES } from "./roles";

export const inviteInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("client"), organizationId: z.uuid(), email: emailSchema, clientRole: z.enum(CLIENT_ROLES) }),
  z.object({ kind: z.literal("staff"), email: emailSchema, staffRole: z.enum(STAFF_ROLES) }),
]);
export type InviteInput = z.infer<typeof inviteInput>;

type Result = { ok: true; status: "pending" | "needs_approval" } | { ok: false; error: string };

/**
 * Create an invite. The insert runs AS THE SIGNED-IN USER, so the database
 * decides who may invite whom (RLS + the invitation trigger, which marks
 * outside-domain invites from a client admin as "needs approval").
 */
export async function createInvite(input: InviteInput): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Please sign in again." };
  const sb = await supabaseServer();
  const admin = supabaseAdmin();

  // Already a user?
  const { data: existing } = await admin.from("profiles").select("id, is_active").eq("email", input.email).maybeSingle();
  if (existing) return { ok: false, error: "This email already has an account. Reactivate it from the user list instead." };

  // Replace any earlier open invite for the same address and company.
  let cancel = sb.from("invitations").update({ status: "cancelled" })
    .eq("email", input.email).in("status", ["pending", "needs_approval"]);
  cancel = input.kind === "client" ? cancel.eq("organization_id", input.organizationId) : cancel.is("organization_id", null);
  await cancel;

  const token = newInviteToken();
  const row: Record<string, string | null> = input.kind === "client"
    ? { organization_id: input.organizationId, email: input.email, client_role: input.clientRole, token_hash: hashToken(token), invited_by: me.id }
    : { organization_id: null, email: input.email, staff_role: input.staffRole, token_hash: hashToken(token), invited_by: me.id };

  const { data, error } = await sb.from("invitations").insert(row).select("id, status, expires_at, organization_id").single();
  if (error || !data) return { ok: false, error: "You can't invite users for this company." };

  await audit({
    action: "user.invited", actorId: me.id, actorEmail: me.email, organizationId: data.organization_id,
    entityType: "invitation", entityId: data.id, meta: { email: input.email, status: data.status },
  });

  if (data.status === "pending") {
    await deliverInvite(data.id, token);
  } else {
    await notifyApprovers(data.id);
  }
  return { ok: true, status: data.status as "pending" | "needs_approval" };
}

async function deliverInvite(invitationId: string, token: string) {
  const admin = supabaseAdmin();
  const { data: inv } = await admin
    .from("invitations")
    .select("email, expires_at, organization_id, organizations(name), inviter:profiles!invitations_invited_by_fkey(full_name)")
    .eq("id", invitationId).single();
  if (!inv) return;
  const org = inv.organizations as unknown as { name: string } | null;
  const inviter = inv.inviter as unknown as { full_name: string } | null;
  const mail = inviteEmail({
    company: org?.name ?? null,
    inviter: inviter?.full_name || "Print Amplified",
    url: `${env().NEXT_PUBLIC_SITE_URL}/invite/${token}`,
    expiresAt: inv.expires_at as string,
  });
  await sendEmail({ to: inv.email as string, ...mail });
}

async function notifyApprovers(invitationId: string) {
  const admin = supabaseAdmin();
  const { data: inv } = await admin
    .from("invitations")
    .select("email, organization_id, organizations(name), inviter:profiles!invitations_invited_by_fkey(full_name)")
    .eq("id", invitationId).single();
  if (!inv?.organization_id) return;
  const { data: managers } = await admin
    .from("staff_assignments").select("profiles(id, email)").eq("organization_id", inv.organization_id);
  const org = inv.organizations as unknown as { name: string };
  const inviter = inv.inviter as unknown as { full_name: string } | null;
  const url = `${env().NEXT_PUBLIC_SITE_URL}/staff/clients/${inv.organization_id}`;
  for (const m of managers ?? []) {
    const p = m.profiles as unknown as { id: string; email: string } | null;
    if (!p) continue;
    await admin.from("notifications").insert({
      profile_id: p.id, organization_id: inv.organization_id, kind: "invite_needs_approval",
      title: "Invite needs your approval", body: `${org.name}: ${inv.email}`, link: `/staff/clients/${inv.organization_id}`,
    });
    await sendEmail({ to: p.email, ...inviteNeedsApprovalEmail({ company: org.name, email: inv.email as string, inviter: inviter?.full_name ?? "A company admin", url }) });
  }
}

/** Resend = new token + a fresh 7-day expiry. Runs as the user (RLS decides). */
export async function resendInvite(invitationId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Please sign in again." };
  const sb = await supabaseServer();
  const token = newInviteToken();
  const { data: current } = await sb.from("invitations").select("send_count, status, organization_id").eq("id", invitationId).maybeSingle();
  if (!current || current.status !== "pending") return { ok: false, error: "Only pending invites can be resent." };
  const { error } = await sb.from("invitations").update({
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    send_count: (current.send_count as number) + 1,
    last_sent_at: new Date().toISOString(),
  }).eq("id", invitationId);
  if (error) return { ok: false, error: "Could not resend this invite." };
  await deliverInvite(invitationId, token);
  await audit({ action: "user.invite_resent", actorId: me.id, organizationId: current.organization_id, entityType: "invitation", entityId: invitationId });
  return { ok: true, status: "pending" };
}

export async function cancelInvite(invitationId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Please sign in again." };
  const sb = await supabaseServer();
  const { data, error } = await sb.from("invitations").update({ status: "cancelled" })
    .eq("id", invitationId).in("status", ["pending", "needs_approval"]).select("organization_id").maybeSingle();
  if (error || !data) return { ok: false, error: "Could not cancel this invite." };
  await audit({ action: "user.invite_cancelled", actorId: me.id, organizationId: data.organization_id, entityType: "invitation", entityId: invitationId });
  return { ok: true, status: "pending" };
}

/** Staff approve an outside-domain invite; this also sends it. */
export async function approveInvite(invitationId: string): Promise<Result> {
  const me = await getSessionUser();
  if (!me?.staffRole) return { ok: false, error: "Only Print Amplified staff can approve invites." };
  const sb = await supabaseServer();
  const token = newInviteToken();
  const { data, error } = await sb.from("invitations").update({
    status: "pending", token_hash: hashToken(token), expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  }).eq("id", invitationId).eq("status", "needs_approval").select("organization_id").maybeSingle();
  if (error || !data) return { ok: false, error: "Could not approve this invite." };
  await deliverInvite(invitationId, token);
  await audit({ action: "user.invite_approved", actorId: me.id, organizationId: data.organization_id, entityType: "invitation", entityId: invitationId });
  return { ok: true, status: "pending" };
}

export type InviteLookup =
  | { state: "ok"; id: string; email: string; company: string | null; role: string }
  | { state: "invalid" | "expired" };

/** Look an invite up by the token from the email link (no sign-in yet → admin client). */
export async function lookupInvite(token: string): Promise<InviteLookup> {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return { state: "invalid" };
  const admin = supabaseAdmin();
  const { data } = await admin.from("invitations")
    .select("id, email, status, expires_at, client_role, staff_role, organizations(name, is_active)")
    .eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || data.status !== "pending") return { state: data?.status === "expired" ? "expired" : "invalid" };
  const org = data.organizations as unknown as { name: string; is_active: boolean } | null;
  if (org && !org.is_active) return { state: "invalid" };
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    await admin.from("invitations").update({ status: "expired" }).eq("id", data.id);
    return { state: "expired" };
  }
  return { state: "ok", id: data.id as string, email: data.email as string, company: org?.name ?? null, role: (data.client_role ?? data.staff_role) as string };
}
