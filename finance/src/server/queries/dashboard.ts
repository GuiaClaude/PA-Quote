import { addDays, addMonths, daysBetween, type ISODate } from "@/lib/domain/dates";

const minDate = (a: ISODate, b: ISODate) => (a < b ? a : b);
import { periodContaining, previousPeriod, type Period } from "@/lib/domain/periods";
import { emptyAging, agingBucket } from "@/lib/domain/aging";
import type { Tx } from "../db";

export interface Kpis {
  sales: number; // net of VAT (revenue accounts)
  collections: number; // cash + CWT received
  expenses: number; // cost of sales + operating + other expenses
  netIncome: number;
  outputVat: number;
  inputVat: number;
  cashEnd: number;
  arEnd: number;
  apEnd: number;
}

async function kpis(tx: Tx, orgId: string, p: Period): Promise<Kpis> {
  const [r] = await tx<Kpis[]>`
    with mv as (
      select
        coalesce(sum(case when a.type in ('revenue','other_income') then l.credit_c - l.debit_c end), 0) as income,
        coalesce(sum(case when a.type = 'revenue' then l.credit_c - l.debit_c end), 0) as sales,
        coalesce(sum(case when a.type in ('cogs','expense','other_expense') then l.debit_c - l.credit_c end), 0) as expenses,
        coalesce(sum(case when a.code = '2100' then l.credit_c - l.debit_c end), 0) as output_vat,
        coalesce(sum(case when a.code = '1300' then l.debit_c - l.credit_c end), 0) as input_vat
      from journal_lines l
      join journal_entries e on e.id = l.entry_id
      join accounts a on a.id = l.account_id
      where l.org_id = ${orgId} and e.entry_date between ${p.start} and ${p.end} and e.kind <> 'closing'
    ),
    bal as (
      select
        coalesce(sum(case when a.subtype = 'cash' then l.debit_c - l.credit_c end), 0) as cash_end,
        coalesce(sum(case when a.code = '1100' then l.debit_c - l.credit_c end), 0) as ar_end,
        coalesce(sum(case when a.code = '2010' then l.credit_c - l.debit_c end), 0) as ap_end
      from journal_lines l
      join journal_entries e on e.id = l.entry_id
      join accounts a on a.id = l.account_id
      where l.org_id = ${orgId} and e.entry_date <= ${p.end}
    ),
    col as (
      select coalesce(sum(cash_c + cwt_c), 0) as collections
      from collections where org_id = ${orgId} and deleted_at is null and collection_date between ${p.start} and ${p.end}
    )
    select mv.sales::bigint as "sales", col.collections::bigint as "collections", mv.expenses::bigint as "expenses",
           (mv.income - mv.expenses)::bigint as "netIncome", mv.output_vat::bigint as "outputVat", mv.input_vat::bigint as "inputVat",
           bal.cash_end::bigint as "cashEnd", bal.ar_end::bigint as "arEnd", bal.ap_end::bigint as "apEnd"
    from mv, bal, col`;
  return r!;
}

export interface MonthPoint { month: ISODate; sales: number; collections: number; expenses: number }

async function monthly(tx: Tx, orgId: string, endMonth: ISODate, months = 12): Promise<MonthPoint[]> {
  const start = addMonths(endMonth, -(months - 1));
  const end = addDays(addMonths(endMonth, 1), -1);
  const rows = await tx<MonthPoint[]>`
    with m as (select generate_series(${start}::date, ${endMonth}::date, interval '1 month')::date as month),
    led as (
      select date_trunc('month', e.entry_date)::date as month,
             sum(case when a.type = 'revenue' then l.credit_c - l.debit_c else 0 end) as sales,
             sum(case when a.type in ('cogs','expense','other_expense') then l.debit_c - l.credit_c else 0 end) as expenses
      from journal_lines l join journal_entries e on e.id = l.entry_id join accounts a on a.id = l.account_id
      where l.org_id = ${orgId} and e.entry_date between ${start} and ${end}
      group by 1
    ),
    col as (
      select date_trunc('month', collection_date)::date as month, sum(cash_c + cwt_c) as collections
      from collections where org_id = ${orgId} and deleted_at is null and collection_date between ${start} and ${end}
      group by 1
    )
    select to_char(m.month, 'YYYY-MM-DD') as month, coalesce(led.sales, 0)::bigint as sales,
           coalesce(col.collections, 0)::bigint as collections, coalesce(led.expenses, 0)::bigint as expenses
    from m left join led using (month) left join col using (month) order by m.month`;
  return rows;
}

export async function getDashboard(tx: Tx, orgId: string, period: Period, today: ISODate) {
  const prev = previousPeriod(period);
  // A period still in progress is compared like-for-like: the same number of days of the previous period.
  const inProgress = period.start <= today && today < period.end;
  const curCut: Period = inProgress ? { ...period, end: today } : period;
  const prevCut: Period = inProgress ? { ...prev, end: minDate(addDays(prev.start, daysBetween(period.start, today)), prev.end) } : prev;
  const [cur, before, series] = await Promise.all([
    kpis(tx, orgId, curCut),
    kpis(tx, orgId, prevCut),
    monthly(tx, orgId, period.end.slice(0, 8) + "01"),
  ]);

  const topClients = await tx<{ id: string; name: string; net: number; count: number }[]>`
    select c.id, c.name, sum(b.net_c)::bigint as net, count(*)::int as count
    from billings b join clients c on c.id = b.client_id
    where b.org_id = ${orgId} and b.deleted_at is null and b.status not in ('void','rejected','draft')
      and b.billing_date between ${period.start} and ${period.end}
    group by c.id, c.name order by net desc limit 6`;

  const expenseBreakdown = await tx<{ name: string; amount: number }[]>`
    select a.name, sum(l.debit_c - l.credit_c)::bigint as amount
    from journal_lines l join journal_entries e on e.id = l.entry_id join accounts a on a.id = l.account_id
    where l.org_id = ${orgId} and a.type in ('cogs','expense','other_expense') and e.entry_date between ${period.start} and ${period.end}
    group by a.name having sum(l.debit_c - l.credit_c) <> 0 order by amount desc`;

  const overdue = await tx<{ id: string; doc_type: string; doc_no: string; client: string; client_id: string; due_date: string; balance_c: number }[]>`
    select v.id, v.doc_type, v.doc_no, c.name as client, c.id as client_id, v.due_date, v.balance_c
    from v_billing_balances v join clients c on c.id = v.client_id
    where v.org_id = ${orgId} and v.balance_c > 0 and v.due_date < ${today} and v.status not in ('void','rejected','draft')
    order by v.due_date`;

  const open = await tx<{ due_date: string; balance_c: number }[]>`
    select due_date, balance_c from v_billing_balances
    where org_id = ${orgId} and balance_c > 0 and status not in ('void','rejected','draft')`;
  const aging = emptyAging();
  for (const o of open) aging[agingBucket(o.due_date, today)] += o.balance_c;

  const week = periodContaining("week", today);
  const billsDue = await tx<{ id: string; reference_no: string | null; supplier: string; due_date: string; balance_c: number }[]>`
    select v.id, v.reference_no, s.name as supplier, v.due_date, v.balance_c
    from v_purchase_balances v join suppliers s on s.id = v.supplier_id
    where v.org_id = ${orgId} and v.balance_c > 0 and v.due_date <= ${week.end}
    order by v.due_date`;

  const [fresh] = await tx<{ at: string | null }[]>`select at::text from org_data_versions where org_id = ${orgId}`;

  return { period, prev, prevCut, inProgress, cur, before, series, topClients, expenseBreakdown, overdue, aging, billsDue, week, lastChange: fresh?.at ?? null };
}
