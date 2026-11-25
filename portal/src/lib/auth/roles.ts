export const STAFF_ROLES = ["pa_admin", "pa_sales", "pa_production"] as const;
export const CLIENT_ROLES = ["client_admin", "client_buyer", "client_viewer"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type ClientRole = (typeof CLIENT_ROLES)[number];

/** Roles that must use 2-step verification (when enforced in Settings). */
export function roleRequiresMfa(staffRole: StaffRole | null, clientRole: ClientRole | null): boolean {
  return staffRole !== null || clientRole === "client_admin";
}

export const canSeePrices = (r: { staffRole: StaffRole | null; clientRole: ClientRole | null }) =>
  r.staffRole === "pa_admin" || r.staffRole === "pa_sales" || r.clientRole === "client_admin" || r.clientRole === "client_buyer";

export const canOrder = (clientRole: ClientRole | null) =>
  clientRole === "client_admin" || clientRole === "client_buyer";
