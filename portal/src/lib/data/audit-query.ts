import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const AUDIT_AREAS = [
  { value: "auth", label: "Sign-ins" }, { value: "user", label: "Users & invites" }, { value: "client", label: "Clients" },
  { value: "file", label: "Files & downloads" }, { value: "preview", label: "Preview views" }, { value: "revision", label: "Revisions" },
  { value: "artwork", label: "Approvals" }, { value: "order", label: "Orders" }, { value: "payment", label: "Payments" },
  { value: "price", label: "Prices" }, { value: "pricing", label: "Pricing rules" }, { value: "estimate", label: "Estimates" },
  { value: "quote", label: "Quotes" }, { value: "settings", label: "Settings" },
] as const;

export type AuditFilters = { area?: string; who?: string; from?: string; to?: string };

export function parseAuditFilters(sp: Record<string, string | undefined>): AuditFilters {
  const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  return {
    area: sp.area && AUDIT_AREAS.some((a) => a.value === sp.area) ? sp.area : undefined,
    who: sp.who ? sp.who.replace(/[^A-Za-z0-9@._+-]/g, "").slice(0, 80) || undefined : undefined,
    from: date(sp.from), to: date(sp.to),
  };
}

/** Same filters for the page and the CSV export. Dates are Manila calendar days. */
export function auditQuery(sb: SupabaseClient, f: AuditFilters, opts: { count?: boolean } = {}) {
  let q = sb.from("audit_logs").select("id, created_at, action, actor_email, entity_type, entity_id, ip, user_agent, meta, organizations(name)", opts.count ? { count: "exact" } : undefined);
  if (f.area) q = q.like("action", `${f.area}.%`);
  if (f.who) q = q.ilike("actor_email", `%${f.who}%`);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00+08:00`);
  if (f.to) q = q.lte("created_at", `${f.to}T23:59:59.999+08:00`);
  return q.order("created_at", { ascending: false });
}

export const filtersToQuery = (f: AuditFilters) => new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
