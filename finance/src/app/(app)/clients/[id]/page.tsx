import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { PartyForm } from "@/components/forms/party-form";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { AGING_BUCKETS, AGING_LABELS, agingBucket, emptyAging } from "@/lib/domain/aging";
import { daysBetween, formatDate, manilaToday } from "@/lib/domain/dates";
import { formatPeso, formatRateBp } from "@/lib/domain/money";
import { formatTin } from "@/lib/domain/parties";
import { displayBillingStatus, DOC_SHORT } from "@/lib/labels";
import { withUser } from "@/server/db";
import { canEdit, requireSession } from "@/server/session";

export default async function ClientDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const editing = (await searchParams).edit === "1";
  const s = await requireSession();
  const today = manilaToday();
  const data = await withUser(s, async (tx) => {
    const [c] = await tx<{ id: string; name: string; tin: string | null; tin_branch: string | null; address: string | null; contact_person: string | null; email: string | null; phone: string | null; terms_days: number; cwt_rate_bp: number; vat_status: string; notes: string | null }[]>`
      select * from clients where id = ${id} and org_id = ${s.orgId} and deleted_at is null`;
    if (!c) return null;
    const billings = await tx<{ id: string; doc_type: string; doc_no: string; billing_date: string; due_date: string; status: string; gross_c: number; balance_c: number; last_paid_on: string | null }[]>`
      select id, doc_type, doc_no, billing_date, due_date, status, gross_c, balance_c, last_paid_on from v_billing_balances where client_id = ${id} order by billing_date desc limit 200`;
    return { c, billings };
  });
  if (!data) notFound();
  const { c, billings } = data;
  const live = billings.filter((b) => !["void", "rejected", "draft"].includes(b.status));
  const aging = emptyAging();
  for (const b of live) if (b.balance_c > 0) aging[agingBucket(b.due_date, today)] += b.balance_c;
  const paid = live.filter((b) => b.balance_c === 0 && b.last_paid_on);
  const avgDays = paid.length ? Math.round(paid.reduce((a, b) => a + daysBetween(b.billing_date, b.last_paid_on!), 0) / paid.length) : null;

  if (editing) {
    return (
      <>
        <PageHeader title={`Edit ${c.name}`} />
        <div className="max-w-3xl">
          <PartyForm kind="client" id={c.id} initial={{
            name: c.name, tin: c.tin ? formatTin(c.tin, c.tin_branch) : "", address: c.address ?? "", contactPerson: c.contact_person ?? "", email: c.email ?? "",
            phone: c.phone ?? "", termsDays: String(c.terms_days), vatStatus: c.vat_status, rateBp: String(c.cwt_rate_bp), notes: c.notes ?? "",
          }} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={c.name}
        description={<>{c.tin ? `TIN ${formatTin(c.tin, c.tin_branch)}` : "No TIN on file"} · {c.terms_days ? `${c.terms_days}-day terms` : "COD"} · CWT {c.cwt_rate_bp ? formatRateBp(c.cwt_rate_bp) : "none"}</>}
        actions={canEdit(s) && (
          <>
            <ButtonLink variant="secondary" href={`/clients/${c.id}?edit=1`}>Edit</ButtonLink>
            <ButtonLink variant="secondary" href={`/collections/new?client=${c.id}`}>Receive payment</ButtonLink>
            <ButtonLink href={`/billings/new`}><Plus size={15} /> New billing</ButtonLink>
          </>
        )}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {AGING_BUCKETS.map((b) => (
          <Card key={b} className="p-3">
            <p className="text-[12px] text-muted">{AGING_LABELS[b]}</p>
            <p className={`num mt-1 font-semibold ${b !== "current" && aging[b] ? "text-bad" : ""}`}>{formatPeso(aging[b])}</p>
          </Card>
        ))}
        <Card className="p-3">
          <p className="text-[12px] text-muted">Usually pays in</p>
          <p className="num mt-1 font-semibold">{avgDays === null ? "—" : `${avgDays} days`}</p>
        </Card>
      </div>
      <Card>
        <CardHeader title="Statement of account" description={`${live.length} billings · ${formatPeso(live.reduce((a, b) => a + b.balance_c, 0))} unpaid. The printable SOA (PDF) comes in Phase 4.`} />
        {billings.length === 0 ? <EmptyState title="No billings yet" /> : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Document</Th><Th>Due</Th><Th align="right">Amount</Th><Th align="right">Balance</Th><Th>Status</Th></tr></thead>
            <tbody>
              {billings.map((b) => {
                const st = displayBillingStatus(b.status, b.balance_c, b.due_date, today);
                return (
                  <tr key={b.id} className="hover:bg-surface-2/60">
                    <Td>{formatDate(b.billing_date)}</Td>
                    <Td><Link href={`/billings/${b.id}`} className="font-medium text-brand-strong hover:underline">{DOC_SHORT[b.doc_type]} {b.doc_no}</Link></Td>
                    <Td>{formatDate(b.due_date)}</Td>
                    <Td align="right">{formatPeso(b.gross_c)}</Td>
                    <Td align="right" className={b.balance_c ? "font-medium" : "text-muted"}>{["void", "rejected"].includes(b.status) ? "—" : formatPeso(b.balance_c)}</Td>
                    <Td><Badge tone={st.tone}>{st.label}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
