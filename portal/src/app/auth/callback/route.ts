import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { completeSignIn, REMEMBER_COOKIE } from "@/lib/auth/after-sign-in";

/**
 * Where sign-in links and password-reset links land. Supports both the
 * default Supabase link (?code=…) and the recommended custom email template
 * (?token_hash=…&type=…) which also works when the link is opened on a
 * different device than the one that asked for it.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const rawNext = url.searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const sb = await supabaseServer();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const result = code
    ? await sb.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await sb.auth.verifyOtp({ token_hash: tokenHash, type })
      : null;

  const user = result?.data?.user;
  if (!result || result.error || !user) {
    return NextResponse.redirect(new URL("/login?reason=link", request.url));
  }

  const remember = (await cookies()).get(REMEMBER_COOKIE)?.value === "1";
  const ok = await completeSignIn(user.id, { remember, method: type === "recovery" ? "password_reset" : "magic_link" });
  if (!ok) return NextResponse.redirect(new URL("/login?reason=deactivated", request.url));

  const target = type === "recovery" ? "/reset-password" : next;
  return NextResponse.redirect(new URL(target, request.url));
}
