import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";
import { withUser } from "@/server/db";
import { requireSession } from "@/server/session";

const DOC_LINK: Record<string, string> = { billing: "/billings/" };

export default async function JournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await requireSession();
  const data = await withUser(s, async (tx) => {
    const [e] = await tx<{ id: string; entry_no: number; entry_date: string; memo: string | null; kind: string; source_doc_type: string | null; source_doc_id: string | null; reversed_at: string | null; reverses_id: string | null; posted_at: string; by: string | null }[]>`
      select e.*, e.posted_at::text, e.reversed_at::text, p.full_name as by from journal_entries e left join profiles p on p.user_id = e.posted_by where e.id = ${id} and e.org_id = ${s.orgId}`;
    if (!e) return null;
    const lines = await tx<{ line_no: number; code: string; name: string; debit_c: number; credit_c: number; memo: string | null; party: string | null }[]>`
      select l.line_no, a.code, a.name, l.debit_c, l.credit_c, l.memo, coalesce(c.name, su.name) as party
      from journal_lines l join accounts a on a.id = l.account_id
      left join clients c on l.party_type = 'client' and c.id = l.party_id left join suppliers su on l.party_type = 'supplier' and su.id = l.party_id
      where l.entry_id = ${id} order by l.line_no`;
    return { e, lines };
  });
  if (!data) notFound();
  const { e, lines } = data;
  const dr = lines.reduce((a, l) => a + l.debit_c, 0);
  const cr = lines.reduce((a, l) => a + l.credit_c, 0);
  return (
    <>
      <PageHeader title={`Journal entry ${e.entry_no}`} description={<>{formatDate(e.entry_date)} · {e.memo}</>} actions={<Badge tone={e.reversed_at ? "warn" : "brand"}>{e.reversed_at ? "Reversed" : e.kind[0]!.toUpperCase() + e.kind.slice(1)}</Badge>} />
      <Card>
        <CardHeader
          title="Lines"
          description={<>Posted {formatDate(e.posted_at.slice(0, 10))} by {e.by ?? "system"}{e.source_doc_type && e.source_doc_id && DOC_LINK[e.source_doc_type] ? <> · <Link className="text-brand-strong hover:underline" href={`${DOC_LINK[e.source_doc_type]}${e.source_doc_id}`}>open source document</Link></> : e.source_doc_type ? ` · from ${e.source_doc_type.replace("_", " ")}` : ""}{e.reverses_id && <> · <Link className="text-brand-strong hover:underline" href={`/journal/${e.reverses_id}`}>reverses an earlier entry</Link></>}</>}
        />
        <Table>
          <thead><tr><Th>Account</Th><Th>Client / supplier</Th><Th>Memo</Th><Th align="right">Debit</Th><Th align="right">Credit</Th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.line_no}>
                <Td className={l.credit_c ? "pl-8" : ""}>{l.code} · {l.name}</Td>
                <Td className="text-ink-2">{l.party ?? "—"}</Td>
                <Td className="text-ink-2">{l.memo ?? ""}</Td>
                <Td align="right">{l.debit_c ? formatPeso(l.debit_c) : ""}</Td>
                <Td align="right">{l.credit_c ? formatPeso(l.credit_c) : ""}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="bg-surface-2 font-semibold"><Td colSpan={3}>{dr === cr ? "Balanced" : "NOT BALANCED"}</Td><Td align="right">{formatPeso(dr)}</Td><Td align="right">{formatPeso(cr)}</Td></tr></tfoot>
        </Table>
      </Card>
    </>
  );
}
