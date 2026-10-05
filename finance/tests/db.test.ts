/**
 * Database-level guarantees, tested against a real Postgres with the seeded demo data.
 * Skipped automatically when DATABASE_URL is not set (e.g. on a machine without a database).
 * Run: pnpm db:reset && pnpm test
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

d("database security & integrity", () => {
  const sql = postgres(url ?? "postgres://invalid", { onnotice: () => {}, max: 2 });
  let org = "";
  const user: Record<string, string> = {};

  beforeAll(async () => {
    const rows = await sql<{ email: string; user_id: string; org_id: string }[]>`
      select p.email, m.user_id, m.org_id from memberships m join profiles p on p.user_id = m.user_id where p.email like '%@demo.local'`;
    if (!rows.length) throw new Error("Seed the database first: pnpm db:reset");
    for (const r of rows) user[r.email.split("@")[0]!] = r.user_id;
    org = rows[0]!.org_id;
  });
  afterAll(() => sql.end());

  /** Run `fn` as a user under RLS, always rolled back. */
  async function as<T>(who: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
    let out: T;
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub', ${who ?? "00000000-0000-0000-0000-000000000000"}, true)`;
        await tx.unsafe("set local role authenticated");
        out = await fn(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    return out!;
  }
  class Rollback extends Error {}

  it("viewer can read but not write", async () => {
    const n = await as(user.viewer!, async (tx) => (await tx`select count(*)::int as n from billings`)[0]!.n as number);
    expect(n).toBeGreaterThan(0);
    await expect(as(user.viewer!, (tx) => tx`insert into clients (org_id, name) values (${org}, 'x')`)).rejects.toThrow(/row-level security/);
  });

  it("bookkeeper cannot hard-delete documents or change tax settings", async () => {
    const r = await as(user.bookkeeper!, async (tx) => {
      const del = await tx`delete from billings where org_id = ${org}`;
      const upd = await tx`update tax_settings set vat_rate_bp = 0`;
      return { del: del.count, upd: upd.count };
    });
    expect(r).toEqual({ del: 0, upd: 0 });
  });

  it("people outside the organisation see nothing", async () => {
    const n = await as(null, async (tx) => (await tx`select count(*)::int as n from billings`)[0]!.n as number);
    expect(n).toBe(0);
  });

  it("an unbalanced journal entry is rejected at commit", async () => {
    await expect(
      sql.begin(async (tx) => {
        const [e] = await tx`insert into journal_entries (org_id, entry_date, memo, kind) values (${org}, '2026-01-05', 'bad', 'manual') returning id`;
        await tx`insert into journal_lines (org_id, entry_id, line_no, account_id, debit_c) select ${org}, ${e!.id}, 1, id, 100 from accounts where org_id = ${org} and code = '1010'`;
        await tx`insert into journal_lines (org_id, entry_id, line_no, account_id, credit_c) select ${org}, ${e!.id}, 2, id, 99 from accounts where org_id = ${org} and code = '4010'`;
      }),
    ).rejects.toThrow(/not balanced/);
  });

  it("every posted entry balances and AR/AP sub-ledgers match the GL", async () => {
    const [bad] = await sql`select count(*)::int as n from (select entry_id from journal_lines group by entry_id having sum(debit_c) <> sum(credit_c)) x`;
    expect(bad!.n).toBe(0);
    const [r] = await sql`
      select (select coalesce(sum(debit_c - credit_c), 0) from journal_lines l join accounts a on a.id = l.account_id where a.org_id = ${org} and a.code = '1100')::bigint as gl_ar,
             (select coalesce(sum(balance_c), 0) from v_billing_balances where org_id = ${org} and status not in ('void','rejected','draft'))::bigint as sub_ar,
             (select coalesce(sum(credit_c - debit_c), 0) from journal_lines l join accounts a on a.id = l.account_id where a.org_id = ${org} and a.code = '2010')::bigint as gl_ap,
             (select coalesce(sum(balance_c), 0) from v_purchase_balances where org_id = ${org})::bigint as sub_ap`;
    expect(r!.gl_ar).toBe(r!.sub_ar);
    expect(r!.gl_ap).toBe(r!.sub_ap);
  });

  it("closed periods and dates before the books start are refused", async () => {
    await expect(
      as(user.owner!, async (tx) => {
        await tx`insert into period_locks (org_id, period_start, period_end) values (${org}, '2026-02-01', '2026-02-28')`;
        await tx`update billings set remarks = 'x' where org_id = ${org} and billing_date between '2026-02-01' and '2026-02-28'`;
      }),
    ).rejects.toThrow(/is closed/);
    await expect(
      as(user.owner!, (tx) => tx`insert into journal_entries (org_id, entry_date, memo, kind) values (${org}, '2022-06-01', 'old', 'manual')`),
    ).rejects.toThrow(/before the books start date/);
  });

  it("the audit log cannot be altered", async () => {
    await expect(sql`update audit_log set reason = 'tamper' where id = (select min(id) from audit_log)`).rejects.toThrow(/append-only/);
  });
});
