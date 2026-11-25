"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, Trash2 } from "lucide-react";
import { sendQuoteToClient } from "@/lib/actions/quotes";
import type { ActionState } from "@/lib/actions/account";
import { tierFromTotal, tierFromUnit } from "@/lib/pricing/tiers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/confirm-submit";
import { formatCentavos, formatUnitPrice } from "@/lib/money";

type Row = { key: string; quantity: string; mode: "total" | "unit"; price: string };

export function QuoteBuilder({ requestId, quantities, leadTime: leadDefault, validDefault, revising }: {
  requestId: string; quantities: number[]; leadTime: string; validDefault: string; revising: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => (quantities.length ? quantities : [0]).map((q) => ({ key: crypto.randomUUID(), quantity: q ? String(q) : "", mode: "total", price: "" })));
  const [leadTime, setLeadTime] = useState(leadDefault);
  const [validUntil, setValidUntil] = useState(validDefault);
  const [vatInclusive, setVatInclusive] = useState(true);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  const update = (key: string, p: Partial<Row>) => setRows((l) => l.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const calc = (r: Row) => {
    const q = Number(r.quantity);
    if (!Number.isInteger(q) || q <= 0 || !r.price.trim()) return null;
    try { return r.mode === "total" ? tierFromTotal(q, r.price) : tierFromUnit(q, r.price); } catch { return null; }
  };
  const ready = rows.length > 0 && rows.every((r) => calc(r));

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle>{revising ? "Send a revised quote" : "Reply with a quote"}</CardTitle>
        <CardDescription>Price each quantity. Type the total or the price per piece — the other is worked out exactly.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {rows.map((r) => {
            const c = calc(r);
            return (
              <div key={r.key} className="grid grid-cols-[1fr_110px_1fr_auto] items-end gap-2">
                <div className="space-y-1"><Label className="text-xs">Quantity</Label><Input type="number" min={1} value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Price is</Label>
                  <Select value={r.mode} onChange={(e) => update(r.key, { mode: e.target.value as Row["mode"] })}><option value="total">Total</option><option value="unit">Per piece</option></Select></div>
                <div className="space-y-1"><Label className="text-xs">₱</Label><Input inputMode="decimal" value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} placeholder={r.mode === "total" ? "2,900.00" : "2.90"} /></div>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove quantity" onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))}><Trash2 /></Button>
                <p className="col-span-4 -mt-1 text-xs text-muted-foreground tabular">{c ? `${formatCentavos(c.totalCentavos)} total · ${formatUnitPrice(c.unit)} per piece` : " "}</p>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((l) => [...l, { key: crypto.randomUUID(), quantity: "", mode: "total", price: "" }])}><Plus />Add quantity</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="qb-lead">Lead time</Label><Input id="qb-lead" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} placeholder="5–7 working days" /></div>
          <div className="space-y-1"><Label htmlFor="qb-valid">Valid until</Label><Input id="qb-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={vatInclusive} onChange={(e) => setVatInclusive(e.target.checked)} />Prices include 12% VAT</label>
        </div>
        <div className="space-y-1"><Label htmlFor="qb-notes">Notes for the client</Label><Textarea id="qb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="What's included, delivery, artwork notes…" /></div>
        {msg?.error ? <Alert tone="danger">{msg.error}</Alert> : null}
        {msg?.message ? <Alert tone="success">{msg.message}</Alert> : null}
        <ConfirmButton destructive={false} disabled={!ready || pending} title="Send this quote?"
          message={revising ? "The earlier quote will be replaced by this one. The client gets an email and can accept it in one tap." : "The client gets an email and can accept it in one tap. Accepting creates a confirmed order at these prices."}
          confirmLabel="Send quote"
          onConfirm={() => start(async () => {
            const r = await sendQuoteToClient({ requestId, leadTime, validUntil, vatInclusive, notes, tiers: rows.map((x) => ({ quantity: Number(x.quantity), mode: x.mode, price: x.price })) });
            setMsg(r);
            if (!r?.error) router.refresh();
          })}>
          <Send />Send quote to client
        </ConfirmButton>
      </CardContent>
    </Card>
  );
}
