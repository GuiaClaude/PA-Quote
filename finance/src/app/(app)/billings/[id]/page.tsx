import Link from "next/link";
import { notFound } from "next/navigation";
import { BillingStatusActions, FollowUpForm } from "@/components/forms/billing-actions";
import { JournalLinesTable, type JLine } from "@/components/journal-lines";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { daysOverdue } from "@/lib/domain/aging";
import { formatDate, manilaToday } from "@/lib/domain/dates";
import { formatPeso, formatRateBp } from "@/lib/domain/money";
import { COLLECTION_MODES, displayBillingStatus, DOC_SHORT, DOC_TYPE, FORM_2307, VAT_TREATMENT } from "@/lib/labels";
import { withUser } from "@/server/db";
import { canEdit, requireSession } from "@/server/session";

export default async function BillingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const s = await requireSession();
  const today = manilaToday();
  const data = await withUser(s, async (tx) => {
    const [b] = await tx<{
      id: string; doc_type: string; doc_no: string; billing_date: string; due_date: string; terms_days: number; status: string; status_reason: string | null;
      gross_c: number; net_c: number; vat_c: number; balance_c: number; paid_c: number; cwt_c: number; vat_basis: string; vat_treatment: string; cwt_rate_bp: number;
      po_number: string | null; job_type: string | null; description: string | null; client: string; client_id: string; ce_number: string | null; project_id: string | null;
    }[]>`
      select b.*, v.balance_c, v.paid_c, v.cwt_c, c.name as client, p.ce_number
      from billings b join v_billing_balances v on v.id = b.id join clients c on c.id = b.client_id left join projects p on p.id = b.project_id
      where b.id = ${id} and b.org_id = ${s.orgId}`;
    if (!b) return null;
    const lines = await tx<{ line_no: number; description: string; qty: number; unit_price_c: number; amount_c: number }[]>`
      select line_no, description, qty, unit_price_c, amount_c from billing_lines where billing_id = ${id} order by line_no`;
    const payments = await tx<{ id: string; collection_date: string; receipt_type: string; receipt_no: string | null; payment_mode: string; applied_c: number; cwt_c: number; form_2307_status: string }[]>`
      select c.id, c.collection_date, c.receipt_type, c.receipt_no, c.payment_mode, a.applied_c, a.cwt_c, c.form_2307_status
      from collection_allocations a join collections c on c.id = a.collection_id
      where a.billing_id = ${id} and c.deleted_at is null order by c.collection_date`;
    const notes = await tx<{ id: string; note: string; next_follow_up_date: string | null; created_at: string; by: string | null }[]>`
      select n.id, n.note, n.next_follow_up_date, n.created_at::text, p.full_name as by
      from follow_up_notes n left join profiles p on p.user_id = n.created_by where n.billing_id = ${id} order by n.created_at desc`;
    const journal = await tx<JLine[]>`
      select e.id as entry_id, e.entry_no, e.entry_date, e.kind, e.memo as entry_memo, e.reversed_at is not null as reversed, l.line_no, a.code, a.name as account, l.debit_c, l.credit_c
      from journal_entries e join journal_lines l on l.entry_id = e.id join accounts a on a.id = l.account_id
      where e.org_id = ${s.orgId} and e.source_doc_type = 'billing' and e.source_doc_id = ${id}
      order by e.entry_no, l.line_no`;
    return { b, lines, payments, notes, journal };
  });
  if (!data) notFound();
  const { b, lines, payments, notes, journal } = data;
  const st = displayBillingStatus(b.status, b.balance_c, b.due_date, today);
  const late = b.balance_c > 0 ? daysOverdue(b.due_date, today) : 0;

  return (
    <>
      <PageHeader
        title={`${DOC_SHORT[b.doc_type]} ${b.doc_no}`}
        description={<><Link href={`/clients/${b.client_id}`} className="font-medium text-ink-2 hover:underline">{b.client}</Link> · {DOC_TYPE[b.doc_type]} dated {formatDate(b.billing_date)}</>}
        actions={<Badge tone={st.tone}>{st.label}</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Summary" />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-[13px] sm:grid-cols-3">
              <Info label="Amount (gross)" value={formatPeso(b.gross_c)} strong />
              <Info label="Net of VAT" value={formatPeso(b.net_c)} />
              <Info label="Output VAT" value={`${formatPeso(b.vat_c)}${b.vat_basis === "collected" ? " (on collection)" : ""}`} />
              <Info label="Received" value={formatPeso(b.paid_c)} />
              <Info label="CWT (2307)" value={formatPeso(b.cwt_c)} />
              <Info label="Balance" value={formatPeso(["void", "rejected"].includes(b.status) ? 0 : b.balance_c)} strong />
              <Info label="Due date" value={`${formatDate(b.due_date)}${late > 0 ? ` · ${late} days late` : ""}`} />
              <Info label="Terms" value={b.terms_days === 0 ? "COD" : `${b.terms_days} days`} />
              <Info label="VAT" value={VAT_TREATMENT[b.vat_treatment] ?? b.vat_treatment} />
              <Info label="Expected CWT" value={b.cwt_rate_bp ? formatRateBp(b.cwt_rate_bp) + " of net" : "None"} />
              <Info label="Project / CE#" value={b.ce_number ?? "—"} />
              <Info label="PO #" value={b.po_number ?? "—"} />
            </dl>
            {b.status_reason && <p className="border-t border-line px-4 py-2 text-[13px] text-ink-2">Reason: {b.status_reason}</p>}
          </Card>

          <Card>
            <CardHeader title="Lines" />
            <Table>
              <thead><tr><Th>#</Th><Th>Description</Th><Th align="right">Qty</Th><Th align="right">Unit price</Th><Th align="right">Amount</Th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.line_no}><Td>{l.line_no}</Td><Td>{l.description}</Td><Td align="right">{Number(l.qty).toLocaleString("en-US")}</Td><Td align="right">{formatPeso(l.unit_price_c)}</Td><Td align="right">{formatPeso(l.amount_c)}</Td></tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Payments received" action={canEdit(s) && b.balance_c > 0 && !["void", "rejected", "draft"].includes(b.status) ? <Link href={`/collections/new?client=${b.client_id}&billing=${b.id}`} className="whitespace-nowrap text-[13px] font-medium text-brand-strong hover:underline">Receive payment</Link> : undefined} />
            {payments.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <Table>
                <thead><tr><Th>Date</Th><Th>Receipt</Th><Th>Mode</Th><Th align="right">Cash</Th><Th align="right">CWT</Th><Th>2307</Th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <Td>{formatDate(p.collection_date)}</Td>
                      <Td>{DOC_SHORT[p.receipt_type]} {p.receipt_no ?? ""}</Td>
                      <Td>{COLLECTION_MODES[p.payment_mode]}</Td>
                      <Td align="right">{formatPeso(p.applied_c)}</Td>
                      <Td align="right">{formatPeso(p.cwt_c)}</Td>
                      <Td>{p.cwt_c > 0 ? <Badge tone={FORM_2307[p.form_2307_status]!.tone}>{FORM_2307[p.form_2307_status]!.label}</Badge> : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Journal entries" description="Posted automatically. Corrections appear as reversals, never as deletions." />
            <JournalLinesTable lines={journal} />
          </Card>
        </div>

        <div className="space-y-4">
          {canEdit(s) && (
            <Card>
              <CardHeader title="Actions" />
              <div className="p-4"><BillingStatusActions id={b.id} status={b.status} hasPayments={b.paid_c + b.cwt_c > 0} /></div>
            </Card>
          )}
          <Card>
            <CardHeader title="Follow-up notes" description="Collection follow-ups, newest first." />
            <div className="space-y-3 p-4">
              {canEdit(s) && <FollowUpForm id={b.id} />}
              {notes.length === 0 && <p className="text-[13px] text-muted">No notes yet.</p>}
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-line bg-surface-2 p-3 text-[13px]">
                  <p>{n.note}</p>
                  <p className="mt-1 text-[12px] text-muted">
                    {n.by ?? "—"} · {formatDate(n.created_at.slice(0, 10))}
                    {n.next_follow_up_date && <> · next follow-up {formatDate(n.next_follow_up_date)}</>}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Info({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={strong ? "num mt-0.5 font-semibold text-ink" : "num mt-0.5 text-ink-2"}>{value}</dd>
    </div>
  );
}
