import postgres from "postgres";

/**
 * One shared Postgres pool. bigint/numeric (centavos) come back as JS numbers and
 * `date` columns as "YYYY-MM-DD" strings, so no timezone shifting ever happens.
 */
function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  return postgres(url, {
    max: 10,
    prepare: false, // required by the Supabase transaction pooler
    onnotice: () => {},
    types: {
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      // numeric: sums of centavos and quantities. Values stay far below 2^53, so a JS number is exact.
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  });
}

type Pool = ReturnType<typeof createPool>;
const g = globalThis as unknown as { __paSql?: Pool };
const pool = (): Pool => (g.__paSql ??= createPool());

/**
 * The pool is created on first use, not at import time, so `next build` works
 * without a database (DATABASE_URL is only needed when the app runs).
 */
export const sql = new Proxy(function () {} as unknown as Pool, {
  apply: (_t, thisArg, args) => Reflect.apply(pool() as unknown as (...a: unknown[]) => unknown, thisArg, args),
  get: (_t, prop) => {
    const p = pool() as unknown as Record<PropertyKey, unknown>;
    const v = p[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(p) : v;
  },
}) as Pool;

export type Tx = postgres.TransactionSql<Record<string, unknown>>;

export interface DbUser {
  userId: string;
}

/**
 * Run `fn` in a transaction AS the signed-in user: the connection switches to the
 * `authenticated` role with the user's id in the JWT claims, so Row Level Security
 * decides what the query may read or change, exactly as it would through Supabase.
 */
export async function withUser<T>(user: DbUser, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    const claims = JSON.stringify({ sub: user.userId, role: "authenticated" });
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('request.jwt.claim.sub', ${user.userId}, true)`;
    await tx.unsafe("set local role authenticated");
    return fn(tx as unknown as Tx);
  })) as T;
}
