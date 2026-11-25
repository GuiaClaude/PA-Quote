import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page request:
 *   1. keeps the Supabase login session fresh (cookie refresh),
 *   2. signs people out after inactivity (12 h on the web, 30 days in the
 *      installed app with "keep me signed in" — both editable in Settings),
 *   3. sends signed-out visitors from private pages to /login.
 */

const PROTECTED = ["/app", "/staff"];
const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 400 };

type Limits = { webHours: number; appDays: number };
let limitsCache: { value: Limits; at: number } | null = null;

async function sessionLimits(): Promise<Limits> {
  const fallback = { webHours: 12, appDays: 30 };
  if (limitsCache && Date.now() - limitsCache.at < 60_000) return limitsCache.value;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return fallback;
  try {
    const res = await fetch(`${url}/rest/v1/settings?key=eq.security&select=value`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const rows = (await res.json()) as { value?: { web_session_hours?: number; app_session_days?: number } }[];
    const v = rows?.[0]?.value ?? {};
    const value = { webHours: v.web_session_hours ?? fallback.webHours, appDays: v.app_session_days ?? fallback.appDays };
    limitsCache = { value, at: Date.now() };
    return value;
  } catch {
    return fallback;
  }
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response; // not configured yet (first run): pages show a setup message

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`));

  const redirectTo = (target: string) => {
    const r = NextResponse.redirect(new URL(target, request.url));
    for (const c of response.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  if (!data?.claims) {
    if (isProtected) return redirectTo(`/login?next=${encodeURIComponent(path + request.nextUrl.search)}`);
    return response;
  }

  // Inactivity timeout
  const lastSeen = Number(request.cookies.get("pa_last_seen")?.value ?? 0);
  const installedAndRemembered =
    request.cookies.get("pa_app")?.value === "1" && request.cookies.get("pa_remember")?.value === "1";
  const { webHours, appDays } = await sessionLimits();
  const limitMs = installedAndRemembered ? appDays * 86_400_000 : webHours * 3_600_000;
  if (lastSeen > 0 && Date.now() - lastSeen > limitMs) {
    await supabase.auth.signOut({ scope: "local" });
    const r = redirectTo("/login?reason=timeout");
    r.cookies.delete("pa_last_seen");
    return r;
  }
  response.cookies.set("pa_last_seen", String(Date.now()), cookieOpts);
  return response;
}

export const config = {
  matcher: [
    // everything except static files, images, the service worker and the manifest
    "/((?!_next/static|_next/image|favicon.ico|icons/|splash/|sw.js|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)",
  ],
};
