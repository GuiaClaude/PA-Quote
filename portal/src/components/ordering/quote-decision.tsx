"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { acceptQuote, declineQuote } from "@/lib/actions/ordering";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatCentavos, formatUnitPrice } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Quote = { id: string; quoteNo: string; leadTime: string | null; validUntil: string | null; vatInclusive: boolean; notes: string | null;
  tiers: { id: string; quantity: number; unit_price: string; total_centavos: number }[] };

/** The quote with one-tap acceptance: choose a quantity (pre-selected) and tap Accept. */
export function QuoteDecision({ quote, canAct }: { quote: Quote; canAct: boolean }) {
  const router = useRouter();
  const [tier, setTier] = useState(quote.tiers[0]?.id ?? "");
  const [po, setPo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const chosen = quote.tiers.find((t) => t.id === tier);

  return (
    <Card className="border-accent/40">
      <CardHeader>
        <CardTitle>Quote {quote.quoteNo}</CardTitle>
        <p className="text-sm text-muted-foreground">{[quote.leadTime ? `Lead time ${quote.leadTime}` : null, quote.validUntil ? `Valid until ${formatDate(quote.validUntil)}` : null, quote.vatInclusive ? "Prices include VAT" : "Prices exclude 12% VAT"].filter(Boolean).join(" · ")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="radiogroup" aria-label="Quantity" className="grid gap-2 sm:grid-cols-2">
          {quote.tiers.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tier === t.id} onClick={() => setTier(t.id)}
              className={cn("rounded-xl border p-4 text-left", tier === t.id ? "border-primary bg-primary-soft ring-1 ring-primary" : "bg-surface hover:bg-surface-muted")}>
              <p className="tabular text-sm text-muted-foreground">{t.quantity.toLocaleString("en-PH")} pcs</p>
              <p className="tabular text-xl font-bold">{formatCentavos(t.total_centavos)}</p>
              <p className="tabular text-xs text-muted-foreground">{formatUnitPrice(t.unit_price)} per piece</p>
            </button>
          ))}
        </div>
        {quote.notes ? <p className="rounded-lg bg-surface-muted p-3 text-sm whitespace-pre-wrap">{quote.notes}</p> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {canAct ? (
          <>
            <Input value={po} onChange={(e) => setPo(e.target.value)} maxLength={60} placeholder="Your PO number (optional)" aria-label="Your PO number" />
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Button size="lg" className="h-14 text-base" disabled={pending || !chosen}
                onClick={() => start(async () => { const r = await acceptQuote(quote.id, tier, po); if (r.orderId) router.push(`/app/orders/${r.orderId}?placed=1`); else setError(r.error ?? "Could not accept."); })}>
                {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Accept quote{chosen ? ` — ${formatCentavos(chosen.total_centavos)}` : ""}
              </Button>
              <Button size="lg" variant="outline" className="h-14" disabled={pending} onClick={() => setDeclineOpen(true)}><X />Decline</Button>
            </div>
            <p className="text-xs text-muted-foreground">Accepting places a confirmed order at this price. Payment is by bank transfer or cheque — instructions are on the order.</p>
          </>
        ) : <p className="text-sm text-muted-foreground">Your company admin or buyer can accept this quote.</p>}
      </CardContent>
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogTitle>Decline this quote?</DialogTitle>
          <DialogDescription>Tell us why (optional) — it helps us serve you better.</DialogDescription>
          <Textarea className="mt-3" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Over budget, timing changed" aria-label="Reason" />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeclineOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={() => start(async () => { const r = await declineQuote(quote.id, reason); setDeclineOpen(false); if (r?.error) setError(r.error); router.refresh(); })}>Decline quote</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
