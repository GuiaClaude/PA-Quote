import "server-only";
import { sendNotification, setVapidDetails } from "web-push";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

/** Push is optional: it works once the VAPID keys are set (see .env.example). */
export function pushConfigured(): boolean {
  const e = env();
  return Boolean(e.NEXT_PUBLIC_VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY);
}

let ready = false;
function setup() {
  if (ready) return;
  const e = env();
  setVapidDetails(e.VAPID_SUBJECT, e.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  ready = true;
}

type Sub = { id: string; profile_id: string; endpoint: string; keys: { p256dh: string; auth: string } };

/**
 * Send every notification created in the last 15 minutes that hasn't been
 * pushed yet to its person's subscribed devices. Safe to call often and
 * from several places: rows are claimed (pushed_at set) before sending.
 */
export async function dispatchPendingPushes(limit = 200): Promise<{ sent: number; failed: number }> {
  if (!pushConfigured()) return { sent: 0, failed: 0 };
  setup();
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: pending } = await admin.from("notifications").select("id").is("pushed_at", null).gte("created_at", since).order("created_at").limit(limit);
  if (!pending?.length) return { sent: 0, failed: 0 };
  const { data: claimed } = await admin.from("notifications").update({ pushed_at: new Date().toISOString() })
    .in("id", pending.map((p) => p.id)).is("pushed_at", null).select("id, profile_id, title, body, link, kind");
  if (!claimed?.length) return { sent: 0, failed: 0 };
  const profiles = [...new Set(claimed.map((n) => n.profile_id as string))];
  const [{ data: subs }, { data: active }] = await Promise.all([
    admin.from("push_subscriptions").select("id, profile_id, endpoint, keys").in("profile_id", profiles),
    admin.from("profiles").select("id").in("id", profiles).eq("is_active", true),
  ]);
  const activeIds = new Set((active ?? []).map((p) => p.id as string));
  let sent = 0, failed = 0;
  const gone: string[] = [];
  const used: string[] = [];
  await Promise.all(claimed.flatMap((n) => ((subs ?? []) as Sub[]).filter((s) => s.profile_id === n.profile_id && activeIds.has(s.profile_id)).map(async (s) => {
    const link = typeof n.link === "string" && n.link.startsWith("/") ? n.link : "/";
    try {
      await sendNotification({ endpoint: s.endpoint, keys: s.keys },
        JSON.stringify({ title: n.title, body: n.body ?? "", url: link, tag: `${n.kind}:${link}` }), { TTL: 60 * 60 * 24, urgency: "normal" });
      sent++; used.push(s.id);
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.id);   // the phone unsubscribed or the app was removed
    }
  })));
  if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
  if (used.length) await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", [...new Set(used)]);
  return { sent, failed };
}

/** Call after any action that creates notifications: sends their pushes once the response is out. */
export function kickPush() {
  if (!pushConfigured()) return;
  after(async () => { try { await dispatchPendingPushes(); } catch { /* push is best-effort */ } });
}

export async function sendTestPush(profileId: string): Promise<boolean> {
  const { error } = await supabaseAdmin().from("notifications").insert({ profile_id: profileId, kind: "test", title: "Notifications are on", body: "You'll get updates about your orders here.", link: "/" });
  if (error) return false;
  await dispatchPendingPushes();
  return true;
}
