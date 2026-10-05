import { LockPeriodForm, UnlockButton } from "@/components/forms/settings-forms";
import { Badge, Card, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { addDays, formatDate, manilaToday } from "@/lib/domain/dates";
import { formatRateBp } from "@/lib/domain/money";
import { formatTin } from "@/lib/domain/parties";
import { periodContaining } from "@/lib/domain/periods";
import { withUser } from "@/server/db";
import { canEdit, requireSession } from "@/server/session";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await requireSession();
  const today = manilaToday();
  const d = await withUser(s, async (tx) => {
    const [org] = await tx<{ name: string; legal_name: string | null; tin: string | null; branch_code: string | null; rdo_code: string | null; address: string | null; books_start_date: string; vat_registered: boolean }[]>`select * from organizations where id = ${s.orgId}`;
    const team = await tx<{ full_name: string; email: string; role: string }[]>`
      select p.full_name, coalesce(p.email, '') as email, m.role from memberships m join profiles p on p.user_id = m.user_id where m.org_id = ${s.orgId} order by m.created_at`;
    const [tax] = await tx<{ vat_rate_bp: number; default_cwt_rate_bp: number; confirmed_by_accountant: boolean }[]>`select * from tax_settings where org_id = ${s.orgId}`;
    const vat = await tx<{ start_date: string; end_date: string | null; basis: string; note: string | null }[]>`select start_date, end_date, basis, note from vat_basis_periods where org_id = ${s.orgId} order by start_date`;
    const locks = await tx<{ id: string; period_start: string; period_end: string; locked_at: string; unlocked_at: string | null; unlock_reason: string | null; by: string | null }[]>`
      select l.id, l.period_start, l.period_end, l.locked_at::text, l.unlocked_at::text, l.unlock_reason, p.full_name as by
      from period_locks l left join profiles p on p.user_id = l.locked_by where l.org_id = ${s.orgId} order by l.period_start desc`;
    const audit = canEdit(s)
      ? await tx<{ at: string; action: string; table_name: string; who: string | null }[]>`
          select a.at::text, a.action, a.table_name, p.full_name as who from audit_log a left join profiles p on p.user_id = a.actor_id
          where a.org_id = ${s.orgId} order by a.id desc limit 12`
      : [];
    return { org: org!, team, tax: tax!, vat, locks, audit };
  });
  const lastMonth = periodContaining("month", addDays(today.slice(0, 8) + "01", -1));
  const ROLE = { owner: "brand", bookkeeper: "neutral", viewer: "neutral" } as const;

  return (
    <>
      <PageHeader title="Settings" description="Company details, team, tax settings and closing periods." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Company" />
          <dl className="grid grid-cols-2 gap-3 p-4 text-[13px]">
            <div><dt className="text-muted">Registered name</dt><dd className="font-medium">{d.org.legal_name ?? d.org.name}</dd></div>
            <div><dt className="text-muted">TIN</dt><dd className="num">{d.org.tin ? formatTin(d.org.tin, d.org.branch_code) : "—"}</dd></div>
            <div><dt className="text-muted">VAT registered</dt><dd>{d.org.vat_registered ? "Yes" : "No"}</dd></div>
            <div><dt className="text-muted">Books start</dt><dd>{formatDate(d.org.books_start_date)} (opening balances as of {formatDate(addDays(d.org.books_start_date, -1))})</dd></div>
            <div className="col-span-2"><dt className="text-muted">Currency · time zone · date format</dt><dd>PHP (₱) · Asia/Manila · MM/DD/YYYY</dd></div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Team" description="Owner: everything. Bookkeeper: enter and edit in open periods. Viewer: read-only." />
          <Table>
            <tbody>
              {d.team.map((t) => (
                <tr key={t.email}><Td className="font-medium">{t.full_name}</Td><Td className="text-ink-2">{t.email}</Td><Td align="right"><Badge tone={ROLE[t.role as keyof typeof ROLE]}>{t.role[0]!.toUpperCase() + t.role.slice(1)}</Badge></Td></tr>
              ))}
            </tbody>
          </Table>
          <p className="px-4 py-2 text-[12px] text-muted">Inviting people by email arrives with Supabase sign-in at deployment.</p>
        </Card>

        <Card>
          <CardHeader title="Tax settings" />
          <div className="space-y-3 p-4 text-[13px]">
            <p>VAT rate <span className="font-semibold">{formatRateBp(d.tax.vat_rate_bp)}</span> · default CWT <span className="font-semibold">{formatRateBp(d.tax.default_cwt_rate_bp)}</span></p>
            <div>
              <p className="mb-1 font-medium">When output VAT is recognised</p>
              <Table>
                <thead><tr><Th>From</Th><Th>To</Th><Th>Basis</Th><Th>Note</Th></tr></thead>
                <tbody>
                  {d.vat.map((v) => (
                    <tr key={v.start_date}><Td>{formatDate(v.start_date)}</Td><Td>{v.end_date ? formatDate(v.end_date) : "onwards"}</Td><Td><Badge tone={v.basis === "billed" ? "brand" : "neutral"}>{v.basis === "billed" ? "When billed" : "When collected"}</Badge></Td><Td className="text-[12px] text-ink-2">{v.note}</Td></tr>
                  ))}
                </tbody>
              </Table>
            </div>
            {!d.tax.confirmed_by_accountant && <Notice tone="warn">These tax settings are defaults. Please have your accountant confirm the VAT cut-over date and rates.</Notice>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Close a period" description="Closed months can't be changed. Only the Owner can unlock, and every unlock is logged with a reason." />
          <div className="space-y-4 p-4">
            {canEdit(s) && <LockPeriodForm suggestStart={lastMonth.start} suggestEnd={lastMonth.end} />}
            {d.locks.length === 0 ? <p className="text-[13px] text-muted">No periods closed yet.</p> : (
              <Table>
                <tbody>
                  {d.locks.map((l) => (
                    <tr key={l.id}>
                      <Td>{formatDate(l.period_start)} – {formatDate(l.period_end)}</Td>
                      <Td className="text-[12px] text-ink-2">{l.unlocked_at ? `Unlocked ${formatDate(l.unlocked_at.slice(0, 10))}: ${l.unlock_reason}` : `Closed by ${l.by ?? "—"}`}</Td>
                      <Td align="right">{l.unlocked_at ? <Badge>Unlocked</Badge> : s.role === "owner" ? <UnlockButton id={l.id} /> : <Badge tone="good">Closed</Badge>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </Card>

        {canEdit(s) && (
          <Card className="lg:col-span-2">
            <CardHeader title="Recent activity (audit log)" description="Every create, change, delete and unlock is recorded with who and when. The log can't be edited." />
            <Table>
              <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Record</Th></tr></thead>
              <tbody>
                {d.audit.map((a, i) => (
                  <tr key={i}>
                    <Td className="whitespace-nowrap">{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "short", timeStyle: "short" }).format(new Date(a.at))}</Td>
                    <Td>{a.who ?? "System"}</Td>
                    <Td className="capitalize">{a.action}</Td>
                    <Td className="text-ink-2">{a.table_name.replace(/_/g, " ")}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
