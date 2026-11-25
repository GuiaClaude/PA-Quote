"use client";
import { useActionState } from "react";
import { saveNewPassword } from "./actions";
import type { FormState } from "../login/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { t } from "@/i18n";

export default function ResetPasswordPage() {
  const [state, action] = useActionState<FormState, FormData>(saveNewPassword, undefined);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t.auth.newPasswordTitle}</h1>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">{t.auth.newPassword}</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required aria-describedby="pw-rules" />
          <p id="pw-rules" className="text-xs text-muted-foreground">{t.auth.passwordRules}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{t.auth.confirmPassword}</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        <SubmitButton className="w-full" size="lg">{t.auth.savePassword}</SubmitButton>
      </form>
    </div>
  );
}
