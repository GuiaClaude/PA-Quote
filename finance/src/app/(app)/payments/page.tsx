import { ListFilters } from "@/components/list-filters";
import { ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";
import { AP_MODES } from "@/lib/labels";
import { withUser } from "@/server/db";
import { canEdit, requireSession } from "@/server/session";

export const metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const rows = await withUser(s, (tx) => tx<{ id: string; payment_date: string; supplier: string; payment_mode: string; account: string; reference_no: string | null; amount_c: number; bills: string | null }[]>`
    select p.id, p.payment_date, su.name as supplier, p.payment_mode, b.name as account, p.reference_no, p.amount_c,
           (select string_agg(coalesce(pu.reference_no, 'no ref'), ', ') from ap_payment_allocations a join purchases pu on pu.id = a.purchase_id where a.ap_payment_id = p.id) as bills
    from ap_payments p join suppliers su on su.id = p.supplier_id join bank_accounts b on b.id = p.paid_from_account_id
    where p.org_id = ${s.orgId} and p.deleted_at is null and (${q} = '' or su.name ilike ${"%" + q + "%"} or coalesce(p.reference_no, '') ilike ${"%" + q + "%"})
    order by p.payment_date desc, p.created_at desc limit 300`);
  return (
    <>
      <PageHeader title="Payments" description="Money paid to suppliers (BizLink, Spenmo, GCash, cheque, cash)." actions={canEdit(s) && <ButtonLink href="/payments/new">Pay bills</ButtonLink>} />
      <Card>
        <ListFilters base="/payments" active="all" q={q} tabs={[{ key: "all", label: "All payments" }]} />
        {rows.length === 0 ? <EmptyState title="No payments match" /> : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Supplier</Th><Th>Mode</Th><Th>Paid from</Th><Th>Reference</Th><Th>For bills</Th><Th align="right">Amount</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <Td className="whitespace-nowrap">{formatDate(r.payment_date)}</Td>
                  <Td className="font-medium">{r.supplier}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{AP_MODES[r.payment_mode]}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{r.account}</Td>
                  <Td className="text-ink-2">{r.reference_no ?? "—"}</Td>
                  <Td className="text-ink-2">{r.bills ?? "Advance"}</Td>
                  <Td align="right" className="font-medium">{formatPeso(r.amount_c)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-surface-2 font-semibold"><Td colSpan={6}>{rows.length} payments</Td><Td align="right">{formatPeso(rows.reduce((a, r) => a + r.amount_c, 0))}</Td></tr></tfoot>
          </Table>
        )}
      </Card>
    </>
  );
}
