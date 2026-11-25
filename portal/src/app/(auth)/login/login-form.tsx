"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { KeyRound, Mail } from "lucide-react";
import { signInWithPassword, sendMagicLink, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { Turnstile } from "@/components/auth/turnstile";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [pwState, pwAction] = useActionState<FormState, FormData>(signInWithPassword, undefined);
  const [linkState, linkAction] = useActionState<FormState, FormData>(sendMagicLink, undefined);
  const state = mode === "password" ? pwState : linkState;

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Sign-in method" className="grid grid-cols-2 rounded-lg bg-surface-muted p-1 text-sm font-medium">
        {(["password", "link"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn("flex items-center justify-center gap-2 rounded-md py-2", mode === m ? "bg-surface shadow-sm" : "text-muted-foreground")}
          >
            {m === "password" ? <KeyRound className="size-4" aria-hidden /> : <Mail className="size-4" aria-hidden />}
            {m === "password" ? t.auth.withPassword : "Email link"}
          </button>
        ))}
      </div>

      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.message ? <Alert tone="success">{state.message}</Alert> : null}

      <form action={mode === "password" ? pwAction : linkAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next ?? "/"} />
        <div className="space-y-2">
          <Label htmlFor="email">{t.auth.email}</Label>
          <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus />
        </div>
        {mode === "password" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t.auth.password}</Label>
              <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">{t.auth.forgot}</Link>
            </div>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="remember" defaultChecked className="size-4 accent-[var(--primary)]" />
          {t.auth.rememberMe}
        </label>
        <Turnstile resetKey={state?.resetCaptcha} />
        <SubmitButton className="w-full" size="lg" pendingText={t.auth.signingIn}>
          {mode === "password" ? t.auth.signIn : t.auth.sendLink}
        </SubmitButton>
      </form>
    </div>
  );
}
