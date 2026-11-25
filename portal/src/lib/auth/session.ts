import "server-only";
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { roleRequiresMfa, type ClientRole, type StaffRole } from "./roles";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  staffRole: StaffRole | null;
  clientRole: ClientRole | null;
  organizationId: string | null;
  aal: "aal1" | "aal2";
  mfaRequired: boolean;
  /** true when 2FA is required but this session hasn't passed it yet */
  needsMfa: boolean;
};

/**
 * The signed-in user for this request (or null). The token is verified with
 * getClaims(); the profile and role come from the database through RLS.
 * Wrapped in React cache() so it runs once per request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims as { sub: string; email?: string; aal?: string };

  const [{ data: profile }, { data: membership }] = await Promise.all([
    sb.from("profiles").select("id, email, full_name, phone, staff_role, is_active").eq("id", claims.sub).maybeSingle(),
    sb.from("memberships").select("organization_id, client_role").eq("profile_id", claims.sub).eq("is_active", true).maybeSingle(),
  ]);
  if (!profile) return null;

  const staffRole = (profile.staff_role as StaffRole | null) ?? null;
  const clientRole = staffRole ? null : ((membership?.client_role as ClientRole | undefined) ?? null);
  const security = await getSetting("security");
  const mfaRequired = security.require_mfa && roleRequiresMfa(staffRole, clientRole);
  const aal = claims.aal === "aal2" ? "aal2" : "aal1";

  return {
    id: profile.id as string,
    email: (profile.email as string) ?? claims.email ?? "",
    fullName: (profile.full_name as string) || (profile.email as string),
    phone: (profile.phone as string | null) ?? null,
    isActive: Boolean(profile.is_active),
    staffRole,
    clientRole,
    organizationId: staffRole ? null : ((membership?.organization_id as string | undefined) ?? null),
    aal,
    mfaRequired,
    needsMfa: mfaRequired && aal !== "aal2",
  };
});
