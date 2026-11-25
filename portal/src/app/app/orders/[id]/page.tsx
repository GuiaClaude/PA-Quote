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
import { Alert } from "@/components/ui/alert";
import { loadOrderTimeline } from "@/lib/data/order-timeline";
import { canOrder } from "@/lib/auth/roles";
import { CancelButton } from "@/components/orders/staff-order-panels";
import { PaymentSlipUpload } from "@/components/orders/payment-slip-upload";
import { OrderProgress } from "@/components/orders/order-progress";
import { t } from "@/i18n";

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { id } = await params;
  const placed = (await searchParams).placed;
  const user = await requireClient();
  const prices = canSeePrices(user);
  const sb = await supabaseServer();
  const { data: order } = await sb.from("orders")
    .select(`id, order_no, status, placed_at, client_po_no, requested_delivery_date, delivery_address_snapshot, notes,
      order_items(id, title, quantity, print_item_id${prices ? ", order_item_prices(unit_price, total_centavos)" : ""}),
      organization_id${prices ? ", order_financials(net_centavos, vat_centavos, total_centavos, amount_paid_centavos, payment_status), payments(id, method, reference_no, amount_centavos, received_on), payment_slips(id, created_at, note)" : ""}`)
    .eq("id", id).maybeSingle();
  if (!order) notFound();
  const o = order as unknown as Record<string, unknown>;
  const fin = o.order_financials as { net_centavos: number; vat_centavos: number; total_centavos: number; amount_paid_centavos: number; payment_status: string } | null;
  const items = (o.order_items as Array<{ id: string; title: string; quantity: number; print_item_id: string | null; order_item_prices?: { unit_price: string; total_centavos: number } | null }>) ?? [];
  const events = await loadOrderTimeline(sb, id);
  const payments = ((o.payments as Array<{ id: string; method: string; reference_no: string | null; amount_centavos: number; received_on: string }>) ?? []).sort((a, b) => a.received_on.localeCompare(b.received_on));
  const slips = (o.payment_slips as Array<{ id: string; created_at: string; note: string | null }>) ?? [];
  const status = o.status as string;
  const canAct = canOrder(user.clientRole);
  const payInfo = prices ? await getSetting("payment_instructions") : null;
  const address = o.delivery_address_snapshot as { label?: string; city?: string } | null;

  return (
    <>
      <Link href="/app/orders" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{t.orders.title}</Link>
      <PageHeader title={o.order_no as string} description={`Placed ${formatDate(o.placed_at as string)}${o.client_po_no ? ` · PO ${o.client_po_no}` : ""}`}
        actions={<OrderStatusBadge status={o.status as string} />} />
      <OrderProgress status={status} />
      {placed ? <Alert tone="success" className="mb-4"><b>Thank you — your order {o.order_no as string} is in.</b> Your account manager has been notified. Payment instructions are below.</Alert> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t.orders.items}</CardTitle></CardHeader>
            <CardContent>
              <ul className="divide-y">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div><p className="font-medium">{i.title}</p>{i.print_item_id && user.clientRole !== "client_viewer" ? <Link className="text-xs font-medium text-primary hover:underline" href={`/app/items/${i.print_item_id}/review?order=${o.id}`}>Review artwork</Link> : null}<p className="text-muted-foreground tabular">{i.quantity.toLocaleString("en-PH")} pcs{prices && i.order_item_prices ? ` × ${formatUnitPrice(i.order_item_prices.unit_price)}` : ""}</p></div>
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
          {canAct && status === "submitted" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <span className="text-muted-foreground">Need to cancel? You can until Print Amplified confirms the order.</span>
              <CancelButton orderId={id} />
            </div>
          ) : null}
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
                  {fin.payment_status !== "paid" ? <Row label="Balance" value={formatCentavos(Math.max(0, Number(fin.total_centavos) - Number(fin.amount_paid_centavos)))} strong /> : null}
                </dl>
                {payments.length ? (
                  <ul className="divide-y rounded-lg border">{payments.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 p-2"><span>{p.method === "cheque" ? "Cheque" : "Bank transfer"} {p.reference_no}<span className="block text-xs text-muted-foreground">Received {formatDate(p.received_on)}</span></span><span className="tabular font-medium">{formatCentavos(Number(p.amount_centavos))}</span></li>
                  ))}</ul>
                ) : null}
                {slips.length ? <p className="text-xs text-muted-foreground">You sent {slips.length} slip photo{slips.length === 1 ? "" : "s"} (last {formatDate(slips[0]!.created_at)}). Payments appear above once Print Amplified checks them.</p> : null}
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
                {canAct && fin.payment_status !== "paid" && status !== "cancelled" ? <PaymentSlipUpload orderId={id} organizationId={o.organization_id as string} /> : null}
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
