/**
 * Export ALL data and files for ONE client company — for a handover, a
 * client's data request (Data Privacy Act), or an extra backup.
 *
 *   npm run export-client -- <organization-id> [output-folder]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
 * Writes: <folder>/data/<table>.json for every table, and
 *         <folder>/files/<bucket>/<path> for every stored file.
 * Google Drive links are listed in data/files.json (they are not downloaded).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const ORG_TABLES = [
  "organization_domains", "memberships", "staff_assignments", "invitations", "addresses",
  "quote_requests", "quotes", "quote_tiers", "quote_messages", "draft_orders",
  "print_items", "artwork_versions", "files", "preview_renditions", "color_standards", "color_standard_photos",
  "editable_templates", "template_fields", "revision_requests", "revision_markups", "revision_attachments",
  "template_field_values", "approvals", "past_estimates", "past_estimate_lines", "past_estimate_charges",
  "price_tiers", "price_history", "instant_quotes", "orders", "order_items", "order_item_prices",
  "order_financials", "order_status_events", "order_attachments", "payments", "payment_slips", "audit_logs",
];

async function main() {
  const [orgId, outArg] = process.argv.slice(2);
  if (!orgId || !/^[0-9a-f-]{36}$/.test(orgId)) {
    console.error("Usage: npm run export-client -- <organization-id> [output-folder]");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  const sb = createClient(url, secret, { auth: { persistSession: false } });

  const { data: org, error } = await sb.from("organizations").select("*").eq("id", orgId).single();
  if (error || !org) throw new Error(`Client ${orgId} not found`);
  const stamp = new Date().toISOString().slice(0, 10);
  const out = outArg ?? `exports/${org.slug}-${stamp}`;
  await mkdir(path.join(out, "data"), { recursive: true });
  await writeFile(path.join(out, "data", "organization.json"), JSON.stringify(org, null, 2));

  // People: only the profiles that belong to this company.
  const { data: members } = await sb.from("memberships").select("profile_id").eq("organization_id", orgId);
  const ids = (members ?? []).map((m) => m.profile_id);
  const { data: profiles } = ids.length
    ? await sb.from("profiles").select("id, email, full_name, phone, job_title, is_active, last_login_at, created_at").in("id", ids)
    : { data: [] };
  await writeFile(path.join(out, "data", "profiles.json"), JSON.stringify(profiles, null, 2));

  // order_item_prices / order_financials are keyed by order; they carry organization_id too.
  for (const table of ORG_TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: e } = await sb.from(table).select("*").eq("organization_id", orgId).range(from, from + 999);
      if (e) { console.warn(`  ! ${table}: ${e.message}`); break; }
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    await writeFile(path.join(out, "data", `${table}.json`), JSON.stringify(rows, null, 2));
    console.log(`  ${table}: ${rows.length}`);
  }

  // Files from every bucket under <org>/...
  let count = 0;
  for (const bucket of ["print-files", "previews", "attachments"]) {
    const queue = [orgId];
    while (queue.length) {
      const prefix = queue.shift()!;
      const { data: entries } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
      for (const entry of entries ?? []) {
        const full = `${prefix}/${entry.name}`;
        if (!entry.id) { queue.push(full); continue; } // folder
        const { data: blob, error: dErr } = await sb.storage.from(bucket).download(full);
        if (dErr || !blob) { console.warn(`  ! ${bucket}/${full}: ${dErr?.message}`); continue; }
        const target = path.join(out, "files", bucket, full);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, Buffer.from(await blob.arrayBuffer()));
        count++;
      }
    }
  }
  console.log(`\nDone: ${out} (${count} files). Store it somewhere safe — it contains personal data.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
