import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { requestMeta } from "@/lib/request-meta";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email/send";
import { newDeviceEmail } from "@/lib/email/templates";
import { hashDeviceId } from "./tokens";

export const DEVICE_COOKIE = "pa_did";
export const LAST_SEEN_COOKIE = "pa_last_seen";
export const REMEMBER_COOKIE = "pa_remember";
export const INSTALLED_COOKIE = "pa_app";

const longCookie = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 400 };

/**
 * Runs after every successful sign-in (password, magic link, invite):
 *   - blocks deactivated accounts,
 *   - records the login and "last login",
 *   - recognises the device and emails the user about new devices,
 *   - starts the inactivity timer.
 * Returns false if the user must not be signed in.
 */
export async function completeSignIn(userId: string, opts: { remember: boolean; method: string }): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("profiles").select("id, email, full_name, is_active").eq("id", userId).maybeSingle();
  if (!profile || !profile.is_active) {
    const sb = await supabaseServer();
    await sb.auth.signOut({ scope: "local" });
    await audit({ action: "auth.blocked_inactive", actorId: userId, actorEmail: profile?.email ?? null });
    return false;
  }

  const jar = await cookies();
  const { ip, userAgent } = await requestMeta();
  let deviceId = jar.get(DEVICE_COOKIE)?.value;
  if (!deviceId || !/^[0-9a-f-]{36}$/.test(deviceId)) {
    deviceId = randomUUID();
    jar.set(DEVICE_COOKIE, deviceId, longCookie);
  }
  const deviceHash = hashDeviceId(deviceId, env().DEVICE_HASH_SECRET);
  const installed = jar.get(INSTALLED_COOKIE)?.value === "1";

  const [{ data: known }, { count: deviceCount }] = await Promise.all([
    admin.from("known_devices").select("id").eq("profile_id", userId).eq("device_id_hash", deviceHash).maybeSingle(),
    admin.from("known_devices").select("id", { count: "exact", head: true }).eq("profile_id", userId),
  ]);
  const now = new Date().toISOString();
  if (known) {
    await admin.from("known_devices").update({ last_seen_at: now, is_installed_app: installed }).eq("id", known.id);
  } else {
    await admin.from("known_devices").insert({
      profile_id: userId, device_id_hash: deviceHash, label: userAgent?.slice(0, 200) ?? null, is_installed_app: installed,
    });
    // Tell the user — except on the very first device they ever use.
    if ((deviceCount ?? 0) > 0) {
      await admin.from("auth_events").insert({ profile_id: userId, email: profile.email, kind: "new_device", ip, user_agent: userAgent, device_id_hash: deviceHash });
      const mail = newDeviceEmail({
        name: profile.full_name || profile.email, when: now, userAgent, ip,
        url: `${env().NEXT_PUBLIC_SITE_URL}/forgot-password`,
      });
      await sendEmail({ to: profile.email, ...mail });
    }
  }

  await Promise.all([
    admin.from("profiles").update({ last_login_at: now }).eq("id", userId),
    admin.from("auth_events").insert({ profile_id: userId, email: profile.email, kind: "login_ok", ip, user_agent: userAgent, device_id_hash: deviceHash }),
    audit({ action: "auth.login", actorId: userId, actorEmail: profile.email, meta: { method: opts.method, new_device: !known } }),
  ]);

  jar.set(LAST_SEEN_COOKIE, String(Date.now()), longCookie);
  jar.set(REMEMBER_COOKIE, opts.remember ? "1" : "0", longCookie);
  return true;
}
