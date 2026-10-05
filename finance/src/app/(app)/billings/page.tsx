import Link from "next/link";
import { Plus } from "lucide-react";
import { ListFilters } from "@/components/list-filters";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatDate, manilaToday } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";
import { displayBillingStatus, DOC_SHORT } from "@/lib/labels";
import { withUser } from "@/server/db";
import { canEdit, requireSession } from "@/server/session";

export const metadata = { title: "Billings" };

type Row = { id: string; doc_type: string; doc_no: string; billing_date: string; due_date: string; status: string; gross_c: number; balance_c: number; client: string; client_id: string; ce_number: string | null };

export default async function BillingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const q = sp.q?.trim() ?? "";
  const today = manilaToday();
  const { rows, counts } = await withUser(s, async (tx) => {
    const like = `%${q}%`;
    const rows = await tx<Row[]>`
      select v.id, v.doc_type, v.doc_no, v.billing_date, v.due_date, v.status, v.gross_c, v.balance_c, c.name as client, c.id as client_id, p.ce_number
      from v_billing_balances v join clients c on c.id = v.client_id left join projects p on p.id = v.project_id
      where v.org_id = ${s.orgId}
        and (${q} = '' or c.name ilike ${like} or v.doc_no ilike ${like} or coalesce(p.ce_number, '') ilike ${like})
        and case ${status}
              when 'open' then v.balance_c > 0 and v.status not in ('void','rejected','draft')
              when 'overdue' then v.balance_c > 0 and v.due_date < ${today} and v.status not in ('void','rejected','draft')
              when 'paid' then v.status = 'paid'
              when 'draft' then v.status = 'draft'
              when 'void' then v.status in ('void','rejected')
              else true end
      order by v.billing_date desc, v.doc_no desc
      limit 300`;
    const [counts] = await tx<{ open: number; overdue: number }[]>`
      select count(*) filter (where balance_c > 0 and status not in ('void','rejected','draft'))::int as open,
             count(*) filter (where balance_c > 0 and due_date < ${today} and status not in ('void','rejected','draft'))::int as overdue
      from v_billing_balances where org_id = ${s.orgId}`;
    return { rows, counts: counts! };
  });
  const totalGross = rows.reduce((a, r) => a + r.gross_c, 0);
  const totalBal = rows.reduce((a, r) => a + (["void", "rejected", "draft"].includes(r.status) ? 0 : r.balance_c), 0);

  return (
    <>
      <PageHeader
        title="Billings"
        description="Sales invoices and billing statements, with what is still unpaid."
        actions={canEdit(s) && <ButtonLink href="/billings/new"><Plus size={15} /> New billing</ButtonLink>}
      />
      <Card>
        <ListFilters
          base="/billings"
          active={status}
          q={q}
          tabs={[
            { key: "all", label: "All" },
            { key: "open", label: "Unpaid", count: counts.open },
            { key: "overdue", label: "Overdue", count: counts.overdue },
            { key: "paid", label: "Paid" },
            { key: "draft", label: "Drafts" },
            { key: "void", label: "Void / rejected" },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState title="No billings match">Try another filter or search.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>Date</Th><Th>Document</Th><Th>Client</Th><Th>CE#</Th><Th>Due</Th><Th align="right">Amount</Th><Th align="right">Balance</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = displayBillingStatus(r.status, r.balance_c, r.due_date, today);
                return (
                  <tr key={r.id} className="hover:bg-surface-2/60">
                    <Td className="whitespace-nowrap">{formatDate(r.billing_date)}</Td>
                    <Td className="whitespace-nowrap"><Link href={`/billings/${r.id}`} className="font-medium text-brand-strong hover:underline">{DOC_SHORT[r.doc_type]} {r.doc_no}</Link></Td>
                    <Td><Link href={`/clients/${r.client_id}`} className="hover:underline">{r.client}</Link></Td>
                    <Td className="whitespace-nowrap text-ink-2">{r.ce_number ?? "—"}</Td>
                    <Td className="whitespace-nowrap">{formatDate(r.due_date)}</Td>
                    <Td align="right">{formatPeso(r.gross_c)}</Td>
                    <Td align="right" className={r.balance_c > 0 && !["void", "rejected", "draft"].includes(r.status) ? "font-medium" : "text-muted"}>
                      {["void", "rejected"].includes(r.status) ? "—" : formatPeso(r.balance_c)}
                    </Td>
                    <Td><Badge tone={st.tone}>{st.label}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <Td colSpan={5}>{rows.length} billing{rows.length === 1 ? "" : "s"}{rows.length === 300 ? " (first 300)" : ""}</Td>
                <Td align="right">{formatPeso(totalGross)}</Td>
                <Td align="right">{formatPeso(totalBal)}</Td>
                <Td />
              </tr>
            </tfoot>
          </Table>
        )}
      </Card>
    </>
  );
}
