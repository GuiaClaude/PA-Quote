import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, Minus } from "lucide-react";
import { TrendChart } from "@/components/charts";
import { LiveRefresh } from "@/components/live-refresh";
import { PeriodPicker } from "@/components/period-picker";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { AGING_BUCKETS, AGING_LABELS, daysOverdue } from "@/lib/domain/aging";
import { formatDate, manilaToday } from "@/lib/domain/dates";
import { formatPeso, formatPesoCompact } from "@/lib/domain/money";
import { periodFromParams, periodLabel } from "@/lib/domain/periods";
import { DOC_SHORT } from "@/lib/labels";
import { cn } from "@/lib/cn";
import { withUser } from "@/server/db";
import { getDashboard } from "@/server/queries/dashboard";
import { requireSession } from "@/server/session";

export const metadata = { title: "Dashboard" };

type SP = Promise<Record<string, string | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const s = await requireSession();
  const today = manilaToday();
  const period = periodFromParams(await searchParams, today);
  const { d, version } = await withUser(s, async (tx) => {
    const d = await getDashboard(tx, s.orgId, period, today);
    const [v] = await tx<{ version: number }[]>`select version from org_data_versions where org_id = ${s.orgId}`;
    return { d, version: v?.version ?? 0 };
  });
  const prevLabel = d.inProgress ? `${formatDate(d.prevCut.start)}–${formatDate(d.prevCut.end).slice(0, 5)}` : periodLabel(d.prev);
  const vatDue = d.cur.outputVat - d.cur.inputVat;
  const overdueTotal = d.overdue.reduce((a, o) => a + o.balance_c, 0);
  const billsTotal = d.billsDue.reduce((a, o) => a + o.balance_c, 0);
  const expenseTop = d.expenseBreakdown.slice(0, 6);
  const expenseOther = d.expenseBreakdown.slice(6).reduce((a, e) => a + e.amount, 0);
  const expenseMax = Math.max(1, ...expenseTop.map((e) => e.amount), expenseOther);
  const agingMax = Math.max(1, ...AGING_BUCKETS.map((b) => d.aging[b]));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          d.inProgress ? (
            <><span className="font-medium text-ink-2">{periodLabel(period)} to date</span> ({formatDate(period.start)} – {formatDate(today)}), compared with the same days of the previous period ({prevLabel}).</>
          ) : (
            <>Figures for <span className="font-medium text-ink-2">{periodLabel(period)}</span> ({formatDate(period.start)} – {formatDate(period.end)}), compared with {prevLabel}.</>
          )
        }
        actions={<LiveRefresh initialVersion={version} lastChange={d.lastChange} />}
      />
      <div className="mb-5"><PeriodPicker period={period} /></div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Sales (net of VAT)" value={d.cur.sales} prev={d.before.sales} prevLabel={prevLabel} />
        <Kpi label="Collections" value={d.cur.collections} prev={d.before.collections} prevLabel={prevLabel} />
        <Kpi label="Expenses" value={d.cur.expenses} prev={d.before.expenses} prevLabel={prevLabel} upIsGood={false} />
        <Kpi label="Net income" value={d.cur.netIncome} prev={d.before.netIncome} prevLabel={prevLabel} />
        <Kpi label="Cash in bank & on hand" value={d.cur.cashEnd} prev={d.before.cashEnd} prevLabel={`end of ${prevLabel}`} note={`as of ${formatDate(d.inProgress ? today : period.end)}`} />
        <Kpi label="Receivables (AR)" value={d.cur.arEnd} prev={d.before.arEnd} prevLabel={`end of ${prevLabel}`} upIsGood={false} href="/billings?status=open" />
        <Kpi label="Payables (AP)" value={d.cur.apEnd} prev={d.before.apEnd} prevLabel={`end of ${prevLabel}`} upIsGood={false} href="/purchases?status=open" />
        <Kpi
          label={vatDue >= 0 ? "VAT payable (estimate)" : "Excess input VAT (carry-over)"}
          value={Math.abs(vatDue)}
          prev={vatDue >= 0 ? d.before.outputVat - d.before.inputVat : d.before.inputVat - d.before.outputVat}
          prevLabel={prevLabel}
          upIsGood={vatDue < 0}
          note={`Output ${formatPesoCompact(d.cur.outputVat)} − input ${formatPesoCompact(d.cur.inputVat)}`}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Sales, collections and expenses" description="Last 12 months, by month" />
          <div className="p-3 pt-1"><TrendChart data={d.series} /></div>
          <details className="border-t border-line px-4 py-2 text-[12px] text-muted">
            <summary className="cursor-pointer select-none">Show as table</summary>
            <Table className="mt-2">
              <thead><tr><Th>Month</Th><Th align="right">Sales</Th><Th align="right">Collections</Th><Th align="right">Expenses</Th></tr></thead>
              <tbody>
                {d.series.map((p) => (
                  <tr key={p.month}><Td>{p.month.slice(0, 7)}</Td><Td align="right">{formatPeso(p.sales)}</Td><Td align="right">{formatPeso(p.collections)}</Td><Td align="right">{formatPeso(p.expenses)}</Td></tr>
                ))}
              </tbody>
            </Table>
          </details>
        </Card>

        <Card>
          <CardHeader title="Where the money went" description={`Expenses in ${periodLabel(period)}`} />
          <div className="space-y-2.5 p-4">
            {expenseTop.length === 0 && <p className="text-[13px] text-muted">No expenses in this period.</p>}
            {[...expenseTop, ...(expenseOther ? [{ name: "Everything else", amount: expenseOther }] : [])].map((e) => (
              <div key={e.name}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate text-ink-2">{e.name}</span>
                  <span className="num font-medium">{formatPeso(e.amount)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                  <div className="h-1.5 rounded-full bg-series-1" style={{ width: `${Math.max(2, (e.amount / expenseMax) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={<span className="flex items-center gap-2"><AlertTriangle size={16} className="text-warn" /> Overdue billings</span>}
            description={`${d.overdue.length} billing${d.overdue.length === 1 ? "" : "s"} past due · ${formatPeso(overdueTotal)} to collect`}
            action={<Link href="/billings?status=overdue" className="whitespace-nowrap text-[13px] font-medium text-brand-strong hover:underline">View all</Link>}
          />
          {d.overdue.length === 0 ? (
            <EmptyState title="Nothing overdue">All billings are within terms.</EmptyState>
          ) : (
            <Table>
              <thead><tr><Th>Client</Th><Th>Billing</Th><Th>Due</Th><Th align="right">Days late</Th><Th align="right">Balance</Th></tr></thead>
              <tbody>
                {d.overdue.slice(0, 7).map((o) => {
                  const late = daysOverdue(o.due_date, today);
                  return (
                    <tr key={o.id} className="hover:bg-surface-2/60">
                      <Td><Link href={`/clients/${o.client_id}`} className="font-medium hover:underline">{o.client}</Link></Td>
                      <Td><Link href={`/billings/${o.id}`} className="text-brand-strong hover:underline">{DOC_SHORT[o.doc_type]} {o.doc_no}</Link></Td>
                      <Td>{formatDate(o.due_date)}</Td>
                      <Td align="right"><Badge tone={late > 60 ? "bad" : "warn"}>{late} days</Badge></Td>
                      <Td align="right" className="font-medium">{formatPeso(o.balance_c)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Receivables aging" description={`Open billings as of ${formatDate(today)}`} />
          <div className="space-y-2.5 p-4">
            {AGING_BUCKETS.map((b) => (
              <div key={b}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="text-ink-2">{AGING_LABELS[b]}</span>
                  <span className="num font-medium">{formatPeso(d.aging[b])}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                  <div className="h-1.5 rounded-full bg-series-1" style={{ width: `${d.aging[b] ? Math.max(2, (d.aging[b] / agingMax) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top clients" description={`By sales (net of VAT) in ${periodLabel(period)}`} />
          {d.topClients.length === 0 ? (
            <EmptyState title="No billings in this period" />
          ) : (
            <Table>
              <thead><tr><Th>Client</Th><Th align="right">Billings</Th><Th align="right">Sales</Th><Th align="right">Share</Th></tr></thead>
              <tbody>
                {d.topClients.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/60">
                    <Td><Link href={`/clients/${c.id}`} className="font-medium hover:underline">{c.name}</Link></Td>
                    <Td align="right">{c.count}</Td>
                    <Td align="right" className="font-medium">{formatPeso(c.net)}</Td>
                    <Td align="right" className="text-muted">{d.cur.sales ? Math.round((c.net / d.cur.sales) * 100) : 0}%</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><CalendarClock size={16} className="text-brand" /> Bills due this week</span>}
            description={`Unpaid supplier bills due by ${formatDate(d.week.end)} (including overdue) · ${formatPeso(billsTotal)}`}
            action={<Link href="/payments/new" className="whitespace-nowrap text-[13px] font-medium text-brand-strong hover:underline">Pay bills</Link>}
          />
          {d.billsDue.length === 0 ? (
            <EmptyState title="No bills due this week" />
          ) : (
            <Table>
              <thead><tr><Th>Supplier</Th><Th>Ref #</Th><Th>Due</Th><Th align="right">Balance</Th></tr></thead>
              <tbody>
                {d.billsDue.slice(0, 7).map((b) => (
                  <tr key={b.id} className="hover:bg-surface-2/60">
                    <Td className="font-medium">{b.supplier}</Td>
                    <Td>{b.reference_no ?? "—"}</Td>
                    <Td>{b.due_date < today ? <Badge tone="warn">{formatDate(b.due_date)}</Badge> : formatDate(b.due_date)}</Td>
                    <Td align="right" className="font-medium">{formatPeso(b.balance_c)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {d.billsDue.length > 7 && <p className="px-4 py-2 text-[12px] text-muted">+ {d.billsDue.length - 7} more</p>}
        </Card>
      </div>

      <p className="mt-6 text-[12px] text-muted">
        VAT figures are estimates for planning (BIR Form 2550Q reference), not a filed return. Please confirm with your accountant.
      </p>
    </>
  );
}

function Kpi({ label, value, prev, prevLabel, upIsGood = true, note, href }: { label: string; value: number; prev: number; prevLabel: string; upIsGood?: boolean; note?: string; href?: string }) {
  const diff = value - prev;
  const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : null;
  const good = diff === 0 ? null : (diff > 0) === upIsGood;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  const body = (
    <Card className={cn("h-full p-3 sm:p-4", href && "transition-colors hover:border-brand/40")}>
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="num mt-1.5 text-[16px] font-semibold tracking-tight text-ink min-[400px]:text-[18px] sm:text-[22px]">{formatPeso(value)}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[12px]">
        <span className={cn("inline-flex items-center gap-0.5 font-medium", good === null ? "text-muted" : good ? "text-good" : "text-bad")}>
          <Icon size={13} />
          {pct === null ? "—" : `${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`}
        </span>
        <span className="text-muted">vs {prevLabel}</span>
      </p>
      {note && <p className="mt-1 truncate text-[11px] text-muted">{note}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
