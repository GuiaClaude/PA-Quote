import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ImageIcon } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { loadOrderTimeline, ATTACHMENT_URL_SECONDS } from "@/lib/data/order-timeline";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge, PaymentBadge } from "@/components/data/status-badge";
import { StatusTimeline } from "@/components/data/status-timeline";
import { AddFilesPanel, CancelButton, ConfirmPanel, PaymentsPanel, SavePricesButton, StatusPanel } from "@/components/orders/staff-order-panels";
import { formatCentavos, formatUnitPrice } from "@/lib/money";
import { formatDate, formatDateTime, manilaToday } from "@/lib/dates";
import { t } from "@/i18n";

export default async function StaffOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();
  const sb = await supabaseServer();
  const { data } = await sb.from("orders")
    .select(`id, order_no, status, kind, placed_at, confirmed_at, client_po_no, requested_delivery_date, delivery_address_snapshot, notes, organization_id, organizations(id, name),
      order_items(id, title, quantity, print_item_id, spec_snapshot)`)
    .eq("id", id).maybeSingle();
  if (!data) notFound();
  const o = data as unknown as { id: string; order_no: string; status: string; kind: string; placed_at: string; confirmed_at: string | null; client_po_no: string | null; requested_delivery_date: string | null;
    delivery_address_snapshot: { label?: string; line1?: string; city?: string; recipient?: string; phone?: string } | null; notes: string | null; organization_id: string;
    organizations: { id: string; name: string }; order_items: { id: string; title: string; quantity: number; print_item_id: string | null; spec_snapshot: Record<string, unknown> }[] };
  // Prices and payments are only readable by staff who manage this client (database rules) — production sees none.
  const [{ data: prices }, { data: fin }, { data: payments }, { data: slips }, events] = await Promise.all([
    sb.from("order_item_prices").select("order_item_id, unit_price, total_centavos").in("order_item_id", o.order_items.map((i) => i.id)),
    sb.from("order_financials").select("net_centavos, vat_centavos, total_centavos, amount_paid_centavos, payment_status").eq("order_id", id).maybeSingle(),
    sb.from("payments").select("id, method, reference_no, bank, amount_centavos, received_on, notes").eq("order_id", id).order("received_on"),
    sb.from("payment_slips").select("id, note, created_at, files(original_name, storage_path)").eq("order_id", id).order("created_at", { ascending: false }),
    loadOrderTimeline(sb, id),
  ]);
  const canManage = Boolean(fin);   // can read money ⇔ manages this client
  const priceOf = new Map((prices ?? []).map((p) => [p.order_item_id as string, p]));
  const slipRows = (slips ?? []) as unknown as { id: string; note: string | null; created_at: string; files: { original_name: string; storage_path: string } | null }[];
  const slipPaths = slipRows.map((s) => s.files?.storage_path).filter((p): p is string => Boolean(p));
  const { data: slipUrls } = slipPaths.length ? await sb.storage.from("attachments").createSignedUrls(slipPaths, ATTACHMENT_URL_SECONDS) : { data: [] };
  const slipUrl = new Map((slipUrls ?? []).map((s) => [s.path, s.signedUrl]));
  const addr = o.delivery_address_snapshot;
  const done = ["delivered", "closed"].includes(o.status);
  const active = !["cancelled", "closed"].includes(o.status);

  return (
    <>
      <Link href="/staff/orders" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{t.orders.staffTitle}</Link>
      <PageHeader title={o.order_no} breadcrumb={<Link className="hover:underline" href={`/staff/clients/${o.organizations.id}`}>{o.organizations.name}</Link>}
        description={`${o.kind === "reorder" ? "Reorder" : "New order"} · placed ${formatDateTime(o.placed_at)}${o.client_po_no ? ` · PO ${o.client_po_no}` : ""}`}
        actions={<>{fin ? <PaymentBadge status={fin.payment_status as string} /> : null}<OrderStatusBadge status={o.status} audience="staff" /></>} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          {o.status === "submitted" && canManage ? (
            <ConfirmPanel orderId={id} items={o.order_items.map((i) => ({ id: i.id, title: i.title, quantity: i.quantity, totalCentavos: priceOf.has(i.id) ? Number(priceOf.get(i.id)!.total_centavos) : null }))} />
          ) : null}
          {done && canManage && o.order_items.some((i) => i.print_item_id) ? <SavePricesButton orderId={id} /> : null}

          <Card>
            <CardHeader><CardTitle>{t.orders.items}</CardTitle></CardHeader>
            <CardContent><ul className="divide-y text-sm">{o.order_items.map((i) => {
              const p = priceOf.get(i.id);
              const spec = Object.entries(i.spec_snapshot ?? {}).filter(([k, v]) => v && k !== "notes" && (!Array.isArray(v) || v.length)).map(([, v]) => (Array.isArray(v) ? v.join(", ") : String(v))).join(" · ");
              return (
                <li key={i.id} className="flex justify-between gap-4 py-3">
                  <div className="min-w-0"><p className="font-medium">{i.print_item_id ? <Link className="hover:underline" href={`/staff/items/${i.print_item_id}`}>{i.title}</Link> : i.title}</p>
                    <p className="tabular text-muted-foreground">{i.quantity.toLocaleString("en-PH")} pcs{p ? ` × ${formatUnitPrice(p.unit_price as string)}` : ""}</p>
                    {spec ? <p className="truncate text-xs text-muted-foreground">{spec}</p> : null}</div>
                  {p ? <span className="tabular font-semibold">{formatCentavos(Number(p.total_centavos))}</span> : null}
                </li>
              );
            })}</ul></CardContent>
          </Card>

          <Card><CardHeader><CardTitle>Timeline</CardTitle></CardHeader><CardContent><StatusTimeline audience="staff" events={events} /></CardContent></Card>
        </div>

        <div className="space-y-6">
          {active && o.status !== "submitted" ? <StatusPanel orderId={id} organizationId={o.organization_id} status={o.status} /> : null}
          {o.status === "submitted" && !canManage ? <StatusPanel orderId={id} organizationId={o.organization_id} status={o.status} /> : null}
          {done ? <AddFilesPanel orderId={id} organizationId={o.organization_id} /> : null}

          {fin ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between"><CardTitle>{t.orders.payment}</CardTitle><PaymentBadge status={fin.payment_status as string} /></CardHeader>
              <CardContent className="space-y-4">
                <PaymentsPanel orderId={id} today={manilaToday()} canRecord={canManage} cancelled={o.status === "cancelled"}
                  totalCentavos={Number(fin.total_centavos)} paidCentavos={Number(fin.amount_paid_centavos)}
                  payments={(payments ?? []).map((p) => ({ id: p.id as string, method: p.method as string, reference: p.reference_no as string | null, bank: p.bank as string | null, amountCentavos: Number(p.amount_centavos), receivedOn: p.received_on as string, notes: p.notes as string | null }))} />
                {slipRows.length ? (
                  <div><p className="mb-2 text-sm font-semibold">Slips from the client</p>
                    <ul className="space-y-1 text-sm">{slipRows.map((s) => (
                      <li key={s.id} className="flex items-center gap-2"><ImageIcon className="size-4 text-muted-foreground" />
                        {s.files && slipUrl.get(s.files.storage_path) ? <a className="text-primary hover:underline" href={slipUrl.get(s.files.storage_path)!} target="_blank" rel="noopener noreferrer">{s.files.original_name}</a> : s.files?.original_name}
                        <span className="text-xs text-muted-foreground">{formatDateTime(s.created_at)}{s.note ? ` · ${s.note}` : ""}</span></li>
                    ))}</ul></div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader><CardTitle>Delivery</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{addr?.label ?? "—"}</p>
              {addr?.line1 ? <p>{addr.line1}{addr.city ? `, ${addr.city}` : ""}</p> : addr?.city ? <p>{addr.city}</p> : null}
              {addr?.recipient || addr?.phone ? <p className="text-muted-foreground">{[addr.recipient, addr.phone].filter(Boolean).join(" · ")}</p> : null}
              <p className="text-muted-foreground">Needed by: {formatDate(o.requested_delivery_date)}</p>
              {o.notes ? <p className="mt-2 whitespace-pre-line rounded-lg bg-surface-muted p-2">{o.notes}</p> : null}
            </CardContent>
          </Card>
          {canManage && active && o.status !== "submitted" && !done ? <div className="flex justify-end"><CancelButton orderId={id} staff /></div> : null}
          {user.staffRole === "pa_production" ? <p className="text-xs text-muted-foreground">Prices and payments are hidden for production.</p> : null}
        </div>
      </div>
    </>
  );
}
