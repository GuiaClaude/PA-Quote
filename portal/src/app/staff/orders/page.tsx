import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { OrderStatusBadge, PaymentBadge } from "@/components/data/status-badge";
import { FilterChips } from "@/components/data/filter-chips";
import { Pager } from "@/components/data/pager";
import { formatCentavos } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { t } from "@/i18n";

const PAGE = 25;
const GROUPS: Record<string, string[]> = {
  open: ["submitted", "confirmed", "prepress", "waiting_for_revisions", "waiting_for_client_approval", "approved_for_print", "printing", "finishing", "quality_check", "ready_for_pickup", "out_for_delivery", "on_hold"],
  production: ["confirmed", "prepress", "approved_for_print", "printing", "finishing", "quality_check"],
  delivery: ["ready_for_pickup", "out_for_delivery"],
  done: ["delivered", "closed"],
};

export default async function StaffOrders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const prices = user.staffRole !== "pa_production";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const sb = await supabaseServer();

  let q = sb.from("orders")
    .select(`id, order_no, status, placed_at, requested_delivery_date, client_po_no, organizations(name), order_items(title)${prices ? `, order_financials${sp.payment ? "!inner" : ""}(total_centavos, payment_status)` : ""}`, { count: "exact" })
    .is("deleted_at", null);
  const status = sp.status && /^[a-z_]+$/.test(sp.status) ? sp.status : undefined;
  if (status) q = q.eq("status", status);
  else if (sp.group && GROUPS[sp.group]) q = q.in("status", GROUPS[sp.group]!);
  if (prices && sp.payment === "open") q = q.in("order_financials.payment_status", ["unpaid", "partially_paid"]);
  const search = (sp.q ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 30);
  if (search) q = q.ilike("order_no", `%${search}%`);
  const { data, count } = await q.order("placed_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;

  const chips = [
    { value: "", label: t.common.all },
    { value: "submitted", label: "New" },
    { value: "waiting_for_client_approval", label: "Waiting for client" },
    { value: "printing", label: "Printing" },
    { value: "on_hold", label: "On hold" },
    { value: "delivered", label: "Delivered" },
  ];

  return (
    <>
      <PageHeader title={t.orders.staffTitle} description="Confirming orders, updating status and recording payments arrive in Phase 6." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips options={chips} active={status} param="status" base="/staff/orders" />
        <form role="search"><input name="q" defaultValue={search} placeholder="Search order no." aria-label="Search order number"
          className="h-9 w-full rounded-lg border border-input bg-surface px-3 text-sm sm:w-56" /></form>
      </div>
      {rows.length === 0 ? <EmptyState Icon={PackageSearch} title="No orders match these filters." /> : (
        <Card>
          <Table>
            <THead><TR><TH>{t.orders.number}</TH><TH>Client</TH><TH className="hidden md:table-cell">{t.orders.items}</TH><TH>{t.orders.placed}</TH><TH className="hidden lg:table-cell">Needed by</TH><TH>{t.orders.status}</TH>{prices ? <TH className="text-right">{t.orders.total}</TH> : null}</TR></THead>
            <TBody>
              {rows.map((o) => {
                const fin = o.order_financials as { total_centavos: number; payment_status: string } | null;
                return (
                  <TR key={o.id as string}>
                    <TD><Link href={`/staff/orders/${o.id}`} className="font-semibold text-primary hover:underline">{o.order_no as string}</Link></TD>
                    <TD className="max-w-40 truncate">{(o.organizations as { name: string } | null)?.name}</TD>
                    <TD className="hidden max-w-64 truncate md:table-cell">{((o.order_items as { title: string }[]) ?? []).map((i) => i.title).join(", ")}</TD>
                    <TD className="whitespace-nowrap">{formatDate(o.placed_at as string)}</TD>
                    <TD className="hidden whitespace-nowrap lg:table-cell">{formatDate(o.requested_delivery_date as string | null)}</TD>
                    <TD><OrderStatusBadge status={o.status as string} audience="staff" /></TD>
                    {prices ? <TD className="text-right"><div className="tabular font-medium">{fin ? formatCentavos(fin.total_centavos) : "—"}</div>{fin ? <PaymentBadge status={fin.payment_status} /> : null}</TD> : null}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
      <Pager page={page} total={count ?? 0} size={PAGE} base={`/staff/orders${status ? `?status=${status}` : ""}`} />
    </>
  );
}
