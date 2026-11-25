"use client";
import { useActionState, useState, useTransition } from "react";
import { X } from "lucide-react";
import { updateClientCompany, addDomain, removeDomain, setAccountManager } from "@/lib/actions/clients";
import type { ActionState } from "@/lib/actions/account";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { t } from "@/i18n";

type Org = { id: string; name: string; billingName: string; tin: string; creditTerms: string; notes: string; allowInstantQuotes: boolean; allowHighres: boolean };

export function ClientDetailsForm({ org, isAdmin }: { org: Org; isAdmin: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(updateClientCompany, undefined);
  return (
    <Card>
      <CardHeader><CardTitle>Company details</CardTitle></CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="organizationId" value={org.id} />
          {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state?.message ? <Alert tone="success">{state.message}</Alert> : null}
          <div className="space-y-2"><Label htmlFor="c-name">{t.clients.name}</Label><Input id="c-name" name="name" defaultValue={org.name} required /></div>
          <div className="space-y-2"><Label htmlFor="c-bill">{t.clients.billingName}</Label><Input id="c-bill" name="billingName" defaultValue={org.billingName} /></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="space-y-2"><Label htmlFor="c-tin">{t.clients.tin}</Label><Input id="c-tin" name="tin" defaultValue={org.tin} /></div>
            <div className="space-y-2"><Label htmlFor="c-terms">{t.clients.creditTerms}</Label><Input id="c-terms" name="creditTerms" defaultValue={org.creditTerms} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="c-notes">Internal notes</Label><Textarea id="c-notes" name="notes" defaultValue={org.notes} /></div>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="allowInstantQuotes" defaultChecked={org.allowInstantQuotes} className="mt-0.5 size-4 accent-[var(--primary)]" /><span><b>{t.clients.instantQuotes}</b><br /><span className="text-muted-foreground">Reorders can be priced instantly from past estimates.</span></span></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="allowHighres" defaultChecked={org.allowHighres} disabled={!isAdmin} className="mt-0.5 size-4 accent-[var(--primary)]" /><span><b>{t.clients.highRes}</b><br /><span className="text-muted-foreground">{t.clients.highResHelp}</span></span></label>
          <SubmitButton pendingText={t.common.saving}>{t.common.save}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function DomainsCard({ organizationId, domains }: { organizationId: string; domains: string[] }) {
  const [state, action] = useActionState<ActionState, FormData>(addDomain, undefined);
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader><CardTitle>{t.clients.domains}</CardTitle><CardDescription>{t.clients.domainsHelp}</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {msg?.message ? <Alert tone="success">{msg.message}</Alert> : null}
        <ul className="flex flex-wrap gap-2">
          {domains.length === 0 ? <li className="text-sm text-muted-foreground">No domains yet — company admins will need approval for every invite.</li> : null}
          {domains.map((d) => (
            <li key={d} className="inline-flex items-center gap-1 rounded-full bg-surface-muted py-1 pl-3 pr-1 text-sm">
              @{d}
              <button type="button" aria-label={`Remove ${d}`} disabled={pending} onClick={() => start(async () => setMsg(await removeDomain(organizationId, d)))}
                className="rounded-full p-1 hover:bg-danger-soft hover:text-danger"><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
        <form action={action} className="flex gap-2">
          <input type="hidden" name="organizationId" value={organizationId} />
          <Input name="domain" placeholder="abccorp.com.ph" aria-label="New domain" />
          <SubmitButton variant="outline">{t.clients.addDomain}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function AccountManagerCard({ organizationId, current, staff, canEdit }: { organizationId: string; current: string | null; staff: { id: string; name: string }[]; canEdit: boolean }) {
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader><CardTitle>{t.clients.accountManager}</CardTitle><CardDescription>Shown on the client&apos;s home screen with phone, email and Viber.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {msg?.error ? <Alert tone="danger">{msg.error}</Alert> : null}
        {msg?.message ? <Alert tone="success">{msg.message}</Alert> : null}
        <Select aria-label={t.clients.accountManager} defaultValue={current ?? ""} disabled={!canEdit || pending}
          onChange={(e) => start(async () => setMsg(await setAccountManager(organizationId, e.target.value)))}>
          {!current ? <option value="">Not assigned</option> : null}
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {!canEdit ? <p className="text-xs text-muted-foreground">Only management can change this.</p> : null}
      </CardContent>
    </Card>
  );
}
