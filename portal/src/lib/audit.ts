import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requestMeta } from "@/lib/request-meta";

export type AuditEntry = {
  action: string;                 // e.g. "auth.login", "user.deactivated", "settings.updated"
  actorId?: string | null;
  actorEmail?: string | null;
  organizationId?: string | null;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
};

/**
 * Append a row to the audit log. The audit log is append-only in the
 * database; nobody (not even management) can edit or delete it.
 * Never throws — a logging hiccup must not break the user's action.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const { ip, userAgent } = await requestMeta();
    const { error } = await supabaseAdmin().from("audit_logs").insert({
      action: entry.action,
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      organization_id: entry.organizationId ?? null,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      ip,
      user_agent: userAgent,
      meta: entry.meta ?? {},
    });
    if (error) console.error("[audit] insert failed", error.message);
  } catch (e) {
    console.error("[audit] failed", e);
  }
}
