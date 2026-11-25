"use client";
import { useActionState } from "react";
import { acceptInvite } from "./actions";
import type { FormState } from "../../login/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { t } from "@/i18n";

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState<FormState, FormData>(acceptInvite, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input id="email" value={email} readOnly disabled autoComplete="username" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fullName">{t.invite.fullName}</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t.auth.password}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required aria-describedby="pw-rules" />
        <p id="pw-rules" className="text-xs text-muted-foreground">{t.auth.passwordRules}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">{t.auth.confirmPassword}</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <SubmitButton className="w-full" size="lg">{t.invite.createAccount}</SubmitButton>
    </form>
  );
}
