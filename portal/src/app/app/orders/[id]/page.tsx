import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Landmark } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { canSeePrices } from "@/lib/auth/roles";
import { supabaseServer } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge, PaymentBadge } from "@/components/data/status-badge";
import { StatusTimeline } from "@/components/data/status-timeline";
import { formatCentavos, formatUnitPrice } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { t } from "@/i18n";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClient();
  const prices = canSeePrices(user);
  const sb = await supabaseServer();
  const { data: order } = await sb.from("orders")
    .select(`id, order_no, status, placed_at, client_po_no, requested_delivery_date, delivery_address_snapshot, notes,
      order_items(id, title, quantity${prices ? ", order_item_prices(unit_price, total_centavos)" : ""}),
      order_status_events(id, to_status, note, created_at)${prices ? ", order_financials(net_centavos, vat_centavos, total_centavos, amount_paid_centavos, payment_status)" : ""}`)
    .eq("id", id).maybeSingle();
  if (!order) notFound();
  const o = order as unknown as Record<string, unknown>;
  const fin = o.order_financials as { net_centavos: number; vat_centavos: number; total_centavos: number; amount_paid_centavos: number; payment_status: string } | null;
  const items = (o.order_items as Array<{ id: string; title: string; quantity: number; order_item_prices?: { unit_price: string; total_centavos: number } | null }>) ?? [];
  const events = (o.order_status_events as Array<{ id: string; to_status: string; note: string | null; created_at: string }>) ?? [];
  const payInfo = prices ? await getSetting("payment_instructions") : null;
  const address = o.delivery_address_snapshot as { label?: string; city?: string } | null;

  return (
    <>
      <Link href="/app/orders" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{t.orders.title}</Link>
      <PageHeader title={o.order_no as string} description={`Placed ${formatDate(o.placed_at as string)}${o.client_po_no ? ` · PO ${o.client_po_no}` : ""}`}
        actions={<OrderStatusBadge status={o.status as string} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t.orders.items}</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div><p className="font-medium">{i.title}</p><p className="text-muted-foreground tabular">{i.quantity.toLocaleString("en-PH")} pcs{prices && i.order_item_prices ? ` × ${formatUnitPrice(i.order_item_prices.unit_price)}` : ""}</p></div>
                    {prices && i.order_item_prices ? <span className="tabular font-semibold">{formatCentavos(i.order_item_prices.total_centavos)}</span> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Order progress</CardTitle></CardHeader>
            <CardContent><StatusTimeline events={events} /></CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Delivery</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{address?.label ?? "—"}{address?.city ? `, ${address.city}` : ""}</p>
              <p className="text-muted-foreground">Requested: {formatDate(o.requested_delivery_date as string | null)}</p>
            </CardContent>
          </Card>
          {prices && fin ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between"><CardTitle>{t.orders.payment}</CardTitle><PaymentBadge status={fin.payment_status} /></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="space-y-1 tabular">
                  <Row label="Amount (VAT-exclusive)" value={formatCentavos(fin.net_centavos)} />
                  <Row label="VAT" value={formatCentavos(fin.vat_centavos)} />
                  <Row label="Total" value={formatCentavos(fin.total_centavos)} strong />
                  <Row label="Paid so far" value={formatCentavos(fin.amount_paid_centavos)} />
                </dl>
                {payInfo ? (
                  <div className="rounded-lg bg-surface-muted p-3">
                    <p className="mb-2 flex items-center gap-2 font-semibold"><Landmark className="size-4" /> How to pay</p>
                    <ul className="space-y-2">
                      {payInfo.bank_accounts.map((b) => (
                        <li key={b.account_no}><p className="font-medium">{b.bank}</p><p className="text-muted-foreground">{b.account_name} · {b.account_no}</p></li>
                      ))}
                    </ul>
                    {payInfo.cheque_payee ? <p className="mt-2">Cheques payable to <b>{payInfo.cheque_payee}</b></p> : null}
                    {payInfo.notes ? <p className="mt-2 text-muted-foreground">{payInfo.notes}</p> : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "border-t pt-1 text-base font-bold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt><dd>{value}</dd>
    </div>
  );
}
