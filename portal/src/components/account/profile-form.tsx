"use client";
import { useActionState } from "react";
import { updateMyProfile, type ActionState } from "@/lib/actions/account";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { t } from "@/i18n";

export function ProfileForm({ fullName, phone, email }: { fullName: string; phone: string | null; email: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateMyProfile, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.message ? <Alert tone="success">{state.message}</Alert> : null}
      <div className="space-y-2"><Label htmlFor="em">{t.auth.email}</Label><Input id="em" value={email} disabled readOnly /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="fullName">{t.account.fullName}</Label><Input id="fullName" name="fullName" defaultValue={fullName} required autoComplete="name" /></div>
        <div className="space-y-2"><Label htmlFor="phone">{t.account.phone}</Label><Input id="phone" name="phone" defaultValue={phone ?? ""} inputMode="tel" autoComplete="tel" /></div>
      </div>
      <SubmitButton pendingText={t.common.saving}>{t.account.save}</SubmitButton>
    </form>
  );
}
