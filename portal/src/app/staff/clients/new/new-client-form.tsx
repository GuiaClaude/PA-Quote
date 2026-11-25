"use client";
import { useActionState } from "react";
import { createClientCompany } from "@/lib/actions/clients";
import type { ActionState } from "@/lib/actions/account";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { t } from "@/i18n";

export function NewClientForm({ managers, canPickManager }: { managers: { id: string; name: string }[]; canPickManager: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(createClientCompany, undefined);
  return (
    <form action={action} className="space-y-5">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="space-y-2"><Label htmlFor="name">{t.clients.name} *</Label><Input id="name" name="name" required autoFocus /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="billingName">{t.clients.billingName}</Label><Input id="billingName" name="billingName" /></div>
        <div className="space-y-2"><Label htmlFor="tin">{t.clients.tin}</Label><Input id="tin" name="tin" placeholder="000-000-000-000" /></div>
      </div>
      <div className="space-y-2"><Label htmlFor="creditTerms">{t.clients.creditTerms}</Label><Input id="creditTerms" name="creditTerms" placeholder="e.g. 30 days upon delivery" /></div>
      <div className="space-y-2">
        <Label htmlFor="domains">{t.clients.domains}</Label>
        <Input id="domains" name="domains" placeholder="abccorp.com.ph, abc.ph" aria-describedby="domains-help" />
        <p id="domains-help" className="text-xs text-muted-foreground">{t.clients.domainsHelp}</p>
      </div>
      {canPickManager ? (
        <div className="space-y-2">
          <Label htmlFor="am">{t.clients.accountManager}</Label>
          <Select id="am" name="accountManagerId">{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
        </div>
      ) : <p className="text-sm text-muted-foreground">You will be the account manager for this client.</p>}
      <SubmitButton size="lg">{t.clients.add}</SubmitButton>
    </form>
  );
}
