"use server";
import { z } from "zod";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { sendTestPush, pushConfigured } from "@/lib/push/send";
import { audit } from "@/lib/audit";
import type { ActionState } from "./account";

const subInput = z.object({
  endpoint: z.url().max(1000).refine((u) => u.startsWith("https://"), "https only"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Save this device's push subscription for the signed-in person (their own row only — database rules). */
export async function subscribePush(raw: unknown): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me || me.needsMfa) return { error: "Please sign in again." };
  if (!pushConfigured()) return { error: "Push notifications aren't set up on the server yet." };
  const p = subInput.safeParse(raw);
  if (!p.success) return { error: "This browser gave an invalid subscription." };
  const sb = await supabaseServer();
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  // Same phone signing in as someone else: the endpoint moves to the new person.
  await sb.rpc("claim_push_endpoint", { p_endpoint: p.data.endpoint });
  const { error } = await sb.from("push_subscriptions").upsert({ profile_id: me.id, endpoint: p.data.endpoint, keys: p.data.keys, user_agent: ua }, { onConflict: "endpoint" });
  if (error) return { error: "Could not turn on notifications." };
  await audit({ action: "push.subscribed", actorId: me.id, actorEmail: me.email, meta: { user_agent: ua } });
  await sendTestPush(me.id);
  return { message: "Notifications are on for this device." };
}

export async function unsubscribePush(endpoint: string): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me) return { error: "Please sign in again." };
  const sb = await supabaseServer();
  await sb.from("push_subscriptions").delete().eq("endpoint", endpoint.slice(0, 1000)).eq("profile_id", me.id);
  await audit({ action: "push.unsubscribed", actorId: me.id, actorEmail: me.email });
  return { message: "Notifications are off for this device." };
}
