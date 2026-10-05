import { Plus } from "lucide-react";
import { ListFilters } from "@/components/list-filters";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatDate, manilaToday } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";
import { APPROVAL, DOC_SHORT } from "@/lib/labels";
import { withUser } from "@/server/db";
import { canEdit, requireSession } from "@/server/session";

export const metadata = { title: "Bills" };

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const q = sp.q?.trim() ?? "";
  const today = manilaToday();
  const rows = await withUser(s, (tx) => tx<{ id: string; invoice_date: string; due_date: string; doc_type: string; reference_no: string | null; supplier: string; categories: string | null; total_c: number; input_vat_c: number; ewt_c: number; balance_c: number; approval_status: string; no_receipt: boolean }[]>`
    select p.id, p.invoice_date, p.due_date, p.doc_type, p.reference_no, su.name as supplier, p.total_c, p.input_vat_c, p.ewt_c, v.balance_c, p.approval_status, p.no_receipt,
           (select string_agg(distinct ec.name, ', ') from purchase_lines l join expense_categories ec on ec.id = l.category_id where l.purchase_id = p.id) as categories
    from purchases p join suppliers su on su.id = p.supplier_id join v_purchase_balances v on v.id = p.id
    where p.org_id = ${s.orgId} and p.deleted_at is null
      and (${q} = '' or su.name ilike ${"%" + q + "%"} or coalesce(p.reference_no, '') ilike ${"%" + q + "%"})
      and case ${status} when 'open' then v.balance_c > 0 when 'overdue' then v.balance_c > 0 and p.due_date < ${today} when 'paid' then v.balance_c = 0 else true end
    order by p.invoice_date desc, p.created_at desc limit 300`);
  const sum = (k: "total_c" | "input_vat_c" | "balance_c") => rows.reduce((a, r) => a + r[k], 0);
  return (
    <>
      <PageHeader title="Bills" description="Supplier invoices and receipts: expenses, input VAT and what is still unpaid." actions={canEdit(s) && <><ButtonLink variant="secondary" href="/payments/new">Pay bills</ButtonLink><ButtonLink href="/purchases/new"><Plus size={15} /> New bill</ButtonLink></>} />
      <Card>
        <ListFilters base="/purchases" active={status} q={q} tabs={[{ key: "all", label: "All" }, { key: "open", label: "Unpaid" }, { key: "overdue", label: "Overdue" }, { key: "paid", label: "Paid" }]} />
        {rows.length === 0 ? <EmptyState title="No bills match" /> : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Supplier</Th><Th>Document</Th><Th>Category</Th><Th>Due</Th><Th align="right">Total</Th><Th align="right">Input VAT</Th><Th align="right">Balance</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const overdue = r.balance_c > 0 && r.due_date < today;
                const st = r.balance_c === 0 ? APPROVAL.paid! : overdue ? { label: "Overdue", tone: "bad" as const } : APPROVAL[r.approval_status]!;
                return (
                  <tr key={r.id} className="hover:bg-surface-2/60">
                    <Td className="whitespace-nowrap">{formatDate(r.invoice_date)}</Td>
                    <Td className="font-medium">{r.supplier}</Td>
                    <Td className="whitespace-nowrap">{r.no_receipt ? <span className="text-muted">No receipt</span> : `${DOC_SHORT[r.doc_type]} ${r.reference_no ?? ""}`}</Td>
                    <Td className="text-ink-2">{r.categories}</Td>
                    <Td className="whitespace-nowrap">{formatDate(r.due_date)}</Td>
                    <Td align="right">{formatPeso(r.total_c)}</Td>
                    <Td align="right" className="text-ink-2">{r.input_vat_c ? formatPeso(r.input_vat_c) : "—"}</Td>
                    <Td align="right" className={r.balance_c ? "font-medium" : "text-muted"}>{formatPeso(r.balance_c)}</Td>
                    <Td><Badge tone={st.tone}>{st.label}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="bg-surface-2 font-semibold"><Td colSpan={5}>{rows.length} bill{rows.length === 1 ? "" : "s"}{rows.length === 300 ? " (first 300)" : ""}</Td><Td align="right">{formatPeso(sum("total_c"))}</Td><Td align="right">{formatPeso(sum("input_vat_c"))}</Td><Td align="right">{formatPeso(sum("balance_c"))}</Td><Td /></tr></tfoot>
          </Table>
        )}
      </Card>
    </>
  );
}
