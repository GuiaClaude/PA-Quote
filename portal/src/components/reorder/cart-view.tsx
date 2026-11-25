"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCcw, Trash2, Zap } from "lucide-react";
import { checkoutCart, removeFromCart } from "@/lib/actions/reorder";
import type { Address } from "@/components/ordering/order-wizard";
import { DeliveryFields, deliveryPayload, type Delivery } from "./delivery-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatCentavos } from "@/lib/money";
import { formatDate } from "@/lib/dates";

type Row = { printItemId: string; name: string; code: string | null; quantity: number; totalCentavos: number | null; vatCentavos: number | null; validUntil: string; stale: boolean };

export function CartView({ rows, addresses }: { rows: Row[]; addresses: Address[] }) {
  const router = useRouter();
  const [delivery, setDelivery] = useState<Delivery>({ addressId: addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "", requestedDate: "", clientPo: "", notes: "" });
  const [msg, setMsg] = useState<{ tone: "danger" | "warning"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const total = rows.reduce((s, r) => s + (r.totalCentavos ?? 0), 0);
  const vat = rows.reduce((s, r) => s + (r.vatCentavos ?? 0), 0);
  const anyStale = rows.some((r) => r.stale);
  const checkout = () => start(async () => {
    const r = await checkoutCart(deliveryPayload(delivery));
    if (r.orderId) return router.push(`/app/orders/${r.orderId}?placed=1`);
    setMsg({ tone: r.repriced ? "warning" : "danger", text: r.error ?? "Could not place the order." });
    router.refresh();
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Items</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">{rows.map((r) => (
              <li key={r.printItemId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.code ? `${r.code} · ` : ""}{r.quantity.toLocaleString("en-PH")} pcs · good until {formatDate(r.validUntil)}</p></div>
                {r.stale ? <Badge tone="warning"><RefreshCcw className="size-3" />re-priced at checkout</Badge> : null}
                <span className="font-semibold tabular">{r.totalCentavos !== null ? formatCentavos(r.totalCentavos) : "—"}</span>
                <Button size="icon" variant="ghost" aria-label={`Remove ${r.name}`} disabled={pending} onClick={() => start(async () => { await removeFromCart(r.printItemId); router.refresh(); })}><Trash2 /></Button>
              </li>
            ))}</ul>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Delivery</CardTitle></CardHeader><CardContent><DeliveryFields addresses={addresses} value={delivery} onChange={setDelivery} /></CardContent></Card>
      </div>
      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <dl className="space-y-1 text-sm tabular">
            <div className="flex justify-between"><dt>VATable sales</dt><dd>{formatCentavos(total - vat)}</dd></div>
            <div className="flex justify-between"><dt>12% VAT</dt><dd>{formatCentavos(vat)}</dd></div>
            <div className="flex justify-between border-t pt-2 text-base font-bold"><dt>Total</dt><dd>{formatCentavos(total)}</dd></div>
          </dl>
          {anyStale ? <p className="text-xs text-warning">Some prices have expired and will be recalculated at today&apos;s rates before you order.</p> : null}
          {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
          <Button size="lg" className="w-full" disabled={pending} onClick={checkout}>{pending ? <Loader2 className="animate-spin" /> : <Zap />}{anyStale ? "Update prices" : `Place order — ${formatCentavos(total)}`}</Button>
          <p className="text-xs text-muted-foreground">One order for all items. Confirmed right away; Print Amplified will contact you about payment.</p>
        </CardContent>
      </Card>
    </div>
  );
}
