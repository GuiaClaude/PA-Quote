import Link from "next/link";
import { Plus } from "lucide-react";
import { ListFilters } from "@/components/list-filters";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";
import { withUser } from "@/server/db";
import { canEdit, requireSession } from "@/server/session";

export const metadata = { title: "Journal entries" };

const KIND = { auto: ["Auto", "brand"], manual: ["Manual", "neutral"], reversal: ["Reversal", "warn"], opening: ["Opening", "good"], closing: ["Closing", "neutral"] } as const;

export default async function JournalPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const q = sp.q?.trim() ?? "";
  const rows = await withUser(s, (tx) => tx<{ id: string; entry_no: number; entry_date: string; memo: string | null; kind: keyof typeof KIND; total: number; lines: number; reversed: boolean; by: string | null }[]>`
    select e.id, e.entry_no, e.entry_date, e.memo, e.kind, sum(l.debit_c)::bigint as total, count(l.id)::int as lines, e.reversed_at is not null as reversed, p.full_name as by
    from journal_entries e join journal_lines l on l.entry_id = e.id left join profiles p on p.user_id = e.posted_by
    where e.org_id = ${s.orgId} and (${status} = 'all' or e.kind = ${status}) and (${q} = '' or e.memo ilike ${"%" + q + "%"} or e.entry_no::text = ${q})
    group by e.id, p.full_name order by e.entry_date desc, e.entry_no desc limit 300`);
  return (
    <>
      <PageHeader title="Journal entries" description="Every transaction posts a balanced double-entry automatically. Bookkeepers can add manual entries." actions={canEdit(s) && <ButtonLink href="/journal/new"><Plus size={15} /> Manual entry</ButtonLink>} />
      <Card>
        <ListFilters base="/journal" active={status} q={q} tabs={[{ key: "all", label: "All" }, { key: "auto", label: "Automatic" }, { key: "manual", label: "Manual" }, { key: "reversal", label: "Reversals" }, { key: "opening", label: "Opening" }]} />
        {rows.length === 0 ? <EmptyState title="No entries" /> : (
          <Table>
            <thead><tr><Th>No.</Th><Th>Date</Th><Th>Description</Th><Th>Type</Th><Th>Posted by</Th><Th align="right">Lines</Th><Th align="right">Amount</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.reversed ? "text-muted" : "hover:bg-surface-2/60"}>
                  <Td><Link href={`/journal/${r.id}`} className="font-medium text-brand-strong hover:underline">JE {r.entry_no}</Link></Td>
                  <Td className="whitespace-nowrap">{formatDate(r.entry_date)}</Td>
                  <Td>{r.memo}{r.reversed && <span className="ml-2 text-[12px]">(reversed)</span>}</Td>
                  <Td><Badge tone={KIND[r.kind][1]}>{KIND[r.kind][0]}</Badge></Td>
                  <Td className="text-ink-2">{r.by ?? "—"}</Td>
                  <Td align="right">{r.lines}</Td>
                  <Td align="right">{formatPeso(r.total)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
