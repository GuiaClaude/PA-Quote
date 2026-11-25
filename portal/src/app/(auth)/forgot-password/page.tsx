"use client";
import { useActionState } from "react";
import Link from "next/link";
import { sendPasswordReset, type FormState } from "../login/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { Turnstile } from "@/components/auth/turnstile";
import { t } from "@/i18n";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState<FormState, FormData>(sendPasswordReset, undefined);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.auth.resetTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.auth.resetSubtitle}</p>
      </div>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.message ? <Alert tone="success">{state.message}</Alert> : null}
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t.auth.email}</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        </div>
        <Turnstile resetKey={state?.resetCaptcha} />
        <SubmitButton className="w-full" size="lg">{t.auth.resetSend}</SubmitButton>
      </form>
      <Link href="/login" className="block text-center text-sm font-medium text-primary hover:underline">{t.auth.backToSignIn}</Link>
    </div>
  );
}
