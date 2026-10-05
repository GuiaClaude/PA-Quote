import Link from "next/link";
import { Plus } from "lucide-react";
import { ListFilters } from "@/components/list-filters";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";
import { COLLECTION_MODES, DOC_SHORT, FORM_2307 } from "@/lib/labels";
import { withUser } from "@/server/db";
import { canEdit, requireSession } from "@/server/session";

export const metadata = { title: "Collections" };

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const q = sp.q?.trim() ?? "";
  const { rows, pending2307 } = await withUser(s, async (tx) => {
    const like = `%${q}%`;
    const rows = await tx<{ id: string; collection_date: string; receipt_type: string; receipt_no: string | null; payment_mode: string; cash_c: number; cwt_c: number; form_2307_status: string; client: string; client_id: string; bank: string; billings: string | null }[]>`
      select c.id, c.collection_date, c.receipt_type, c.receipt_no, c.payment_mode, c.cash_c, c.cwt_c, c.form_2307_status, cl.name as client, cl.id as client_id, b.name as bank,
             (select string_agg(bi.doc_no, ', ' order by bi.doc_no) from collection_allocations a join billings bi on bi.id = a.billing_id where a.collection_id = c.id) as billings
      from collections c join clients cl on cl.id = c.client_id join bank_accounts b on b.id = c.deposit_account_id
      where c.org_id = ${s.orgId} and c.deleted_at is null
        and (${q} = '' or cl.name ilike ${like} or coalesce(c.receipt_no, '') ilike ${like})
        and (${status} = 'all' or (${status} = '2307' and c.form_2307_status in ('pending', 'for_revision')))
      order by c.collection_date desc, c.created_at desc limit 300`;
    const [p] = await tx<{ n: number; amount: number }[]>`
      select count(*)::int as n, coalesce(sum(cwt_c), 0)::bigint as amount from collections where org_id = ${s.orgId} and deleted_at is null and form_2307_status in ('pending','for_revision')`;
    return { rows, pending2307: p! };
  });
  const total = rows.reduce((a, r) => a + r.cash_c, 0);
  const totalCwt = rows.reduce((a, r) => a + r.cwt_c, 0);
  return (
    <>
      <PageHeader
        title="Collections"
        description="Payments received from clients, with tax withheld (CWT) and BIR Form 2307 status."
        actions={canEdit(s) && <ButtonLink href="/collections/new"><Plus size={15} /> Receive payment</ButtonLink>}
      />
      <Card>
        <ListFilters base="/collections" active={status} q={q} tabs={[{ key: "all", label: "All" }, { key: "2307", label: "Missing 2307", count: pending2307.n }]} />
        {status === "2307" && pending2307.n > 0 && (
          <p className="border-b border-line bg-warn-soft px-4 py-2 text-[13px] text-warn">
            {formatPeso(pending2307.amount)} of tax credits are waiting on BIR Form 2307 from clients. Without the 2307 the credit can't be claimed.
          </p>
        )}
        {rows.length === 0 ? (
          <EmptyState title="No collections match" />
        ) : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Client</Th><Th>Receipt</Th><Th>For billings</Th><Th>Mode</Th><Th>Deposited to</Th><Th align="right">Cash</Th><Th align="right">CWT</Th><Th>2307</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <Td className="whitespace-nowrap">{formatDate(r.collection_date)}</Td>
                  <Td><Link href={`/clients/${r.client_id}`} className="font-medium hover:underline">{r.client}</Link></Td>
                  <Td className="whitespace-nowrap">{DOC_SHORT[r.receipt_type]} {r.receipt_no ?? "—"}</Td>
                  <Td className="text-ink-2">{r.billings ?? "Advance"}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{COLLECTION_MODES[r.payment_mode]}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{r.bank}</Td>
                  <Td align="right" className="font-medium">{formatPeso(r.cash_c)}</Td>
                  <Td align="right">{r.cwt_c ? formatPeso(r.cwt_c) : "—"}</Td>
                  <Td>{r.cwt_c > 0 ? <Badge tone={FORM_2307[r.form_2307_status]!.tone}>{FORM_2307[r.form_2307_status]!.label}</Badge> : <span className="text-muted">—</span>}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold"><Td colSpan={6}>{rows.length} payment{rows.length === 1 ? "" : "s"}</Td><Td align="right">{formatPeso(total)}</Td><Td align="right">{formatPeso(totalCwt)}</Td><Td /></tr>
            </tfoot>
          </Table>
        )}
      </Card>
    </>
  );
}
