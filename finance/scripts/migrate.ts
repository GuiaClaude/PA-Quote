/**
 * Applies database migrations in order. Local usage:
 *   pnpm db:migrate            apply pending migrations
 *   pnpm db:migrate --reset    drop and recreate the local database first (LOCAL ONLY)
 * On Supabase, run the files in supabase/migrations with the Supabase CLI instead.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { loadEnv } from "./env";

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const reset = process.argv.includes("--reset");
const root = path.resolve(__dirname, "..");

async function main() {
  const u = new URL(url!);
  const dbName = u.pathname.slice(1);
  if (reset) {
    if (!["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("--reset is only allowed on a local database");
    const admin = postgres({ ...connOpts(u), database: "postgres" });
    await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
    await admin.unsafe(`create database "${dbName}"`);
    await admin.end();
  }
  const sql = postgres(url!, { onnotice: () => {} });
  await sql`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`;
  // A plain Postgres (local or the Docker preview) lacks Supabase's auth schema: add the small stand-in.
  // On Supabase auth.uid() already exists, so the shim is never applied there.
  const [authCheck] = await sql<{ has_auth: boolean }[]>`select to_regprocedure('auth.uid()') is not null as has_auth`;
  if (!authCheck?.has_auth) {
    await sql.unsafe(readFileSync(path.join(root, "db/local-supabase-shim.sql"), "utf8"));
  }
  const files = readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await sql<{ name: string }[]>`select name from public._migrations`).map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    process.stdout.write(`Applying ${f} … `);
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(path.join(root, "supabase/migrations", f), "utf8"));
      await tx`insert into public._migrations (name) values (${f})`;
    });
    console.log("done");
  }
  await sql.end();
}

function connOpts(u: URL) {
  return { host: u.hostname, port: Number(u.port || 5432), username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
