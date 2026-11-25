import { Pool, type PoolClient } from "pg";

/**
 * Test helpers that act exactly like a browser calling the Supabase API:
 * PostgREST switches to the `authenticated` role and puts the user's JWT
 * claims in `request.jwt.claims`. We do the same inside a transaction that
 * is always rolled back, so tests never change the seed data.
 */
export const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/pa_test",
  max: 4,
});

export const U = {
  admin: "10000000-0000-4000-8000-000000000001",
  sales1: "10000000-0000-4000-8000-000000000002", // assigned to ABC
  sales2: "10000000-0000-4000-8000-000000000003", // assigned to Sunrise
  production: "10000000-0000-4000-8000-000000000004",
  aAdmin: "10000000-0000-4000-8000-0000000000a1",
  aBuyer: "10000000-0000-4000-8000-0000000000a2",
  aViewer: "10000000-0000-4000-8000-0000000000a3",
  bAdmin: "10000000-0000-4000-8000-0000000000b1",
  bBuyer: "10000000-0000-4000-8000-0000000000b2",
  bViewer: "10000000-0000-4000-8000-0000000000b3",
} as const;

export const ORG_A = "20000000-0000-4000-8000-00000000000a";
export const ORG_B = "20000000-0000-4000-8000-00000000000b";

type Who = { id: string; aal?: "aal1" | "aal2" } | "anon";

export async function as<T>(who: Who, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    if (who === "anon") {
      await c.query("set local role anon");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ role: "anon" }),
      ]);
    } else {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: who.id, role: "authenticated", aal: who.aal ?? "aal2" }),
      ]);
    }
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => undefined);
    c.release();
  }
}

/** Runs SQL as the database owner (like the server with the service key). */
export async function asOwner<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => undefined);
    c.release();
  }
}

/** Inside an asOwner() transaction: become a signed-in user from here on. */
export async function becomeUser(c: PoolClient, id: string, aal: "aal1" | "aal2" = "aal2") {
  await c.query("set local role authenticated");
  await c.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: id, role: "authenticated", aal }),
  ]);
}

/** Every table in `public`, and which of them carry organization_id. */
export async function listTables(): Promise<{ name: string; hasOrg: boolean }[]> {
  const { rows } = await pool.query<{ name: string; has_org: boolean }>(`
    select t.tablename as name,
           exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = t.tablename
                      and c.column_name = 'organization_id') as has_org
      from pg_tables t where t.schemaname = 'public' order by 1`);
  return rows.map((r) => ({ name: r.name, hasOrg: r.has_org }));
}
