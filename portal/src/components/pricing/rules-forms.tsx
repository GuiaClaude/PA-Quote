"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Save, StopCircle } from "lucide-react";
import { savePricingSettings, saveInflationRate, addSurchargeOrAddon, endSurchargeOrAddon } from "@/lib/actions/pricing";
import type { ActionState } from "@/lib/actions/account";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import { formatCentavos } from "@/lib/money";
import { formatDate } from "@/lib/dates";

type Settings = { roundingStepPesos: 1 | 5 | 10; roundingScope: "order_total" | "unit_price"; vatRatePct: number; quoteValidityDays: number; maxEstimateAgeYears: number; maxAdjustmentPct: number; showBreakdownToClients: boolean; quoteReplyTargetHours: number; version: number };
type Rule = { id: string; label: string; value: string; target: string; from: string; to: string | null };

export function PricingRulesForms({ isAdmin, today, settings, inflation, categories, surcharges, addons }: {
  isAdmin: boolean; today: string; settings: Settings; inflation: { year: number; ratePct: string; needsConfirmation: boolean; note: string | null }[];
  categories: { id: string; name: string }[]; surcharges: Rule[]; addons: Rule[];
}) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>) => start(async () => { setMsg(await fn()); router.refresh(); });
  const thisYear = Number(today.slice(0, 4));
  const years = [...new Set([...inflation.map((r) => r.year), thisYear])].sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      {msg?.error ? <Alert tone="danger">{msg.error}</Alert> : null}
      {msg?.message ? <Alert tone="success">{msg.message}</Alert> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Instant quote rules</CardTitle><CardDescription>Version {settings.version}. Saving creates a new version; past quotes keep theirs.</CardDescription></CardHeader>
          <CardContent>
            <fieldset disabled={!isAdmin} className="grid gap-4 sm:grid-cols-2">
              <Field label="Round up to">
                <Select value={s.roundingStepPesos} onChange={(e) => setS({ ...s, roundingStepPesos: Number(e.target.value) as 1 | 5 | 10 })}>
                  <option value={1}>nearest ₱1</option><option value={5}>nearest ₱5</option><option value={10}>nearest ₱10</option>
                </Select>
              </Field>
              <Field label="Round the">
                <Select value={s.roundingScope} onChange={(e) => setS({ ...s, roundingScope: e.target.value as Settings["roundingScope"] })}>
                  <option value="order_total">order total</option><option value="unit_price">price per piece (to ₱0.01/0.05/0.10)</option>
                </Select>
              </Field>
              <Field label="VAT rate (%)"><Input type="number" step="0.01" value={s.vatRatePct} onChange={(e) => setS({ ...s, vatRatePct: Number(e.target.value) })} /></Field>
              <Field label="Quotes valid for (days)"><Input type="number" value={s.quoteValidityDays} onChange={(e) => setS({ ...s, quoteValidityDays: Number(e.target.value) })} /></Field>
              <Field label="Oldest estimate for instant quotes (years)"><Input type="number" step="0.5" value={s.maxEstimateAgeYears} onChange={(e) => setS({ ...s, maxEstimateAgeYears: Number(e.target.value) })} /></Field>
              <Field label="Largest automatic increase (%)"><Input type="number" step="0.5" value={s.maxAdjustmentPct} onChange={(e) => setS({ ...s, maxAdjustmentPct: Number(e.target.value) })} /></Field>
              <Field label="Quote reply target (hours)"><Input type="number" value={s.quoteReplyTargetHours} onChange={(e) => setS({ ...s, quoteReplyTargetHours: Number(e.target.value) })} /></Field>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
                <div><p className="text-sm font-medium">Show clients the price breakdown</p><p className="text-xs text-muted-foreground">Off: clients see only the final price. On: past price + adjustment.</p></div>
                <Switch checked={s.showBreakdownToClients} onCheckedChange={(v) => setS({ ...s, showBreakdownToClients: v })} aria-label="Show clients the price breakdown" />
              </div>
            </fieldset>
            {isAdmin ? <Button className="mt-4" disabled={pending} onClick={() => run(() => savePricingSettings(s))}><Save />Save rules</Button> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Yearly inflation</CardTitle><CardDescription>Compounded from the estimate date to today, prorated for part-years. A missing year uses the latest earlier rate.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {years.map((y) => <InflationRow key={y} year={y} row={inflation.find((r) => r.year === y)} isAdmin={isAdmin} onSaved={(m) => { setMsg(m); router.refresh(); }} />)}
          </CardContent>
        </Card>

        <RuleList title="Material / category surcharges" description="Extra % on items in a category or with a material (e.g. paperboard +5% after a supplier increase)." rules={surcharges} kind="surcharge"
          isAdmin={isAdmin} categories={categories} today={today} onDone={(m) => { setMsg(m); router.refresh(); }} />
        <RuleList title="Fixed add-ons" description="An amount added to every instant quote, or to one category (e.g. delivery, handling). VAT-exclusive." rules={addons} kind="addon"
          isAdmin={isAdmin} categories={categories} today={today} onDone={(m) => { setMsg(m); router.refresh(); }} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function InflationRow({ year, row, isAdmin, onSaved }: { year: number; row?: { ratePct: string; needsConfirmation: boolean; note: string | null }; isAdmin: boolean; onSaved: (m: ActionState) => void }) {
  const [rate, setRate] = useState(row?.ratePct ?? "");
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 font-semibold tabular">{year}</span>
      <Input className="w-24" value={rate} disabled={!isAdmin} onChange={(e) => setRate(e.target.value)} aria-label={`Inflation ${year} %`} inputMode="decimal" />
      <span className="text-sm text-muted-foreground">%</span>
      <span className="flex-1 truncate text-xs text-muted-foreground">{row ? (row.needsConfirmation ? <Badge tone="warning">please confirm</Badge> : row.note) : "not set — uses the latest earlier year"}</span>
      {isAdmin ? <Button size="sm" variant={row?.needsConfirmation ? "default" : "outline"} disabled={pending || !rate} onClick={() => start(async () => onSaved(await saveInflationRate(year, rate, "Confirmed by management")))}><Check />{row?.needsConfirmation ? "Confirm" : "Save"}</Button> : null}
    </div>
  );
}

function RuleList({ title, description, rules, kind, isAdmin, categories, today, onDone }: {
  title: string; description: string; rules: Rule[]; kind: "surcharge" | "addon"; isAdmin: boolean; categories: { id: string; name: string }[]; today: string; onDone: (m: ActionState) => void;
}) {
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [target, setTarget] = useState(kind === "addon" ? "order" : categories[0]?.id ?? "");
  const [material, setMaterial] = useState("");
  const [from, setFrom] = useState(today);
  const [pending, start] = useTransition();
  const active = (r: Rule) => r.from <= today && (!r.to || r.to >= today);
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {rules.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
          <ul className="divide-y text-sm">{rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              <span className="flex-1"><b>{r.label}</b> · {kind === "addon" ? formatCentavos(Number(r.value)) : r.value} · {r.target}<br />
                <span className="text-xs text-muted-foreground">from {formatDate(r.from)}{r.to ? ` to ${formatDate(r.to)}` : ""}</span></span>
              {active(r) ? <Badge tone="success">active</Badge> : <Badge>ended</Badge>}
              {isAdmin && active(r) ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => onDone(await endSurchargeOrAddon(kind, r.id)))} aria-label={`End ${r.label}`}><StopCircle /></Button> : null}
            </li>
          ))}</ul>
        )}
        {isAdmin ? (
          <div className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2">
            <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label" />
            <Input placeholder={kind === "addon" ? "Amount ₱" : "Percent, e.g. 5"} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Value" inputMode="decimal" />
            <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Applies to">
              {kind === "addon" ? <option value="order">Every quote</option> : <option value="material">A material (type below)</option>}
              {categories.map((c) => <option key={c.id} value={c.id}>Category: {c.name}</option>)}
            </Select>
            {kind === "surcharge" && target === "material" ? <Input placeholder="Material contains, e.g. board" value={material} onChange={(e) => setMaterial(e.target.value)} aria-label="Material" /> : <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Starts" />}
            <Button size="sm" disabled={pending || !label || !value} onClick={() => start(async () => onDone(await addSurchargeOrAddon({
              kind, label, value, effectiveFrom: from,
              categoryId: target !== "order" && target !== "material" ? target : null,
              materialKey: kind === "surcharge" && target === "material" ? material : null,
              scope: kind === "addon" ? (target === "order" ? "order" : "category") : undefined,
            })))}>Add</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
