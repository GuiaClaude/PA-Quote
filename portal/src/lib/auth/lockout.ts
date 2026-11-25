import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/settings";
import { requestMeta } from "@/lib/request-meta";
import { audit } from "@/lib/audit";

/**
 * Temporary lockout after repeated failed sign-ins for one email address.
 * Returns the minutes left if locked, otherwise 0. Failures before the last
 * successful sign-in don't count.
 */
export async function lockoutMinutesLeft(email: string): Promise<number> {
  const { lockout_max_attempts: max, lockout_minutes: minutes } = await getSetting("security");
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data } = await supabaseAdmin()
    .from("auth_events")
    .select("kind, created_at")
    .eq("email", email)
    .in("kind", ["login_fail", "login_ok"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(max + 1);
  const recent: { kind: string; created_at: string }[] = data ?? [];
  const lastOk = recent.findIndex((r) => r.kind === "login_ok");
  const failures = (lastOk === -1 ? recent : recent.slice(0, lastOk)).filter((r) => r.kind === "login_fail");
  if (failures.length < max) return 0;
  const oldestCounted = new Date(failures[max - 1]!.created_at).getTime();
  return Math.max(1, Math.ceil((oldestCounted + minutes * 60_000 - Date.now()) / 60_000));
}

export async function recordLoginFailure(email: string): Promise<void> {
  const admin = supabaseAdmin();
  const { ip, userAgent } = await requestMeta();
  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  await admin.from("auth_events").insert({
    profile_id: profile?.id ?? null, email, kind: "login_fail", ip, user_agent: userAgent,
  });
  await audit({ action: "auth.login_failed", actorId: profile?.id ?? null, actorEmail: email });
  if ((await lockoutMinutesLeft(email)) > 0) {
    await admin.from("auth_events").insert({ profile_id: profile?.id ?? null, email, kind: "lockout", ip, user_agent: userAgent });
    await audit({ action: "auth.locked_out", actorId: profile?.id ?? null, actorEmail: email });
  }
}
