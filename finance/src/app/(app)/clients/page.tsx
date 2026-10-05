import Link from "next/link";
import { Plus } from "lucide-react";
import { MergeButton } from "@/components/forms/party-form";
import { ListFilters } from "@/components/list-filters";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { manilaToday } from "@/lib/domain/dates";
import { formatPeso, formatRateBp } from "@/lib/domain/money";
import { findDuplicateCandidates, formatTin } from "@/lib/domain/parties";
import { withUser } from "@/server/db";
import { canEdit, requireSession } from "@/server/session";

export const metadata = { title: "Clients" };

type C = { id: string; name: string; tin: string | null; tin_branch: string | null; terms_days: number; cwt_rate_bp: number; vat_status: string; open_c: number; overdue_c: number; sales_12m: number; billings: number };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const status = sp.status ?? "all";
  const today = manilaToday();
  const rows = await withUser(s, (tx) => tx<C[]>`
    select c.id, c.name, c.tin, c.tin_branch, c.terms_days, c.cwt_rate_bp, c.vat_status,
           coalesce(sum(v.balance_c) filter (where v.status not in ('void','rejected','draft')), 0)::bigint as open_c,
           coalesce(sum(v.balance_c) filter (where v.status not in ('void','rejected','draft') and v.due_date < ${today}), 0)::bigint as overdue_c,
           coalesce(sum(v.net_c) filter (where v.status not in ('void','rejected','draft') and v.billing_date > ${today}::date - 365), 0)::bigint as sales_12m,
           count(v.id)::int as billings
    from clients c left join v_billing_balances v on v.client_id = c.id
    where c.org_id = ${s.orgId} and c.deleted_at is null and (${q} = '' or c.name ilike ${"%" + q + "%"} or coalesce(c.tin, '') like ${"%" + q.replace(/\D/g, "") + "%"})
    group by c.id order by c.name`);
  const list = status === "owing" ? rows.filter((r) => r.open_c > 0) : rows;
  const dups = findDuplicateCandidates(rows.map((r) => ({ ...r, tin: r.tin })));

  return (
    <>
      <PageHeader title="Clients" description="Customer master list with TIN, terms and what each one owes." actions={canEdit(s) && <ButtonLink href="/clients/new"><Plus size={15} /> New client</ButtonLink>} />
      {dups.length > 0 && canEdit(s) && (
        <Card className="mb-4 border-warn/30">
          <CardHeader title="Possible duplicates" description="These look like the same company. Merging moves every billing and payment to the one you keep, and remembers the other spelling for imports." />
          <Table>
            <tbody>
              {dups.slice(0, 5).map((d) => {
                const keep = d.a.billings >= d.b.billings ? d.a : d.b;
                const drop = keep === d.a ? d.b : d.a;
                return (
                  <tr key={`${d.a.id}-${d.b.id}`}>
                    <Td><span className="font-medium">{drop.name}</span> <span className="text-muted">({drop.billings} billings)</span></Td>
                    <Td className="text-muted">→</Td>
                    <Td><span className="font-medium">{keep.name}</span> <span className="text-muted">({keep.billings} billings)</span></Td>
                    <Td><Badge tone="warn">{d.reason === "same_tin" ? "Same TIN" : `${Math.round(d.score * 100)}% similar name`}</Badge></Td>
                    <Td align="right"><MergeButton fromId={drop.id} intoId={keep.id} fromName={drop.name} intoName={keep.name} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
      <Card>
        <ListFilters base="/clients" active={status} q={q} tabs={[{ key: "all", label: "All", count: rows.length }, { key: "owing", label: "With balance", count: rows.filter((r) => r.open_c > 0).length }]} />
        {list.length === 0 ? <EmptyState title="No clients match" /> : (
          <Table>
            <thead><tr><Th>Name</Th><Th>TIN</Th><Th>Terms</Th><Th>CWT</Th><Th align="right">Sales (12 mo.)</Th><Th align="right">Unpaid</Th><Th align="right">Overdue</Th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/60">
                  <Td><Link href={`/clients/${c.id}`} className="font-medium hover:underline">{c.name}</Link></Td>
                  <Td className="num whitespace-nowrap text-ink-2">{c.tin ? formatTin(c.tin, c.tin_branch) : <span className="text-muted">—</span>}</Td>
                  <Td className="whitespace-nowrap">{c.terms_days ? `${c.terms_days} days` : "COD"}</Td>
                  <Td>{c.cwt_rate_bp ? formatRateBp(c.cwt_rate_bp) : "—"}</Td>
                  <Td align="right">{formatPeso(c.sales_12m)}</Td>
                  <Td align="right" className={c.open_c ? "font-medium" : "text-muted"}>{formatPeso(c.open_c)}</Td>
                  <Td align="right">{c.overdue_c ? <span className="font-medium text-bad">{formatPeso(c.overdue_c)}</span> : <span className="text-muted">—</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
