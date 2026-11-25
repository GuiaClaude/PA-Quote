"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { specSignature, specSchema } from "@/lib/specs";
import { cellList, importRowSchema, MAX_IMPORT_ROWS } from "@/lib/import/rows";

export type ImportReport = { error?: string; clientsCreated: string[]; itemsCreated: number; skipped: string[]; problems: string[] };

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "client";
}

/**
 * Create clients (if new) and Print Items from CSV rows. Everything runs as
 * the signed-in staff user, so database rules still apply (sales staff only
 * touch their own clients). Items with an existing code for the same client
 * are skipped, so importing the same file twice is safe.
 */
export async function importPrintItems(rawRows: unknown[]): Promise<ImportReport> {
  const report: ImportReport = { clientsCreated: [], itemsCreated: 0, skipped: [], problems: [] };
  const me = await getSessionUser();
  if (!me || (me.staffRole !== "pa_admin" && me.staffRole !== "pa_sales")) return { ...report, error: "Only management and sales can import." };
  if (!Array.isArray(rawRows) || rawRows.length === 0) return { ...report, error: "The file has no rows." };
  if (rawRows.length > MAX_IMPORT_ROWS) return { ...report, error: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` };

  const sb = await supabaseServer();
  const [{ data: orgs }, { data: cats }] = await Promise.all([
    sb.from("organizations").select("id, name").is("deleted_at", null),
    sb.from("product_categories").select("id, name"),
  ]);
  const orgByName = new Map((orgs ?? []).map((o) => [String(o.name).toLowerCase(), o.id as string]));
  const catByName = new Map((cats ?? []).map((c) => [String(c.name).toLowerCase(), c.id as string]));

  for (const [i, raw] of rawRows.entries()) {
    const line = i + 2; // row 1 is the header
    const p = importRowSchema.safeParse(raw);
    if (!p.success) { report.problems.push(`Row ${line}: ${p.error.issues[0]?.message}`); continue; }
    const r = p.data;

    let orgId = orgByName.get(r.client_name.toLowerCase());
    if (!orgId) {
      const { data: org, error } = await sb.from("organizations").insert({
        name: r.client_name, slug: `${slugify(r.client_name)}-${Math.random().toString(36).slice(2, 6)}`,
        billing_name: r.client_billing_name || r.client_name, tin: r.client_tin || null, created_by: me.id,
      }).select("id").single();
      if (error || !org) { report.problems.push(`Row ${line}: could not create client “${r.client_name}”.`); continue; }
      orgId = org.id as string;
      orgByName.set(r.client_name.toLowerCase(), orgId);
      report.clientsCreated.push(r.client_name);
      await sb.from("staff_assignments").insert({ organization_id: orgId, staff_profile_id: me.id, is_primary: true });
      const domains = cellList(r.client_email_domains).map((d) => d.toLowerCase().replace(/^@/, "")).filter((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d));
      if (domains.length) await sb.from("organization_domains").insert(domains.map((d) => ({ organization_id: orgId, domain: d })));
    }

    if (r.item_code) {
      const { data: existing } = await sb.from("print_items").select("id").eq("organization_id", orgId).eq("code", r.item_code).is("deleted_at", null).maybeSingle();
      if (existing) { report.skipped.push(`${r.item_code} (${r.client_name}) already exists`); continue; }
    }

    const spec = specSchema.parse({
      size: r.size, material: r.material, gsm: r.gsm ? Number(r.gsm) : null, colors: r.colors,
      finishing: cellList(r.finishing), packaging: r.packaging, notes: r.notes,
    });
    const { data: item, error: itemErr } = await sb.from("print_items").insert({
      organization_id: orgId, name: r.item_name, code: r.item_code || null,
      category_id: r.category ? catByName.get(r.category.toLowerCase()) ?? null : null,
      tags: cellList(r.tags).map((t) => t.toLowerCase()), spec, spec_signature: specSignature(spec), created_by: me.id,
    }).select("id").single();
    if (itemErr || !item) { report.problems.push(`Row ${line}: you can't add items for “${r.client_name}”.`); continue; }
    const { data: versionId } = await sb.rpc("create_artwork_version", { p_print_item_id: item.id, p_change_notes: "Imported from old records" });
    if (r.drive_link && versionId) {
      await sb.from("files").insert({
        organization_id: orgId, artwork_version_id: versionId, purpose: "artwork", kind: "drive_link",
        external_url: r.drive_link, label: r.drive_label || "Google Drive link", uploaded_by: me.id,
      });
    }
    report.itemsCreated++;
  }

  await audit({ action: "import.print_items", actorId: me.id, actorEmail: me.email, meta: { rows: rawRows.length, created: report.itemsCreated, clients: report.clientsCreated, skipped: report.skipped.length, problems: report.problems.length } });
  revalidatePath("/staff/items");
  return report;
}

export type CodeTarget = { code: string; printItemId: string; organizationId: string; versionId: string; itemName: string; client: string };

/**
 * For bulk file upload: find the items by code and the draft version to put
 * files in. If the newest version is already approved, a new draft version
 * is created (the approved one is never changed).
 */
export async function resolveItemCodes(codes: string[]): Promise<{ targets: CodeTarget[]; error?: string }> {
  const me = await getSessionUser();
  if (!me || (me.staffRole !== "pa_admin" && me.staffRole !== "pa_sales")) return { targets: [], error: "Not allowed." };
  const clean = [...new Set(codes.map((c) => c.trim()).filter((c) => c && c.length <= 60))].slice(0, 500);
  if (!clean.length) return { targets: [] };
  const sb = await supabaseServer();
  const { data } = await sb.from("print_items")
    .select("id, code, name, organization_id, organizations(name), artwork_versions!artwork_versions_print_item_id_fkey(id, version_no, status)")
    .in("code", clean).is("deleted_at", null);
  const targets: CodeTarget[] = [];
  for (const it of data ?? []) {
    const versions = (it.artwork_versions as unknown as { id: string; version_no: number; status: string }[]).sort((a, b) => b.version_no - a.version_no);
    let versionId = versions[0]?.status === "draft" ? versions[0].id : null;
    if (!versionId) {
      const { data: v } = await sb.rpc("create_artwork_version", { p_print_item_id: it.id, p_change_notes: "Imported files" });
      versionId = (v as string) ?? null;
    }
    if (versionId) targets.push({ code: it.code as string, printItemId: it.id as string, organizationId: it.organization_id as string, versionId, itemName: it.name as string, client: (it.organizations as unknown as { name: string }).name });
  }
  return { targets };
}

export async function listImportCodes(): Promise<string[]> {
  const me = await getSessionUser();
  if (!me?.staffRole || me.staffRole === "pa_production") return [];
  const sb = await supabaseServer();
  const { data } = await sb.from("print_items").select("code").not("code", "is", null).is("deleted_at", null).limit(5000);
  return (data ?? []).map((r) => r.code as string);
}

export async function approveImportedVersions(versionIds: string[]): Promise<{ approved: number; problems: string[] }> {
  const { approveVersion } = await import("./print-items");
  const problems: string[] = [];
  let approved = 0;
  for (const id of versionIds.filter((x) => z.uuid().safeParse(x).success).slice(0, 500)) {
    const r = await approveVersion(id);
    if (r?.error) problems.push(r.error); else approved++;
  }
  return { approved, problems };
}
