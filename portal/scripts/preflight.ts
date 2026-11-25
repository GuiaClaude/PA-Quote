/**
 * GO-LIVE CHECK. Run before launch (and after any settings change):
 *
 *   npm run preflight                 (reads .env.local)
 *
 * It checks the environment variables, that the database has every migration,
 * the storage buckets, and the demo-data and 2-step-verification settings.
 * It changes nothing.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
  }
}
const e = process.env;
let problems = 0, warnings = 0;
const ok = (s: string) => console.log(`  ✅ ${s}`);
const bad = (s: string) => { problems++; console.log(`  ❌ ${s}`); };
const warn = (s: string) => { warnings++; console.log(`  ⚠️  ${s}`); };

console.log("\nEnvironment variables");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SITE_URL", "DEVICE_HASH_SECRET", "RESEND_API_KEY"]) (e[k] ? ok(k) : bad(`${k} is missing`));
if (e.NEXT_PUBLIC_SITE_URL && !e.NEXT_PUBLIC_SITE_URL.startsWith("https://")) bad("NEXT_PUBLIC_SITE_URL must start with https:// on the live app");
if ((e.DEVICE_HASH_SECRET ?? "").startsWith("dev-only") || (e.DEVICE_HASH_SECRET ?? "").length < 32) bad("DEVICE_HASH_SECRET must be a long random value (32+ characters)");
e.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? ok("Turnstile bot check") : warn("NEXT_PUBLIC_TURNSTILE_SITE_KEY not set: no bot check on sign-in");
e.NEXT_PUBLIC_VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY ? ok("Push notification keys") : warn("VAPID keys not set: push notifications are off (run: npm run push:keys)");
e.ANTHROPIC_API_KEY ? warn("ANTHROPIC_API_KEY is set: AI auto-fill costs money per use once switched on in Settings") : ok("AI auto-fill key not set (paid feature off)");

async function main() {
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SECRET_KEY) return;
  const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

  console.log("\nDatabase");
  const probes: [string, () => PromiseLike<{ error: unknown }>][] = [
    ["base tables (0001–0010)", () => sb.from("settings").select("key").limit(1)],
    ["orders and quotes (0015)", () => sb.from("doc_counters").select("kind").limit(1)],
    ["instant quotes (0016)", () => sb.from("instant_quotes").select("lead_time_text").limit(1)],
    ["push (0018)", () => sb.from("notifications").select("pushed_at").limit(1)],
  ];
  for (const [name, run] of probes) ((await run()).error ? bad(`${name}: missing — apply the migrations`) : ok(name));
  const local = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).length;
  console.log(`     (${local} migration files in supabase/migrations)`);

  const { data: demo } = await sb.from("organizations").select("name").ilike("name", "%demo%").limit(1);
  const { data: demoUsers } = await sb.from("profiles").select("email").like("email", "%-demo.test").limit(1);
  demo?.length || demoUsers?.length ? bad("Demo data found. Never load the demo seed on the live project.") : ok("No demo data");

  const { data: sec } = await sb.from("settings").select("value").eq("key", "security").maybeSingle();
  (sec?.value as { require_mfa?: boolean } | undefined)?.require_mfa ? ok("2-step verification required") : bad("2-step verification is OFF — turn it on in Settings → Sign-in & security");
  const { data: pay } = await sb.from("settings").select("value").eq("key", "payment_instructions").maybeSingle();
  JSON.stringify(pay?.value ?? {}).includes("Placeholder") || !(pay?.value as { bank_accounts?: unknown[] } | undefined)?.bank_accounts?.length
    ? warn("Payment instructions still look like placeholders (Settings → Payment instructions)") : ok("Payment instructions filled in");
  const { count: admins } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("staff_role", "pa_admin").eq("is_active", true);
  admins ? ok(`${admins} active management account(s)`) : bad("No management (pa_admin) account yet — see README → First management account");
  const { data: rates } = await sb.from("inflation_rates").select("year").eq("needs_confirmation", true);
  rates?.length ? warn(`Inflation for ${rates.map((r) => r.year).join(", ")} still marked "please confirm" (Pricing page)`) : ok("Inflation table confirmed");

  console.log("\nStorage");
  const { data: buckets } = await sb.storage.listBuckets();
  for (const b of ["print-files", "previews", "attachments", "assets", "brand"]) {
    const found = buckets?.find((x) => x.id === b);
    if (!found) bad(`bucket "${b}" missing — apply the migrations`);
    else if (b !== "brand" && found.public) bad(`bucket "${b}" must be PRIVATE`);
    else ok(`bucket "${b}"${b === "brand" ? " (public: logo only)" : " (private)"}`);
  }
}

main().catch((err) => bad(`Could not reach Supabase: ${err instanceof Error ? err.message : err}`)).finally(() => {
  console.log(`\n${problems ? `❌ ${problems} problem(s) to fix` : "✅ Ready"}${warnings ? `, ⚠️ ${warnings} warning(s)` : ""}.\n`);
  process.exit(problems ? 1 : 0);
});
