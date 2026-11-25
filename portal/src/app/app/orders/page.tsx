import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { canSeePrices } from "@/lib/auth/roles";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge, PaymentBadge } from "@/components/data/status-badge";
import { formatCentavos } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Pager } from "@/components/data/pager";
import { t } from "@/i18n";

const PAGE = 20;

export default async function MyOrders({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireClient();
  const prices = canSeePrices(user);
  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1);
  const sb = await supabaseServer();
  const { data: orders, count } = await sb.from("orders")
    .select(`id, order_no, status, placed_at, client_po_no, order_items(title)${prices ? ", order_financials(total_centavos, payment_status)" : ""}`, { count: "exact" })
    .is("deleted_at", null).order("placed_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);

  return (
    <>
      <PageHeader title={t.orders.title} actions={<Button asChild variant="outline"><Link href="/app/quotes">Quotes</Link></Button>} />
      {(orders ?? []).length === 0 ? (
        <EmptyState Icon={PackageSearch} title={t.orders.empty} action={<Button asChild><Link href="/app/order">{t.home.newOrder}</Link></Button>} />
      ) : (
        <Card>
          <ul className="divide-y">
            {(orders as unknown as Array<Record<string, unknown>>).map((o) => {
              const fin = o.order_financials as { total_centavos: number; payment_status: string } | null;
              const titles = ((o.order_items as { title: string }[]) ?? []).map((i) => i.title);
              return (
                <li key={o.id as string}>
                  <Link href={`/app/orders/${o.id}`} className="grid gap-2 px-4 py-3 hover:bg-surface-muted sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{titles.join(", ") || "Order"}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.order_no as string} · {formatDate(o.placed_at as string)}{o.client_po_no ? ` · PO ${o.client_po_no as string}` : ""}
                      </p>
                    </div>
                    {prices && fin ? (
                      <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                        <span className="tabular text-sm font-semibold">{formatCentavos(fin.total_centavos)}</span>
                        <PaymentBadge status={fin.payment_status} />
                      </div>
                    ) : <span />}
                    <OrderStatusBadge status={o.status as string} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Pager page={page} total={count ?? 0} size={PAGE} base="/app/orders" />
    </>
  );
}
