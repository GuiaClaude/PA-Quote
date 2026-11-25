"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, History, Loader2, MessageSquareQuote, PenLine, ShoppingCart, Zap } from "lucide-react";
import { reorderNow, addToCart, requestReorderQuote } from "@/lib/actions/reorder";
import type { Address } from "@/components/ordering/order-wizard";
import { DeliveryFields, deliveryPayload, type Delivery } from "./delivery-fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatCentavos, formatUnitPrice } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type TierOffer = {
  quantity: number; status: "offered" | "blocked"; reasons: string[]; totalCentavos: number | null; vatCentavos: number | null; unitPrice: string | null;
  validUntil: string; baseDate: string; baseTotalCentavos: number; adjustmentPct: string | null; leadTime: string | null;
};

/** Plain-language reasons a client sees when an instant price isn’t possible. */
const WHY: Record<string, string> = {
  estimate_too_old: "our last price for this is over the age limit, so we’ll re-check it",
  adjustment_over_limit: "costs have changed more than usual since your last order",
  instant_quotes_off: "your account gets personal quotes from your sales contact",
  has_revisions: "there are artwork changes in progress",
  specs_changed: "the specs differ from the last price we gave",
  no_past_price: "we don’t have an agreed price for this yet",
  quantity_not_in_tiers: "this quantity hasn’t been priced before",
};

export function ReorderFlow({ printItemId, offers, lastOrder, addresses, showBreakdown, hasApprovedArtwork, openRevisionId }: {
  printItemId: string; offers: TierOffer[]; lastOrder: { quantity: number; placedAt: string; orderNo: string; addressId: string | null } | null;
  addresses: Address[]; showBreakdown: boolean; hasApprovedArtwork: boolean; openRevisionId: string | null;
}) {
  const router = useRouter();
  const defaultAddress = addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "";
  const initialQty = offers.find((o) => o.quantity === lastOrder?.quantity)?.quantity ?? offers.find((o) => o.status === "offered")?.quantity ?? offers[0]?.quantity ?? null;
  const [qty, setQty] = useState<number | "other" | null>(initialQty ?? "other");
  const [otherQty, setOtherQty] = useState("");
  const [artworkOk, setArtworkOk] = useState<boolean | null>(openRevisionId ? false : null);
  const [specChanges, setSpecChanges] = useState("");
  const [wantChanges, setWantChanges] = useState(false);
  const [delivery, setDelivery] = useState<Delivery>({ addressId: defaultAddress, requestedDate: "", clientPo: "", notes: "" });
  const [offersState, setOffers] = useState(offers);
  const [msg, setMsg] = useState<{ tone: "danger" | "success" | "warning"; text: string; cart?: boolean } | null>(null);
  const [pending, start] = useTransition();

  const offer = typeof qty === "number" ? offersState.find((o) => o.quantity === qty) ?? null : null;
  const instant = Boolean(offer && offer.status === "offered" && offer.totalCentavos !== null && !wantChanges && artworkOk === true);
  const needsQuote = artworkOk === true && (qty === "other" || wantChanges || (offer && offer.status === "blocked"));

  const sameAsLast = () => {
    if (!lastOrder) return;
    if (offersState.some((o) => o.quantity === lastOrder.quantity)) setQty(lastOrder.quantity); else { setQty("other"); setOtherQty(String(lastOrder.quantity)); }
    setDelivery((d) => ({ ...d, addressId: lastOrder.addressId && addresses.some((a) => a.id === lastOrder.addressId) ? lastOrder.addressId : d.addressId }));
    setArtworkOk(openRevisionId ? false : true); setWantChanges(false);
  };

  const placeNow = () => start(async () => {
    if (!offer || offer.totalCentavos === null) return;
    const r = await reorderNow({ printItemId, quantity: offer.quantity, expectedTotalCentavos: offer.totalCentavos, ...deliveryPayload(delivery) });
    if (r.orderId) return router.push(`/app/orders/${r.orderId}?placed=1`);
    if (r.changed) {
      const c = r.changed;
      setOffers((list) => list.map((o) => (o.quantity === offer.quantity ? { ...o, status: c.status, reasons: c.reasons, totalCentavos: c.totalCentavos, validUntil: c.validUntil } : o)));
      return setMsg({ tone: "warning", text: c.status === "offered" ? `The price was updated to today’s rates: ${formatCentavos(c.totalCentavos!)}. Please check and press again.` : "This quantity now needs a quote — you can ask for one below." });
    }
    setMsg({ tone: "danger", text: r.error ?? "Could not place the order." });
  });
  const toCart = () => start(async () => {
    if (!offer) return;
    const r = await addToCart(printItemId, offer.quantity);
    setMsg(r?.error ? { tone: "danger", text: r.error } : { tone: "success", text: r?.message ?? "Added.", cart: true });
  });
  const askQuote = () => start(async () => {
    const quantities = qty === "other" ? otherQty.split(/[,\s/]+/).map((x) => Number(x.replace(/\D/g, ""))).filter((n) => n > 0) : typeof qty === "number" ? [qty] : [];
    if (!quantities.length) return setMsg({ tone: "danger", text: "Type the quantity you need." });
    const r = await requestReorderQuote({ printItemId, quantities, changes: wantChanges ? specChanges : "", ...deliveryPayload(delivery) });
    if (r.requestId) return router.push(`/app/quotes/${r.requestId}?sent=1`);
    setMsg({ tone: "danger", text: r.error ?? "Could not send the request." });
  });

  if (!hasApprovedArtwork) return <Alert tone="warning">This item has no approved artwork yet, so it can’t be reordered online. Please contact Print Amplified.</Alert>;

  return (
    <div className="space-y-6">
      {lastOrder ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
          <History className="size-5 text-muted-foreground" />
          <span className="flex-1">Last ordered <b>{lastOrder.quantity.toLocaleString("en-PH")} pcs</b> on {formatDate(lastOrder.placedAt)} ({lastOrder.orderNo}).</span>
          <Button size="sm" variant="outline" onClick={sameAsLast}>Same as last order</Button>
        </div>
      ) : null}

      <Card>
        <CardHeader><CardTitle>1. Is the artwork still correct?</CardTitle><CardDescription>We’ll print exactly the approved version.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {openRevisionId ? (
            <Alert tone="info">Artwork changes are in progress. <Link className="font-semibold underline" href={`/app/revisions/${openRevisionId}`}>Open the revision</Link> — you can reorder once the new proof is approved.</Alert>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice active={artworkOk === true} onClick={() => setArtworkOk(true)} Icon={CheckCircle2} title="Yes — print as is" text="Same artwork as last time." />
              <Choice active={artworkOk === false} onClick={() => setArtworkOk(false)} Icon={PenLine} title="I have changes" text="Mark up the artwork first." />
            </div>
          )}
          {artworkOk === false && !openRevisionId ? (
            <Alert tone="info">Mark your changes on the artwork and send them to prepress. We’ll send a revised proof; after you approve it, we’ll quote the reprint.
              <div className="mt-2"><Button asChild size="sm"><Link href={`/app/items/${printItemId}/review`}><PenLine />Mark up the artwork</Link></Button></div></Alert>
          ) : null}
        </CardContent>
      </Card>

      {artworkOk === true ? (
        <>
          <Card>
            <CardHeader><CardTitle>2. How many?</CardTitle><CardDescription>Quantities with a price can be ordered instantly. Any other quantity gets a quote from us.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quantity">
                {offersState.map((o) => (
                  <button key={o.quantity} type="button" role="radio" aria-checked={qty === o.quantity} onClick={() => setQty(o.quantity)}
                    className={cn("min-w-32 rounded-lg border px-4 py-2.5 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary", qty === o.quantity && "border-primary bg-primary-soft ring-1 ring-primary")}>
                    <span className="block text-sm font-semibold tabular">{o.quantity.toLocaleString("en-PH")} pcs</span>
                    <span className="block text-xs text-muted-foreground tabular">{o.status === "offered" && o.totalCentavos !== null ? formatCentavos(o.totalCentavos) : "Quote needed"}</span>
                  </button>
                ))}
                <button type="button" role="radio" aria-checked={qty === "other"} onClick={() => setQty("other")}
                  className={cn("min-w-32 rounded-lg border border-dashed px-4 py-2.5 text-left hover:border-primary", qty === "other" && "border-primary bg-primary-soft ring-1 ring-primary")}>
                  <span className="block text-sm font-semibold">Other quantity</span><span className="block text-xs text-muted-foreground">Get a quote</span>
                </button>
              </div>
              {qty === "other" ? <div className="max-w-xs space-y-1"><Label htmlFor="ro-other">Quantity (or several, e.g. 1500, 3000)</Label><Input id="ro-other" inputMode="numeric" value={otherQty} onChange={(e) => setOtherQty(e.target.value)} /></div> : null}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={wantChanges} onChange={(e) => setWantChanges(e.target.checked)} />I need different specs (paper, size, finishing…)</label>
              {wantChanges ? <div className="space-y-1"><Label htmlFor="ro-changes">What should change?</Label><Textarea id="ro-changes" rows={3} value={specChanges} onChange={(e) => setSpecChanges(e.target.value)} placeholder="e.g. 350gsm instead of 300gsm, add matte lamination" /></div> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3. Delivery</CardTitle></CardHeader>
            <CardContent><DeliveryFields addresses={addresses} value={delivery} onChange={setDelivery} /></CardContent>
          </Card>

          <Card className="border-primary/40" aria-live="polite">
            <CardContent className="space-y-3 pt-5">
              {msg ? <Alert tone={msg.tone}>{msg.text}{msg.cart ? <> <Link href="/app/cart" className="font-semibold underline">View cart</Link></> : null}</Alert> : null}
              {instant && offer ? (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-sm text-muted-foreground">{offer.quantity.toLocaleString("en-PH")} pcs · {formatUnitPrice(offer.unitPrice)} each</p>
                      <p className="text-3xl font-bold tabular">{formatCentavos(offer.totalCentavos!)}</p>
                      <p className="text-xs text-muted-foreground">VAT inclusive (12% VAT {formatCentavos(offer.vatCentavos ?? 0)}) · price good until {formatDate(offer.validUntil)}</p>
                    </div>
                    {offer.leadTime ? <p className="text-sm">Ready in about <b>{offer.leadTime}</b> after confirmation</p> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">Based on your previous order/estimate of {formatDate(offer.baseDate)}, adjusted for current costs.
                    {showBreakdown ? <> Previous price {formatCentavos(offer.baseTotalCentavos)}; change {Number(offer.adjustmentPct ?? 0) >= 0 ? "+" : ""}{Number(offer.adjustmentPct ?? 0).toFixed(1)}%.</> : null}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="lg" disabled={pending} onClick={placeNow}>{pending ? <Loader2 className="animate-spin" /> : <Zap />}Reorder now — {formatCentavos(offer.totalCentavos!)}</Button>
                    <Button size="lg" variant="outline" disabled={pending} onClick={toCart}><ShoppingCart />Add to cart</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">By ordering you agree to pay this amount. The order is confirmed right away. To change or cancel it, contact Print Amplified.</p>
                </>
              ) : needsQuote ? (
                <>
                  <p className="font-semibold">We’ll send you a quote</p>
                  <p className="text-sm text-muted-foreground">
                    {qty === "other" ? WHY.quantity_not_in_tiers : wantChanges ? WHY.specs_changed : (offer?.reasons ?? []).map((r) => WHY[r] ?? r).join("; ")}.
                    {" "}Usually within one working day. You’ll get an email when it’s ready.</p>
                  <Button size="lg" disabled={pending} onClick={askQuote}>{pending ? <Loader2 className="animate-spin" /> : <MessageSquareQuote />}Ask for a quote</Button>
                </>
              ) : <p className="text-sm text-muted-foreground">Choose a quantity.</p>}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Choice({ active, onClick, Icon, title, text }: { active: boolean; onClick: () => void; Icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("flex items-start gap-3 rounded-lg border p-3 text-left hover:border-primary", active && "border-primary bg-primary-soft ring-1 ring-primary")}>
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" /><span><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{text}</span></span>
    </button>
  );
}
