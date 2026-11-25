"use client";
import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveSettings } from "@/lib/actions/settings";
import type { ActionState } from "@/lib/actions/account";
import type { SettingValue } from "@/lib/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { contrastRatio, readableOnWhiteText } from "@/theme/color";
import { LogoUploader } from "./logo-uploader";
import { t } from "@/i18n";

type Initial = {
  company: SettingValue<"company">; branding: SettingValue<"branding">; payment_instructions: SettingValue<"payment_instructions">;
  email: SettingValue<"email">; security: SettingValue<"security">; uploads: SettingValue<"uploads">; features: SettingValue<"features">; aiKeySet: boolean;
};

function Section<T>({ settingKey, title, description, value, disabled, children }: {
  settingKey: string; title: string; description?: string; value: T; disabled: boolean; children: React.ReactNode;
}) {
  const [state, action] = useActionState<ActionState, FormData>(saveSettings, undefined);
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle>{description ? <CardDescription>{description}</CardDescription> : null}</CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="key" value={settingKey} />
          <input type="hidden" name="value" value={JSON.stringify(value)} />
          <fieldset disabled={disabled} className="space-y-4">{children}</fieldset>
          {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state?.message ? <Alert tone="success">{state.message}</Alert> : null}
          {!disabled ? <SubmitButton pendingText={t.common.saving}>{t.common.save}</SubmitButton> : null}
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ id, label, value, onChange, type = "text", help }: { id: string; label: string; value: string | number; onChange: (v: string) => void; type?: string; help?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={help ? `${id}-h` : undefined} />
      {help ? <p id={`${id}-h`} className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

export function SettingsForms({ initial, disabled, logoUrl }: { initial: Initial; disabled: boolean; logoUrl: string | null }) {
  const [company, setCompany] = useState(initial.company);
  const [branding, setBranding] = useState(initial.branding);
  const [pay, setPay] = useState(initial.payment_instructions);
  const [email, setEmail] = useState(initial.email);
  const [sec, setSec] = useState(initial.security);
  const [uploads, setUploads] = useState(initial.uploads);
  const [features, setFeatures] = useState(initial.features);

  const validHex = (h: string) => /^#[0-9A-Fa-f]{6}$/.test(h);
  const lowContrast = (h: string) => validHex(h) && contrastRatio(h, "#ffffff") < 4.5;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section settingKey="company" title={t.settings.company} value={company} disabled={disabled}>
        <Field id="co-name" label="Display name" value={company.name} onChange={(v) => setCompany({ ...company, name: v })} />
        <Field id="co-legal" label="Registered business name" value={company.legal_name} onChange={(v) => setCompany({ ...company, legal_name: v })} />
        <Field id="co-addr" label="Address" value={company.address} onChange={(v) => setCompany({ ...company, address: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="co-phone" label="Phone" value={company.phone} onChange={(v) => setCompany({ ...company, phone: v })} />
          <Field id="co-email" label="Email" type="email" value={company.email} onChange={(v) => setCompany({ ...company, email: v })} />
        </div>
        <Field id="co-web" label="Website" value={company.website} onChange={(v) => setCompany({ ...company, website: v })} />
      </Section>

      <Section settingKey="payment_instructions" title={t.settings.payment} description={t.settings.paymentHelp} value={pay} disabled={disabled}>
        {pay.bank_accounts.map((b, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">Bank account {i + 1}</p>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove bank account ${i + 1}`} onClick={() => setPay({ ...pay, bank_accounts: pay.bank_accounts.filter((_, j) => j !== i) })}><Trash2 /></Button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["bank", "account_name", "account_no", "branch"] as const).map((k) => (
                <Field key={k} id={`b${i}-${k}`} label={{ bank: "Bank", account_name: "Account name", account_no: "Account number", branch: "Branch" }[k]}
                  value={b[k] ?? ""} onChange={(v) => setPay({ ...pay, bank_accounts: pay.bank_accounts.map((x, j) => (j === i ? { ...x, [k]: v } : x)) })} />
              ))}
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setPay({ ...pay, bank_accounts: [...pay.bank_accounts, { bank: "", account_name: "", account_no: "", branch: "" }] })}><Plus />Add bank account</Button>
        <Field id="pay-payee" label="Cheques payable to" value={pay.cheque_payee} onChange={(v) => setPay({ ...pay, cheque_payee: v })} />
        <div className="space-y-2"><Label htmlFor="pay-notes">Notes for clients</Label><Textarea id="pay-notes" value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} /></div>
      </Section>

      <Section settingKey="branding" title={t.settings.branding} description="Colours apply to buttons, links and highlights everywhere." value={branding} disabled={disabled}>
        {(["primary", "accent"] as const).map((k) => (
          <div key={k} className="space-y-2">
            <Label htmlFor={`br-${k}`}>{k === "primary" ? "Main colour" : "Accent colour"}</Label>
            <div className="flex items-center gap-3">
              <input type="color" aria-label={`${k} colour picker`} value={validHex(branding[k]) ? branding[k] : "#000000"} onChange={(e) => setBranding({ ...branding, [k]: e.target.value })} className="h-10 w-14 cursor-pointer rounded border" />
              <Input id={`br-${k}`} value={branding[k]} onChange={(e) => setBranding({ ...branding, [k]: e.target.value })} className="w-32 font-mono" />
              {validHex(branding[k]) ? <span className="rounded-md px-3 py-2 text-sm font-semibold text-white" style={{ background: readableOnWhiteText(branding[k]) }}>Button</span> : null}
            </div>
            {lowContrast(branding[k]) ? <p className="text-xs text-warning">{t.settings.contrastWarning} The app will use a darker shade ({readableOnWhiteText(branding[k])}) for buttons automatically.</p> : null}
          </div>
        ))}
      </Section>

      <Card>
        <CardHeader><CardTitle>Logo</CardTitle><CardDescription>Shown on the sign-in page, in the app and on the installed phone app.</CardDescription></CardHeader>
        <CardContent><LogoUploader logoUrl={logoUrl} disabled={disabled} /></CardContent>
      </Card>

      <Section settingKey="email" title={t.settings.email} description="Emails are sent through Resend. The sender domain must be verified in Resend first." value={email} disabled={disabled}>
        <Field id="em-name" label="Sender name" value={email.from_name} onChange={(v) => setEmail({ ...email, from_name: v })} />
        <Field id="em-from" label="Sender email" type="email" value={email.from_email} onChange={(v) => setEmail({ ...email, from_email: v })} />
        <Field id="em-reply" label="Replies go to" type="email" value={email.reply_to} onChange={(v) => setEmail({ ...email, reply_to: v })} />
      </Section>

      <Section settingKey="security" title={t.settings.security} value={sec} disabled={disabled}>
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div><p className="text-sm font-semibold">Require 2-step verification</p><p className="text-xs text-muted-foreground">For all staff and every Company admin. Others can turn it on themselves.</p></div>
          <Switch checked={sec.require_mfa} onCheckedChange={(v) => setSec({ ...sec, require_mfa: v })} aria-label="Require 2-step verification" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="se-web" type="number" label="Web sign-out after (hours idle)" value={sec.web_session_hours} onChange={(v) => setSec({ ...sec, web_session_hours: Number(v) })} />
          <Field id="se-app" type="number" label="Installed app sign-out after (days idle)" value={sec.app_session_days} onChange={(v) => setSec({ ...sec, app_session_days: Number(v) })} help='Applies when "Keep me signed in" is ticked.' />
          <Field id="se-max" type="number" label="Lock after failed attempts" value={sec.lockout_max_attempts} onChange={(v) => setSec({ ...sec, lockout_max_attempts: Number(v) })} />
          <Field id="se-min" type="number" label="Lock for (minutes)" value={sec.lockout_minutes} onChange={(v) => setSec({ ...sec, lockout_minutes: Number(v) })} />
        </div>
      </Section>

      <Section settingKey="uploads" title="File uploads" value={uploads} disabled={disabled}>
        <Field id="up-max" type="number" label="Maximum file size (MB)" value={uploads.max_file_mb} onChange={(v) => setUploads({ max_file_mb: Number(v) })}
          help="Supabase Free allows up to 50 MB per file. Upgrade to Pro for 100 MB." />
      </Section>

      <Section settingKey="features" title="Optional paid features" value={features} disabled={disabled}
        description="These cost money per use. They are off until you switch them on.">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">AI auto-fill for past estimates</p>
            <p className="text-xs text-muted-foreground">Reads an uploaded estimate (PDF or photo) with the Claude API and fills in the form for staff to check. Nothing is saved until staff press Save.
              Estimated cost: about US$0.04–0.08 (₱2–5) per estimate, billed by Anthropic to your own account. Needs an ANTHROPIC_API_KEY on the server.</p>
            {!initial.aiKeySet ? <p className="text-xs font-medium text-warning">No ANTHROPIC_API_KEY is set yet — the button stays hidden until it is.</p> : null}
          </div>
          <Switch checked={features.ai_autofill_enabled} disabled={disabled} onCheckedChange={(v) => setFeatures({ ai_autofill_enabled: v })} aria-label="AI auto-fill for past estimates" />
        </div>
      </Section>
    </div>
  );
}
