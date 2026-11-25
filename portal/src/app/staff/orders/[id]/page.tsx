import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { PhaseNotice } from "@/components/layout/phase-notice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge, PaymentBadge } from "@/components/data/status-badge";
import { StatusTimeline } from "@/components/data/status-timeline";
import { formatCentavos, formatUnitPrice } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { t } from "@/i18n";

export default async function StaffOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();
  const prices = user.staffRole !== "pa_production";
  const sb = await supabaseServer();
  const { data } = await sb.from("orders")
    .select(`id, order_no, status, kind, placed_at, client_po_no, requested_delivery_date, delivery_address_snapshot, notes, organizations(id, name),
      order_items(id, title, quantity, spec_snapshot${prices ? ", order_item_prices(unit_price, total_centavos)" : ""}),
      order_status_events(id, to_status, note, created_at)${prices ? ", order_financials(total_centavos, amount_paid_centavos, payment_status), payments(id, method, reference_no, bank, amount_centavos, received_on)" : ""}`)
    .eq("id", id).maybeSingle();
  if (!data) notFound();
  const o = data as unknown as Record<string, unknown>;
  const org = o.organizations as { id: string; name: string };
  const fin = o.order_financials as { total_centavos: number; amount_paid_centavos: number; payment_status: string } | null;
  const items = (o.order_items as Array<{ id: string; title: string; quantity: number; order_item_prices?: { unit_price: string; total_centavos: number } | null }>) ?? [];
  const payments = (o.payments as Array<{ id: string; method: string; reference_no: string | null; bank: string | null; amount_centavos: number; received_on: string }>) ?? [];

  return (
    <>
      <Link href="/staff/orders" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{t.orders.staffTitle}</Link>
      <PageHeader title={o.order_no as string} breadcrumb={org.name} description={`${o.kind === "reorder" ? "Reorder" : "New order"} · placed ${formatDate(o.placed_at as string)}${o.client_po_no ? ` · PO ${o.client_po_no}` : ""}`}
        actions={<OrderStatusBadge status={o.status as string} audience="staff" />} />
      <PhaseNotice phase={6}>Status updates, production photos, delivery receipts and payment recording will be added here.</PhaseNotice>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader><CardTitle>{t.orders.items}</CardTitle></CardHeader>
          <CardContent><ul className="divide-y text-sm">{items.map((i) => (
            <li key={i.id} className="flex justify-between gap-4 py-3"><div><p className="font-medium">{i.title}</p><p className="tabular text-muted-foreground">{i.quantity.toLocaleString("en-PH")} pcs{prices && i.order_item_prices ? ` × ${formatUnitPrice(i.order_item_prices.unit_price)}` : ""}</p></div>{prices && i.order_item_prices ? <span className="tabular font-semibold">{formatCentavos(i.order_item_prices.total_centavos)}</span> : null}</li>
          ))}</ul></CardContent>
        </Card>
        <div className="space-y-6">
          <Card><CardHeader><CardTitle>Timeline</CardTitle></CardHeader><CardContent><StatusTimeline audience="staff" events={(o.order_status_events as Array<{ id: string; to_status: string; note: string | null; created_at: string }>) ?? []} /></CardContent></Card>
          {prices && fin ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between"><CardTitle>{t.orders.payment}</CardTitle><PaymentBadge status={fin.payment_status} /></CardHeader>
              <CardContent className="space-y-2 text-sm tabular">
                <p className="flex justify-between"><span className="text-muted-foreground">Total</span><b>{formatCentavos(fin.total_centavos)}</b></p>
                <p className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{formatCentavos(fin.amount_paid_centavos)}</span></p>
                <ul className="divide-y border-t pt-1">{payments.map((p) => (
                  <li key={p.id} className="flex justify-between py-2"><span>{p.method === "cheque" ? "Cheque" : "Bank transfer"} {p.reference_no} · {formatDate(p.received_on)}</span><span>{formatCentavos(p.amount_centavos)}</span></li>
                ))}</ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
