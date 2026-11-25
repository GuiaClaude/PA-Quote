"use client";
import { useMemo, useState, useTransition } from "react";
import { Calculator, Loader2 } from "lucide-react";
import { previewInstantQuote } from "@/lib/actions/pricing";
import type { ItemQuote } from "@/lib/pricing/context";
import { QuoteBreakdown } from "./quote-breakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { formatCentavos, formatUnitPrice } from "@/lib/money";
import { formatDate } from "@/lib/dates";

type Item = { id: string; name: string; code: string | null; organizationId: string; client: string; tiers: number[] };

export function QuotePreviewTool({ items, initialItem }: { items: Item[]; initialItem: string | null }) {
  const clients = useMemo(() => [...new Map(items.map((i) => [i.organizationId, i.client])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [items]);
  const first = items.find((i) => i.id === initialItem);
  const [org, setOrg] = useState(first?.organizationId ?? clients[0]?.[0] ?? "");
  const [itemId, setItemId] = useState(first?.id ?? "");
  const [qty, setQty] = useState("");
  const [quote, setQuote] = useState<ItemQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const orgItems = items.filter((i) => i.organizationId === org);
  const item = items.find((i) => i.id === itemId);
  const run = (q: number) => start(async () => { setError(null); const r = await previewInstantQuote(itemId, q); setQuote(r.quote ?? null); setError(r.error ?? null); });
  const rules = quote?.inputs.rules as { vatRatePct: string; roundingStepPesos: number } | undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="h-fit"><CardContent className="space-y-4 pt-5">
        <div className="space-y-1"><Label htmlFor="pv-client">Client</Label>
          <Select id="pv-client" value={org} onChange={(e) => { setOrg(e.target.value); setItemId(""); setQuote(null); }}>{clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></div>
        <div className="space-y-1"><Label htmlFor="pv-item">Print Item</Label>
          <Select id="pv-item" value={itemId} onChange={(e) => { setItemId(e.target.value); setQuote(null); }}>
            <option value="">Choose…</option>{orgItems.map((i) => <option key={i.id} value={i.id}>{i.name}{i.code ? ` (${i.code})` : ""}</option>)}
          </Select></div>
        {item ? (
          <div className="space-y-2">
            <Label>Quantity</Label>
            <div className="flex flex-wrap gap-2">{item.tiers.map((q) => <Button key={q} size="sm" variant="outline" disabled={pending} onClick={() => { setQty(String(q)); run(q); }}>{q.toLocaleString("en-PH")}</Button>)}</div>
            {item.tiers.length === 0 ? <p className="text-xs text-muted-foreground">No agreed prices yet — confirm a past estimate first.</p> : null}
            <div className="flex gap-2"><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Other quantity" aria-label="Quantity" />
              <Button disabled={pending || !qty} onClick={() => run(Number(qty))}>{pending ? <Loader2 className="animate-spin" /> : <Calculator />}Check</Button></div>
          </div>
        ) : null}
      </CardContent></Card>

      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {quote ? (
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>{quote.item.name} · {Number(quote.inputs.quantity).toLocaleString("en-PH")} pcs</CardTitle>
              {quote.result.status === "offered" ? <Badge tone="success">Instant quote</Badge> : <Badge tone="accent">Needs Quote</Badge>}
            </CardHeader>
            <CardContent className="space-y-4">
              {quote.result.price ? (
                <div className="rounded-xl bg-surface-muted p-4">
                  <p className="text-sm text-muted-foreground">{quote.result.status === "offered" ? "The client would see" : "Suggested price for the sales team"}</p>
                  <p className="tabular text-3xl font-bold">{formatCentavos(quote.result.price.totalCentavos)}</p>
                  <p className="tabular text-sm text-muted-foreground">{formatUnitPrice(quote.result.price.unitPrice)} per piece · VAT inclusive · valid until {formatDate(quote.result.validUntil)}</p>
                </div>
              ) : null}
              <QuoteBreakdown result={quote.result} baseDate={quote.base?.baseDate ?? null} baseRef={quote.base?.sourceRef} vatRatePct={rules?.vatRatePct ?? 12} roundingStep={rules?.roundingStepPesos ?? 5} />
            </CardContent>
          </Card>
        ) : <p className="text-sm text-muted-foreground">Choose a client, item and quantity.</p>}
      </div>
    </div>
  );
}
