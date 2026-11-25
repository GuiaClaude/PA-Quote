import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dispatchPendingPushes } from "@/lib/push/send";

/**
 * Optional backup trigger for push notifications: point a Supabase Database
 * Webhook (on INSERT into notifications) here with the header
 * "x-push-secret: <PUSH_WEBHOOK_SECRET>". The app also sends pushes right
 * after each action, so this only catches notices created elsewhere.
 */
export async function POST(req: NextRequest) {
  // Checked before anything else, so an unset server still refuses cleanly.
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || secret.length < 24) return NextResponse.json({ error: "not allowed" }, { status: 401 });
  const given = req.headers.get("x-push-secret") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "not allowed" }, { status: 401 });
  }
  return NextResponse.json(await dispatchPendingPushes());
}
