import { Plus } from "lucide-react";
import { ListFilters } from "@/components/list-filters";
import { ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { manilaToday } from "@/lib/domain/dates";
import { formatPeso, formatRateBp } from "@/lib/domain/money";
import { formatTin } from "@/lib/domain/parties";
import { VAT_TREATMENT } from "@/lib/labels";
import { withUser } from "@/server/db";
import { canEdit, requireSession } from "@/server/session";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const status = sp.status ?? "all";
  const today = manilaToday();
  const rows = await withUser(s, (tx) => tx<{ id: string; name: string; tin: string | null; tin_branch: string | null; terms_days: number; vat_status: string; ewt_rate_bp: number; category: string | null; spend_12m: number; open_c: number; overdue_c: number }[]>`
    select su.id, su.name, su.tin, su.tin_branch, su.terms_days, su.vat_status, su.ewt_rate_bp, ec.name as category,
           coalesce(sum(v.total_c) filter (where v.invoice_date > ${today}::date - 365), 0)::bigint as spend_12m,
           coalesce(sum(v.balance_c), 0)::bigint as open_c,
           coalesce(sum(v.balance_c) filter (where v.due_date < ${today}), 0)::bigint as overdue_c
    from suppliers su left join expense_categories ec on ec.id = su.default_category_id left join v_purchase_balances v on v.supplier_id = su.id
    where su.org_id = ${s.orgId} and su.deleted_at is null and (${q} = '' or su.name ilike ${"%" + q + "%"})
    group by su.id, ec.name order by su.name`);
  const list = status === "owing" ? rows.filter((r) => r.open_c > 0) : rows;
  return (
    <>
      <PageHeader title="Suppliers" description="Who we buy from, what we owe them, and their tax details." actions={canEdit(s) && <ButtonLink href="/suppliers/new"><Plus size={15} /> New supplier</ButtonLink>} />
      <Card>
        <ListFilters base="/suppliers" active={status} q={q} tabs={[{ key: "all", label: "All", count: rows.length }, { key: "owing", label: "We owe", count: rows.filter((r) => r.open_c > 0).length }]} />
        {list.length === 0 ? <EmptyState title="No suppliers match" /> : (
          <Table>
            <thead><tr><Th>Name</Th><Th>TIN</Th><Th>VAT</Th><Th>Usual category</Th><Th>Terms</Th><Th>EWT</Th><Th align="right">Spend (12 mo.)</Th><Th align="right">Unpaid</Th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="num whitespace-nowrap text-ink-2">{r.tin ? formatTin(r.tin, r.tin_branch) : "—"}</Td>
                  <Td className="whitespace-nowrap">{VAT_TREATMENT[r.vat_status]}</Td>
                  <Td className="text-ink-2">{r.category ?? "—"}</Td>
                  <Td className="whitespace-nowrap">{r.terms_days ? `${r.terms_days} days` : "COD"}</Td>
                  <Td>{r.ewt_rate_bp ? formatRateBp(r.ewt_rate_bp) : "—"}</Td>
                  <Td align="right">{formatPeso(r.spend_12m)}</Td>
                  <Td align="right" className={r.overdue_c ? "font-medium text-bad" : r.open_c ? "font-medium" : "text-muted"}>{formatPeso(r.open_c)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
