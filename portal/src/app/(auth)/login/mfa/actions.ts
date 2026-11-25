"use server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

/** Called after the browser has verified a code, to record it in the logs. */
export async function recordMfa(kind: "enrolled" | "verified" | "failed") {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getClaims();
  const id = data?.claims?.sub as string | undefined;
  if (!id) return;
  if (kind === "enrolled" || kind === "failed") {
    await supabaseAdmin().from("auth_events").insert({ profile_id: id, kind: kind === "enrolled" ? "mfa_enrolled" : "mfa_fail" });
  }
  await audit({ action: `auth.mfa_${kind}`, actorId: id });
}
