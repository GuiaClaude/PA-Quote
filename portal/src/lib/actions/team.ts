"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createInvite, resendInvite, cancelInvite, approveInvite } from "@/lib/auth/invites";
import { deactivateUser, reactivateUser, changeClientRole } from "@/lib/auth/users";
import { CLIENT_ROLES, STAFF_ROLES } from "@/lib/auth/roles";
import { t } from "@/i18n";
import type { ActionState } from "./account";

/** One server action file for user management, used by client admins and staff. */

export async function inviteClientUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ organizationId: z.uuid(), email: z.string(), clientRole: z.enum(CLIENT_ROLES) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the email and role." };
  const r = await createInvite({ kind: "client", ...parsed.data });
  if (!r.ok) return { error: r.error };
  revalidatePath("/", "layout");
  return { message: r.status === "needs_approval" ? t.team.inviteNeedsApproval : t.team.inviteSent };
}

export async function inviteStaffUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ email: z.string(), staffRole: z.enum(STAFF_ROLES) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the email and role." };
  const r = await createInvite({ kind: "staff", ...parsed.data });
  if (!r.ok) return { error: r.error };
  revalidatePath("/staff/staff-users");
  return { message: t.team.inviteSent };
}

const id = z.uuid();

export async function inviteAction(kind: "resend" | "cancel" | "approve", invitationId: string): Promise<ActionState> {
  if (!id.safeParse(invitationId).success) return { error: "Invalid invite." };
  const fn = { resend: resendInvite, cancel: cancelInvite, approve: approveInvite }[kind];
  const r = await fn(invitationId);
  revalidatePath("/", "layout");
  return r.ok ? { message: kind === "cancel" ? "Invite cancelled." : "Invite sent." } : { error: r.error };
}

export async function userAccessAction(kind: "deactivate" | "reactivate", profileId: string): Promise<ActionState> {
  if (!id.safeParse(profileId).success) return { error: "Invalid user." };
  const r = kind === "deactivate" ? await deactivateUser(profileId) : await reactivateUser(profileId);
  revalidatePath("/", "layout");
  return r.ok ? { message: kind === "deactivate" ? "User deactivated and signed out everywhere." : "User reactivated." } : { error: r.error };
}

export async function changeRoleAction(profileId: string, role: string): Promise<ActionState> {
  const parsedRole = z.enum(CLIENT_ROLES).safeParse(role);
  if (!id.safeParse(profileId).success || !parsedRole.success) return { error: "Invalid role." };
  const r = await changeClientRole(profileId, parsedRole.data);
  revalidatePath("/", "layout");
  return r.ok ? { message: "Role updated." } : { error: r.error };
}
