"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calculator, Pencil, Save } from "lucide-react";
import { setPriceTier, overrideInstantQuote } from "@/lib/actions/pricing";
import type { ActionState } from "@/lib/actions/account";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatCentavos, formatUnitPrice } from "@/lib/money";
import { formatDate } from "@/lib/dates";

type TierRow = { quantity: number; unitPrice: string; totalCentavos: number; vatInclusive: boolean; source: string; sourceRef: string | null; baseDate: string };
type QuoteRow = { id: string; quantity: number; totalCentavos: number | null; status: string; reasons: string[]; createdAt: string; validUntil: string; overrideReason: string | null };

const REASON: Record<string, string> = {
  no_past_price: "no agreed price", specs_changed: "specs changed", has_revisions: "has revisions", quantity_not_in_tiers: "other quantity",
  estimate_too_old: "estimate too old", adjustment_over_limit: "increase over limit", instant_quotes_off: "instant quotes off",
};

export function ItemPrices({ printItemId, tiers, quotes, today }: { printItemId: string; tiers: TierRow[]; quotes: QuoteRow[]; today: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ quantity: "", total: "", vatInclusive: true, reference: "", baseDate: today });
  const done = (m: ActionState) => { setMsg(m); router.refresh(); };
  return (
    <div className="space-y-4">
      {msg?.error ? <Alert tone="danger">{msg.error}</Alert> : null}
      {msg?.message ? <Alert tone="success">{msg.message}</Alert> : null}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div><CardTitle>Agreed prices</CardTitle><CardDescription>Instant reorder quotes start from these. Usually set by confirming a past estimate.</CardDescription></div>
          <Button asChild size="sm" variant="outline"><Link href={`/staff/pricing/preview?item=${printItemId}`}><Calculator />Preview quote</Link></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {tiers.length === 0 ? <p className="text-sm text-muted-foreground">No agreed prices yet — reorders of this item will need a manual quote.</p> : (
            <ul className="divide-y text-sm tabular">{tiers.map((p) => (
              <li key={p.quantity} className="py-2">
                <div className="flex justify-between gap-2"><span>{p.quantity.toLocaleString("en-PH")} pcs · {formatUnitPrice(p.unitPrice)}</span><b>{formatCentavos(p.totalCentavos)}</b></div>
                <p className="text-xs text-muted-foreground">{p.source === "manual" ? "Set by hand" : "Estimate"}{p.sourceRef ? ` ${p.sourceRef}` : ""} · {formatDate(p.baseDate)} · {p.vatInclusive ? "VAT inclusive" : "VAT exclusive"}</p>
              </li>
            ))}</ul>
          )}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Set a price by hand</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Quantity</Label><Input inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value.replace(/\D/g, "") })} /></div>
              <div className="space-y-1"><Label className="text-xs">Total ₱</Label><Input inputMode="decimal" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Price date (inflation counts from here)</Label><Input type="date" value={form.baseDate} onChange={(e) => setForm({ ...form, baseDate: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Reference</Label><Input value={form.reference} placeholder="e.g. agreed by phone with Ms. Cruz" onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={form.vatInclusive} onCheckedChange={(v) => setForm({ ...form, vatInclusive: v })} aria-label="Includes VAT" />Includes 12% VAT</label>
              <Button className="sm:col-span-2 sm:justify-self-start" disabled={pending || !form.quantity || !form.total} onClick={() => start(async () => done(await setPriceTier({ printItemId, quantity: Number(form.quantity), total: form.total, vatInclusive: form.vatInclusive, reference: form.reference, baseDate: form.baseDate, validUntil: null })))}><Save />Save price</Button>
            </div>
          </details>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent instant quotes</CardTitle><CardDescription>You can change an offered price (with a reason) until the client accepts it.</CardDescription></CardHeader>
        <CardContent>
          {quotes.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
            <ul className="divide-y text-sm">{quotes.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex-1"><span className="tabular">{q.quantity.toLocaleString("en-PH")} pcs · <b>{q.totalCentavos !== null ? formatCentavos(q.totalCentavos) : "—"}</b></span>
                  <span className="block text-xs text-muted-foreground">{formatDate(q.createdAt)} · valid to {formatDate(q.validUntil)}{q.reasons.length ? ` · ${q.reasons.map((r) => REASON[r] ?? r).join(", ")}` : ""}{q.overrideReason ? ` · changed: ${q.overrideReason}` : ""}</span></span>
                <Badge tone={q.status === "accepted" ? "success" : q.status === "offered" ? "info" : q.status === "blocked" ? "warning" : "neutral"}>{q.status === "blocked" ? "needs quote" : q.status}</Badge>
                {q.status === "offered" && q.validUntil >= today ? <OverrideButton id={q.id} current={q.totalCentavos} onDone={done} /> : null}
              </li>
            ))}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OverrideButton({ id, current, onDone }: { id: string; current: number | null; onDone: (m: ActionState) => void }) {
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(current !== null ? (current / 100).toFixed(2) : "");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost" aria-label="Change this quote"><Pencil /></Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Change this quote</DialogTitle>
        <DialogDescription>The client sees the new total. The old total and your reason are kept.</DialogDescription>
        <div className="mt-3 space-y-3">
          <div className="space-y-1"><Label className="text-xs">New total ₱ (VAT inclusive)</Label><Input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Reason (required)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. loyalty discount approved by GM" /></div>
          <div className="flex justify-end"><Button disabled={pending || !total || reason.trim().length < 3} onClick={() => start(async () => { onDone(await overrideInstantQuote(id, total, reason)); setOpen(false); })}>Save</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
