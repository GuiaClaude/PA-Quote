import Link from "next/link";
import {
  AlertTriangle, FileClock, FileText, Inbox, PenLine, Send, Wallet, Zap, Printer, PauseCircle, Truck, FileCheck2,
} from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/data/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { OrderStatusBadge, ORDER_STATUS_META } from "@/components/data/status-badge";
import { formatCentavos } from "@/lib/money";
import { formatDuration, formatDate, requestTimeMs } from "@/lib/dates";
import { t } from "@/i18n";

const PRODUCTION = ["confirmed", "prepress", "approved_for_print", "printing", "finishing", "quality_check"];

function manilaMidnightIso(): string {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now);
  return new Date(`${ymd}T00:00:00+08:00`).toISOString();
}

type QueueItem = { key: string; href: string; title: string; subtitle: string; dueAt: string | null; kind: string; tone: "danger" | "warning" | "info" | "brand" };

export default async function StaffDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const sb = await supabaseServer();
  const priceStaff = user.staffRole !== "pa_production";
  const now = requestTimeMs();

  const [ordersRes, qrRes, quotesSent, revisions, unpaid, instantToday] = await Promise.all([
    sb.from("orders").select("id, order_no, status, placed_at, requested_delivery_date, organizations(name), order_items(title)")
      .is("deleted_at", null).not("status", "in", "(closed,cancelled)").order("placed_at", { ascending: true }).limit(500),
    priceStaff
      ? sb.from("quote_requests").select("id, request_no, title, submitted_at, reply_due_at, needs_quote_reasons, organizations(name)")
          .eq("status", "submitted").is("deleted_at", null).order("submitted_at", { ascending: true }).limit(200)
      : Promise.resolve({ data: [] as never[] }),
    priceStaff ? sb.from("quotes").select("id", { count: "exact", head: true }).eq("status", "sent") : Promise.resolve({ count: 0 }),
    sb.from("revision_requests").select("id, round_no, submitted_at, print_items(name), organizations(name)")
      .in("status", ["open", "in_prepress"]).order("submitted_at").limit(100),
    priceStaff
      ? sb.from("order_financials").select("total_centavos, amount_paid_centavos, orders!inner(status)")
          .in("payment_status", ["unpaid", "partially_paid"]).neq("orders.status", "cancelled").limit(1000)
      : Promise.resolve({ data: [] as never[] }),
    priceStaff
      ? sb.from("instant_quotes").select("id", { count: "exact", head: true }).gte("created_at", manilaMidnightIso()).in("status", ["offered", "accepted"])
      : Promise.resolve({ count: 0 }),
  ]);

  const orders = (ordersRes.data ?? []) as unknown as Array<{
    id: string; order_no: string; status: string; placed_at: string; requested_delivery_date: string | null;
    organizations: { name: string } | null; order_items: { title: string }[];
  }>;
  const quoteRequests = (qrRes.data ?? []) as unknown as Array<{
    id: string; request_no: string; title: string; submitted_at: string; reply_due_at: string | null; needs_quote_reasons: string[]; organizations: { name: string } | null;
  }>;
  const openRevisions = (revisions.data ?? []) as unknown as Array<{ id: string; round_no: number; submitted_at: string; print_items: { name: string } | null; organizations: { name: string } | null }>;
  const unpaidRows = (unpaid.data ?? []) as unknown as Array<{ total_centavos: number; amount_paid_centavos: number }>;

  const newOrders = orders.filter((o) => o.status === "submitted");
  const needsQuote = quoteRequests.filter((q) => q.needs_quote_reasons?.length);
  const oldestQr = quoteRequests[0];
  const overdueQr = quoteRequests.filter((q) => q.reply_due_at && new Date(q.reply_due_at).getTime() < now).length;
  const outstanding = unpaidRows.reduce((s, r) => s + (Number(r.total_centavos) - Number(r.amount_paid_centavos)), 0);
  const reasonCounts = new Map<string, number>();
  for (const q of needsQuote) for (const r of q.needs_quote_reasons) reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);

  const byStatus = new Map<string, number>();
  for (const o of orders) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);

  // ------- work queue: most urgent first
  const queue: QueueItem[] = [];
  for (const q of quoteRequests) {
    const overdue = q.reply_due_at ? new Date(q.reply_due_at).getTime() < now : false;
    queue.push({
      key: `q-${q.id}`, href: `/staff/quotes`, kind: q.needs_quote_reasons?.length ? t.staffDash.needsQuote : "Quote request",
      title: `${q.organizations?.name ?? ""} · ${q.title}`,
      subtitle: q.needs_quote_reasons?.map((r) => t.staffDash.reasons[r] ?? r).join(", ") || `Waiting ${formatDuration(now - new Date(q.submitted_at).getTime())}`,
      dueAt: q.reply_due_at, tone: overdue ? "danger" : "warning",
    });
  }
  for (const o of newOrders) {
    queue.push({
      key: `o-${o.id}`, href: `/staff/orders/${o.id}`, kind: "Confirm order", title: `${o.organizations?.name ?? ""} · ${o.order_no}`,
      subtitle: o.order_items.map((i) => i.title).join(", "), dueAt: new Date(new Date(o.placed_at).getTime() + 4 * 3_600_000).toISOString(), tone: "info",
    });
  }
  for (const r of openRevisions) {
    queue.push({
      key: `r-${r.id}`, href: `/staff/revisions/${r.id}`, kind: `Revision · round ${r.round_no}`, title: `${r.organizations?.name ?? ""} · ${r.print_items?.name ?? ""}`,
      subtitle: `Waiting ${formatDuration(now - new Date(r.submitted_at).getTime())}`, dueAt: new Date(new Date(r.submitted_at).getTime() + 24 * 3_600_000).toISOString(), tone: "brand",
    });
  }
  if (!priceStaff) {
    for (const o of orders.filter((o) => PRODUCTION.includes(o.status))) {
      queue.push({
        key: `p-${o.id}`, href: `/staff/orders/${o.id}`, kind: (t.status as Record<string, string>)[o.status] ?? o.status,
        title: `${o.organizations?.name ?? ""} · ${o.order_no}`, subtitle: o.order_items.map((i) => i.title).join(", "),
        dueAt: o.requested_delivery_date ? `${o.requested_delivery_date}T17:00:00+08:00` : null, tone: "brand",
      });
    }
  }
  queue.sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));

  return (
    <>
      {sp.denied ? <Alert tone="warning" className="mb-4">{t.common.forbidden}</Alert> : null}
      <PageHeader title={`${t.home.greeting(user.fullName)}`} description={t.staffDash.subtitle} />

      {priceStaff ? (
        <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label={t.staffDash.newOrders} value={newOrders.length} Icon={Inbox} tone="info" href="/staff/orders?status=submitted"
            hint={newOrders[0] ? t.staffDash.oldestWaiting(formatDuration(now - new Date(newOrders[0].placed_at).getTime())) : undefined} />
          <KpiCard label={t.staffDash.quotesWaiting} value={quoteRequests.length} Icon={FileClock} tone={overdueQr ? "danger" : "warning"} urgent={overdueQr > 0}
            href="/staff/quotes" hint={overdueQr ? `${overdueQr} ${t.staffDash.overdue.toLowerCase()}` : oldestQr ? t.staffDash.oldestWaiting(formatDuration(now - new Date(oldestQr.submitted_at).getTime())) : undefined} />
          <KpiCard label={t.staffDash.needsQuote} value={needsQuote.length} Icon={AlertTriangle} tone="accent" href="/staff/quotes?needs=1"
            hint={[...reasonCounts.entries()].map(([r, n]) => `${t.staffDash.reasons[r] ?? r} (${n})`).join(" · ") || undefined} />
          <KpiCard label={t.staffDash.quotesSent} value={quotesSent.count ?? 0} Icon={Send} tone="brand" href="/staff/quotes?status=sent" />
          <KpiCard label={t.staffDash.unpaid} value={unpaidRows.length} Icon={Wallet} tone="danger" href="/staff/orders?payment=open"
            hint={outstanding > 0 ? `${formatCentavos(outstanding)} outstanding` : undefined} />
          <KpiCard label={t.staffDash.instantToday} value={instantToday.count ?? 0} Icon={Zap} tone="success" href="/staff/quotes?instant=today" />
        </section>
      ) : (
        <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Approved, waiting to print" value={byStatus.get("approved_for_print") ?? 0} Icon={FileCheck2} href="/staff/orders?status=approved_for_print" />
          <KpiCard label="In production" value={PRODUCTION.reduce((s, k) => s + (byStatus.get(k) ?? 0), 0)} Icon={Printer} href="/staff/orders?group=production" />
          <KpiCard label="Ready / out for delivery" value={(byStatus.get("ready_for_pickup") ?? 0) + (byStatus.get("out_for_delivery") ?? 0)} Icon={Truck} tone="success" href="/staff/orders?group=delivery" />
          <KpiCard label="On hold" value={byStatus.get("on_hold") ?? 0} Icon={PauseCircle} tone="danger" href="/staff/orders?status=on_hold" />
        </section>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t.staffDash.workQueue}</CardTitle>
            <Badge>{queue.length}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {queue.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">{t.staffDash.workQueueEmpty}</p> : (
              <ul className="divide-y">
                {queue.slice(0, 12).map((q) => {
                  const ms = q.dueAt ? new Date(q.dueAt).getTime() - now : null;
                  return (
                    <li key={q.key}>
                      <Link href={q.href} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-muted">
                        <span className="w-32 shrink-0"><Badge tone={q.tone}>{q.kind}</Badge></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{q.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{q.subtitle}</span>
                        </span>
                        {ms !== null ? (
                          <span className={`shrink-0 text-xs font-semibold ${ms < 0 ? "text-danger" : "text-muted-foreground"}`}>
                            {ms < 0 ? `${t.staffDash.overdue} ${formatDuration(-ms)}` : t.staffDash.dueIn(formatDuration(ms))}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t.staffDash.byStatus}</CardTitle></CardHeader>
            <CardContent>
              <StatusBars counts={byStatus} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><PenLine className="size-4" />{t.staffDash.openRevisions}</CardTitle></CardHeader>
            <CardContent>
              {openRevisions.length === 0 ? <p className="text-sm text-muted-foreground">None open.</p> : (
                <ul className="space-y-2 text-sm">
                  {openRevisions.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex justify-between gap-2"><span className="truncate">{r.print_items?.name}</span><span className="text-muted-foreground">{formatDate(r.submitted_at)}</span></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {priceStaff && newOrders.length ? (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-4" />Latest orders</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {newOrders.slice(-4).reverse().map((o) => (
                  <Link key={o.id} href={`/staff/orders/${o.id}`} className="flex items-center justify-between gap-2 text-sm hover:underline">
                    <span className="truncate">{o.order_no} · {o.organizations?.name}</span><OrderStatusBadge status={o.status} audience="staff" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function StatusBars({ counts }: { counts: Map<string, number> }) {
  const rows = Object.keys(ORDER_STATUS_META).filter((s) => counts.get(s));
  const max = Math.max(1, ...rows.map((s) => counts.get(s) ?? 0));
  if (!rows.length) return <p className="text-sm text-muted-foreground">No open orders.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((s) => {
        const n = counts.get(s) ?? 0;
        return (
          <li key={s}>
            <Link href={`/staff/orders?status=${s}`} className="group block">
              <div className="mb-1 flex justify-between text-xs"><span className="font-medium group-hover:underline">{s === "waiting_for_client_approval" ? "Waiting for Client Approval" : (t.status as Record<string, string>)[s]}</span><span className="tabular text-muted-foreground">{n}</span></div>
              <div className="h-2 rounded-full bg-surface-muted" aria-hidden><div className="h-2 rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} /></div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
