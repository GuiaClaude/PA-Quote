import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { t } from "@/i18n";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff(["pa_admin", "pa_sales"]);
  const q = ((await searchParams).q ?? "").replace(/[%,()]/g, "").slice(0, 60);
  const sb = await supabaseServer();
  let query = sb.from("organizations")
    .select("id, name, is_active, created_at, staff_assignments(is_primary, profiles(full_name)), memberships(id, is_active), print_items(id), orders(id, status)")
    .is("deleted_at", null).order("name");
  if (q) query = query.ilike("name", `%${q}%`);
  const { data } = await query;
  const rows = (data ?? []) as unknown as Array<{ id: string; name: string; is_active: boolean; staff_assignments: { is_primary: boolean; profiles: { full_name: string } }[]; memberships: { is_active: boolean }[]; print_items: unknown[]; orders: { status: string }[] }>;

  return (
    <>
      <PageHeader title={t.clients.title} actions={<Button asChild><Link href="/staff/clients/new"><Plus />{t.clients.add}</Link></Button>} />
      <form role="search" className="mb-4"><input name="q" defaultValue={q} placeholder="Search clients" aria-label="Search clients" className="h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm sm:w-72" /></form>
      {rows.length === 0 ? (
        <EmptyState Icon={Building2} title={t.clients.empty} action={<Button asChild><Link href="/staff/clients/new"><Plus />{t.clients.add}</Link></Button>} />
      ) : (
        <Card><Table>
          <THead><TR><TH>Company</TH><TH>{t.clients.accountManager}</TH><TH className="text-right">Users</TH><TH className="text-right">Print Items</TH><TH className="text-right">Open orders</TH></TR></THead>
          <TBody>{rows.map((o) => (
            <TR key={o.id}>
              <TD><Link href={`/staff/clients/${o.id}`} className="font-semibold text-primary hover:underline">{o.name}</Link>{!o.is_active ? <Badge tone="neutral" className="ml-2">Inactive</Badge> : null}</TD>
              <TD>{o.staff_assignments.find((s) => s.is_primary)?.profiles?.full_name ?? <span className="text-warning">Not assigned</span>}</TD>
              <TD className="tabular text-right">{o.memberships.filter((m) => m.is_active).length}</TD>
              <TD className="tabular text-right">{o.print_items.length}</TD>
              <TD className="tabular text-right">{o.orders.filter((x) => !["delivered", "closed", "cancelled"].includes(x.status)).length}</TD>
            </TR>
          ))}</TBody>
        </Table></Card>
      )}
    </>
  );
}
