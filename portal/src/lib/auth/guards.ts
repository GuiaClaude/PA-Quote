import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./session";
import type { ClientRole, StaffRole } from "./roles";

/**
 * Page guards. These are for a good experience (sending people to the right
 * screen). Real protection is Row Level Security in the database: even if a
 * guard were skipped, the database would return no data.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.isActive) redirect("/auth/signout?reason=deactivated");
  if (user.needsMfa) redirect("/login/mfa");
  return user;
}

export async function requireStaff(roles?: StaffRole[]): Promise<SessionUser & { staffRole: StaffRole }> {
  const user = await requireUser();
  if (!user.staffRole) redirect("/app");
  if (roles && !roles.includes(user.staffRole)) redirect("/staff?denied=1");
  return user as SessionUser & { staffRole: StaffRole };
}

export async function requireClient(
  roles?: ClientRole[],
): Promise<SessionUser & { clientRole: ClientRole; organizationId: string }> {
  const user = await requireUser();
  if (user.staffRole) redirect("/staff");
  if (!user.clientRole || !user.organizationId) redirect("/auth/signout?reason=deactivated");
  if (roles && !roles.includes(user.clientRole)) redirect("/app?denied=1");
  return user as SessionUser & { clientRole: ClientRole; organizationId: string };
}

export function homeFor(user: Pick<SessionUser, "staffRole">): string {
  return user.staffRole ? "/staff" : "/app";
}
