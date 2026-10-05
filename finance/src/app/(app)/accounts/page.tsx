import { AddAccountForm } from "@/components/forms/settings-forms";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { manilaToday, formatDate } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";
import { withUser } from "@/server/db";
import { canEdit, requireSession } from "@/server/session";

export const metadata = { title: "Chart of accounts" };

const GROUPS = [
  ["asset", "Assets"], ["liability", "Liabilities"], ["equity", "Equity"], ["revenue", "Revenue"], ["cogs", "Cost of sales"], ["expense", "Operating expenses"], ["other_income", "Other income"], ["other_expense", "Other expenses"],
] as const;

export default async function AccountsPage() {
  const s = await requireSession();
  const today = manilaToday();
  const rows = await withUser(s, (tx) => tx<{ id: string; code: string; name: string; type: string; normal_side: string; is_system: boolean; tax_tag: string | null; bir_summary_column: string | null; balance: number }[]>`
    select a.id, a.code, a.name, a.type, a.normal_side, a.is_system, a.tax_tag, a.bir_summary_column,
           coalesce(sum(case when a.normal_side = 'debit' then l.debit_c - l.credit_c else l.credit_c - l.debit_c end), 0)::bigint as balance
    from accounts a left join journal_lines l on l.account_id = a.id
    where a.org_id = ${s.orgId} group by a.id order by a.code`);
  const dr = rows.filter((r) => r.normal_side === "debit").reduce((a, r) => a + r.balance, 0);
  const cr = rows.filter((r) => r.normal_side === "credit").reduce((a, r) => a + r.balance, 0);
  return (
    <>
      <PageHeader title="Chart of accounts" description={`Balances to date (${formatDate(today)}). System accounts are used by automatic posting: rename them freely, but they can't be deleted.`} />
      {canEdit(s) && <Card className="mb-4"><CardHeader title="Add an account" /><AddAccountForm /></Card>}
      <Card>
        <Table>
          <thead><tr><Th>Code</Th><Th>Account</Th><Th>BIR purchases column</Th><Th /><Th align="right">Balance</Th></tr></thead>
          {GROUPS.map(([t, label]) => {
            const g = rows.filter((r) => r.type === t);
            if (!g.length) return null;
            return (
              <tbody key={t}>
                <tr className="bg-surface-2"><Td colSpan={4} className="font-semibold">{label}</Td><Td align="right" className="font-semibold">{formatPeso(g.reduce((a, r) => a + r.balance, 0))}</Td></tr>
                {g.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/60">
                    <Td className="num text-ink-2">{r.code}</Td>
                    <Td>{r.name}</Td>
                    <Td className="text-[12px] text-muted">{r.bir_summary_column ?? ""}</Td>
                    <Td>{r.is_system && <Badge>System</Badge>}</Td>
                    <Td align="right" className={r.balance ? "" : "text-muted"}>{formatPeso(r.balance)}</Td>
                  </tr>
                ))}
              </tbody>
            );
          })}
          <tfoot><tr className="font-semibold"><Td colSpan={4}>Debit-side balances = credit-side balances (trial balance check)</Td><Td align="right" className={dr === cr ? "text-good" : "text-bad"}>{dr === cr ? "✓ Balanced" : `Off by ${formatPeso(dr - cr)}`}</Td></tr></tfoot>
        </Table>
      </Card>
    </>
  );
}
