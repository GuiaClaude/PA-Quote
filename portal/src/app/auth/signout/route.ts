import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

/** GET is used by guards (deactivated accounts); the Sign out button uses POST. */
async function signOut(request: NextRequest, scope: "local" | "global") {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getClaims();
  if (data?.claims?.sub) {
    await audit({ action: scope === "global" ? "auth.logout_all" : "auth.logout", actorId: data.claims.sub as string });
  }
  await sb.auth.signOut({ scope });
  const reason = request.nextUrl.searchParams.get("reason") === "deactivated" ? "deactivated" : "signedout";
  const res = NextResponse.redirect(new URL(`/login?reason=${reason}`, request.url), { status: 303 });
  res.cookies.delete("pa_last_seen");
  return res;
}

export async function GET(request: NextRequest) {
  return signOut(request, "local");
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  return signOut(request, form?.get("scope") === "global" ? "global" : "local");
}
