"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { emailSchema } from "@/lib/auth/password";
import { lockoutMinutesLeft, recordLoginFailure } from "@/lib/auth/lockout";
import { completeSignIn, REMEMBER_COOKIE } from "@/lib/auth/after-sign-in";
import { env } from "@/lib/env";
import { t } from "@/i18n";

export type FormState = { error?: string; message?: string; resetCaptcha?: number } | undefined;

/** Only allow redirects to our own pages. */
function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

const passwordForm = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  remember: z.string().optional(),
  captchaToken: z.string().optional(),
  next: z.string().optional(),
});

export async function signInWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t.auth.invalid };
  const { email, password, remember, captchaToken, next } = parsed.data;

  const minutes = await lockoutMinutesLeft(email);
  if (minutes > 0) return { error: t.auth.locked(minutes), resetCaptcha: Date.now() };

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword({
    email, password, options: captchaToken ? { captchaToken } : undefined,
  });
  if (error || !data.user) {
    if (error?.message?.toLowerCase().includes("captcha")) return { error: t.auth.captchaRequired, resetCaptcha: Date.now() };
    await recordLoginFailure(email);
    const after = await lockoutMinutesLeft(email);
    return { error: after > 0 ? t.auth.locked(after) : t.auth.invalid, resetCaptcha: Date.now() };
  }

  const ok = await completeSignIn(data.user.id, { remember: remember === "on", method: "password" });
  if (!ok) return { error: t.auth.deactivated };
  redirect(safeNext(next));
}

const linkForm = z.object({
  email: emailSchema,
  remember: z.string().optional(),
  captchaToken: z.string().optional(),
  next: z.string().optional(),
});

export async function sendMagicLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = linkForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const { email, remember, captchaToken, next } = parsed.data;
  if ((await lockoutMinutesLeft(email)) > 0) return { message: t.auth.linkSent };

  const jar = await cookies();
  jar.set(REMEMBER_COOKIE, remember === "on" ? "1" : "0", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false, // invite-only: never create accounts from the login page
      emailRedirectTo: `${env().NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(safeNext(next))}`,
      captchaToken,
    },
  });
  if (error?.message?.toLowerCase().includes("captcha")) return { error: t.auth.captchaRequired, resetCaptcha: Date.now() };
  // Same answer whether or not the email exists, so nobody can probe for clients.
  return { message: t.auth.linkSent, resetCaptcha: Date.now() };
}

export async function sendPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = linkForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env().NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
    captchaToken: parsed.data.captchaToken,
  });
  if (error?.message?.toLowerCase().includes("captcha")) return { error: t.auth.captchaRequired, resetCaptcha: Date.now() };
  return { message: t.auth.resetSent, resetCaptcha: Date.now() };
}
