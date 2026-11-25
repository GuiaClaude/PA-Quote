"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { requestMeta } from "@/lib/request-meta";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { specSchema, specSignature, splitList } from "@/lib/specs";
import { isAllowedArtwork, isDriveUrl, PHOTO_EXTENSIONS, extensionOf } from "@/lib/files/types";
import { processUploadedFile, refreshThumbnail, storeManualPreview } from "@/lib/files/process";
import type { ActionState } from "./account";

const uuid = z.uuid();

async function requireManager() {
  const me = await getSessionUser();
  if (!me || (me.staffRole !== "pa_admin" && me.staffRole !== "pa_sales") || me.needsMfa) throw new Error("Not allowed.");
  return me;
}

function readItemForm(formData: FormData) {
  const f = Object.fromEntries(formData) as Record<string, string>;
  const gsm = f.gsm?.trim() ? Number(f.gsm) : null;
  const spec = specSchema.safeParse({
    size: f.size, material: f.material, gsm: Number.isFinite(gsm) ? gsm : null, colors: f.colors,
    finishing: splitList(f.finishing ?? ""), packaging: f.packaging, notes: f.notes,
  });
  const base = z.object({
    name: z.string().trim().min(2, "Enter the item name.").max(160),
    code: z.string().trim().max(60).optional(),
    categoryId: z.union([uuid, z.literal("")]).optional(),
    productId: z.union([uuid, z.literal("")]).optional(),
    tags: z.string().max(300).optional(),
  }).safeParse(f);
  return { spec, base };
}

/** Create a Print Item for a client, with an empty version 1 ready for files. */
export async function createPrintItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireManager().catch(() => null);
  if (!me) return { error: "Only management and sales can add Print Items." };
  const orgId = String(formData.get("organizationId") ?? "");
  if (!uuid.safeParse(orgId).success) return { error: "Choose the client." };
  const { spec, base } = readItemForm(formData);
  if (!base.success) return { error: base.error.issues[0]?.message };
  if (!spec.success) return { error: `Check the specs: ${spec.error.issues[0]?.path.join(".")}` };

  const sb = await supabaseServer();
  const { data: item, error } = await sb.from("print_items").insert({
    organization_id: orgId, name: base.data.name, code: base.data.code || null,
    category_id: base.data.categoryId || null, product_id: base.data.productId || null,
    tags: splitList(base.data.tags ?? "").map((t) => t.toLowerCase()),
    spec: spec.data, spec_signature: specSignature(spec.data), created_by: me.id,
  }).select("id").single();
  if (error || !item) return { error: "You can't add items for this client." };
  const { error: vErr } = await sb.rpc("create_artwork_version", { p_print_item_id: item.id, p_change_notes: "First version" });
  if (vErr) return { error: vErr.message };
  await audit({ action: "print_item.created", actorId: me.id, actorEmail: me.email, organizationId: orgId, entityType: "print_item", entityId: item.id, meta: { name: base.data.name } });
  redirect(`/staff/items/${item.id}?created=1`);
}

export async function updatePrintItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireManager().catch(() => null);
  if (!me) return { error: "Not allowed." };
  const id = String(formData.get("printItemId") ?? "");
  const { spec, base } = readItemForm(formData);
  if (!uuid.safeParse(id).success || !base.success) return { error: base.success ? "Invalid item." : base.error.issues[0]?.message };
  if (!spec.success) return { error: `Check the specs: ${spec.error.issues[0]?.path.join(".")}` };
  const sb = await supabaseServer();
  const { data: before } = await sb.from("print_items").select("organization_id, spec, name").eq("id", id).maybeSingle();
  const { data, error } = await sb.from("print_items").update({
    name: base.data.name, code: base.data.code || null, category_id: base.data.categoryId || null, product_id: base.data.productId || null,
    tags: splitList(base.data.tags ?? "").map((t) => t.toLowerCase()), spec: spec.data, spec_signature: specSignature(spec.data),
  }).eq("id", id).select("id").maybeSingle();
  if (error || !data) return { error: "Could not save." };
  await audit({ action: "print_item.updated", actorId: me.id, organizationId: before?.organization_id, entityType: "print_item", entityId: id, meta: { before: before?.spec, after: spec.data } });
  revalidatePath(`/staff/items/${id}`);
  return { message: "Saved." };
}

export async function createVersion(printItemId: string, notes: string): Promise<ActionState> {
  const me = await requireManager().catch(() => null);
  if (!me || !uuid.safeParse(printItemId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("create_artwork_version", { p_print_item_id: printItemId, p_change_notes: notes.slice(0, 500) });
  if (error) return { error: error.message };
  await audit({ action: "artwork.version_created", actorId: me.id, entityType: "artwork_version", entityId: data as string, meta: { notes } });
  revalidatePath(`/staff/items/${printItemId}`);
  return { message: "New version created. Add its files, then approve it." };
}

export async function approveVersion(versionId: string): Promise<ActionState> {
  const me = await requireManager().catch(() => null);
  if (!me || !uuid.safeParse(versionId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { ip, userAgent } = await requestMeta();
  const { error } = await sb.rpc("approve_artwork_version", { p_version_id: versionId, p_ip: ip, p_user_agent: userAgent });
  if (error) return { error: error.message };
  const { data: v } = await sb.from("artwork_versions").select("print_item_id, organization_id, version_no").eq("id", versionId).single();
  if (!v) return { message: "Approved." };
  await refreshThumbnail(v.print_item_id);
  await audit({ action: "artwork.approved", actorId: me.id, actorEmail: me.email, organizationId: v.organization_id, entityType: "artwork_version", entityId: versionId, meta: { version_no: v.version_no } });
  revalidatePath(`/staff/items/${v.print_item_id}`);
  return { message: `Version ${v.version_no} is now Approved for Print and locked.` };
}

/** Same file (same SHA-256) already stored for this client? */
export async function findDuplicates(organizationId: string, sha256: string): Promise<{ name: string; item: string }[]> {
  await requireManager();
  if (!uuid.safeParse(organizationId).success || !/^[0-9a-f]{64}$/.test(sha256)) return [];
  const sb = await supabaseServer();
  const { data } = await sb.from("files")
    .select("original_name, artwork_versions(version_no, print_items(name))")
    .eq("organization_id", organizationId).eq("sha256", sha256).is("deleted_at", null).limit(5);
  return (data ?? []).map((f) => {
    const v = f.artwork_versions as unknown as { version_no: number; print_items: { name: string } } | null;
    return { name: (f.original_name as string) ?? "file", item: v ? `${v.print_items.name} · v${v.version_no}` : "another record" };
  });
}

const uploadInput = z.object({
  printItemId: uuid,
  versionId: uuid.optional(),
  purpose: z.enum(["artwork", "color_standard_photo"]),
  path: z.string().min(10).max(400),
  originalName: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mime: z.string().max(120).optional(),
});

/**
 * The browser has uploaded a file straight to the private "print-files"
 * bucket (storage RLS checked it). Record it, then make previews in the
 * background.
 */
export async function registerUpload(input: z.infer<typeof uploadInput>): Promise<ActionState & { fileId?: string }> {
  const me = await requireManager().catch(() => null);
  if (!me) return { error: "Not allowed." };
  const p = uploadInput.safeParse(input);
  if (!p.success) return { error: "Invalid upload." };
  const d = p.data;
  const maxMb = (await getSetting("uploads")).max_file_mb;
  if (d.size > maxMb * 1024 * 1024) return { error: `Files must be ${maxMb} MB or smaller.` };
  const okType = d.purpose === "artwork" ? isAllowedArtwork(d.originalName) : (PHOTO_EXTENSIONS as readonly string[]).includes(extensionOf(d.originalName));
  if (!okType) return { error: "This file type isn't accepted." };

  const sb = await supabaseServer();
  const { data: item } = await sb.from("print_items").select("id, organization_id").eq("id", d.printItemId).maybeSingle();
  if (!item) return { error: "Print Item not found." };
  if (!d.path.startsWith(`${item.organization_id}/${item.id}/`) || d.path.includes("..")) return { error: "Invalid upload path." };

  // The object must really be there.
  const dir = d.path.slice(0, d.path.lastIndexOf("/"));
  const name = d.path.slice(d.path.lastIndexOf("/") + 1);
  const { data: listing } = await supabaseAdmin().storage.from("print-files").list(dir, { search: name, limit: 1 });
  if (!listing?.some((o) => o.name === name)) return { error: "Upload didn't finish. Please try again." };

  const { data: file, error } = await sb.from("files").insert({
    organization_id: item.organization_id, artwork_version_id: d.purpose === "artwork" ? d.versionId ?? null : null,
    purpose: d.purpose, kind: "upload", bucket: "print-files", storage_path: d.path, original_name: d.originalName,
    mime_type: d.mime ?? null, size_bytes: d.size, uploaded_by: me.id, label: null,
  }).select("id").single();
  if (error || !file) return { error: error?.message.includes("locked") ? error.message : "Could not save the file record." };

  if (d.purpose === "color_standard_photo") {
    const { data: cs } = await sb.from("color_standards").select("id").eq("print_item_id", item.id).is("deleted_at", null).maybeSingle();
    if (cs) await sb.from("color_standard_photos").insert({ organization_id: item.organization_id, color_standard_id: cs.id, file_id: file.id });
  }
  await audit({ action: "file.uploaded", actorId: me.id, actorEmail: me.email, organizationId: item.organization_id, entityType: "file", entityId: file.id, meta: { name: d.originalName, size: d.size, version_id: d.versionId } });
  after(async () => { await processUploadedFile(file.id); });
  revalidatePath(`/staff/items/${item.id}`);
  return { message: "Uploaded. Making the preview…", fileId: file.id };
}

/** Polled by the uploader until previews are done. */
export async function previewStatus(fileIds: string[]): Promise<Record<string, string>> {
  await requireManager();
  const ids = fileIds.filter((x) => uuid.safeParse(x).success).slice(0, 50);
  if (!ids.length) return {};
  const sb = await supabaseServer();
  const { data } = await sb.from("preview_renditions").select("file_id, status").in("file_id", ids);
  const out: Record<string, string> = Object.fromEntries(ids.map((id) => [id, "pending"]));
  for (const r of data ?? []) out[r.file_id as string] = r.status as string;
  return out;
}

export async function addDriveLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireManager().catch(() => null);
  if (!me) return { error: "Not allowed." };
  const versionId = String(formData.get("versionId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim().slice(0, 160);
  if (!uuid.safeParse(versionId).success) return { error: "Invalid version." };
  if (!isDriveUrl(url)) return { error: "Paste a Google Drive link (https://drive.google.com/…)." };
  const sb = await supabaseServer();
  const { data: v } = await sb.from("artwork_versions").select("organization_id, print_item_id").eq("id", versionId).maybeSingle();
  if (!v) return { error: "Version not found." };
  const { error } = await sb.from("files").insert({
    organization_id: v.organization_id, artwork_version_id: versionId, purpose: "artwork", kind: "drive_link",
    external_url: url, label: label || "Google Drive link", uploaded_by: me.id,
  });
  if (error) return { error: error.message.includes("locked") ? error.message : "Could not add the link." };
  await audit({ action: "file.drive_link_added", actorId: me.id, organizationId: v.organization_id, entityType: "artwork_version", entityId: versionId, meta: { url } });
  revalidatePath(`/staff/items/${v.print_item_id}`);
  return { message: "Drive link added." };
}

async function fileAction(fileId: string, action: string, patch: Record<string, unknown> | null, then?: () => Promise<void>): Promise<ActionState> {
  const me = await requireManager().catch(() => null);
  if (!me || !uuid.safeParse(fileId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { data: f } = await sb.from("files").select("id, organization_id, artwork_versions(print_item_id)").eq("id", fileId).maybeSingle();
  if (!f) return { error: "File not found." };
  if (patch) {
    const { error } = await sb.from("files").update(patch).eq("id", fileId);
    if (error) return { error: error.message.includes("approved") ? error.message : "Could not update the file." };
  }
  if (then) after(then);
  await audit({ action, actorId: me.id, organizationId: f.organization_id, entityType: "file", entityId: fileId });
  const itemId = (f.artwork_versions as unknown as { print_item_id: string } | null)?.print_item_id;
  if (itemId) revalidatePath(`/staff/items/${itemId}`);
  return { message: "Done." };
}

export async function markCopiedToArchive(fileId: string) {
  const me = await getSessionUser();
  return fileAction(fileId, "file.marked_copied", { copied_to_archive_at: new Date().toISOString(), copied_to_archive_by: me?.id });
}
export async function removeFile(fileId: string) {
  return fileAction(fileId, "file.removed", { deleted_at: new Date().toISOString() });
}
export async function regeneratePreview(fileId: string) {
  return fileAction(fileId, "file.preview_regenerated", null, async () => { await processUploadedFile(fileId); });
}

/** Staff uploaded a preview image (to a temp path) for a file we can't render. */
export async function applyManualPreview(fileId: string, tempPath: string): Promise<ActionState> {
  const me = await requireManager().catch(() => null);
  if (!me || !uuid.safeParse(fileId).success) return { error: "Not allowed." };
  const sb = await supabaseServer();
  const { data: f } = await sb.from("files").select("organization_id, artwork_versions(print_item_id)").eq("id", fileId).maybeSingle();
  if (!f || !tempPath.startsWith(`${f.organization_id}/`) || tempPath.includes("..")) return { error: "Not allowed." };
  const admin = supabaseAdmin();
  const { data: blob } = await admin.storage.from("print-files").download(tempPath);
  if (!blob) return { error: "Upload didn't finish. Please try again." };
  try {
    await storeManualPreview(fileId, new Uint8Array(await blob.arrayBuffer()));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not use this image." };
  } finally {
    await admin.storage.from("print-files").remove([tempPath]);
  }
  await audit({ action: "file.manual_preview", actorId: me.id, organizationId: f.organization_id, entityType: "file", entityId: fileId });
  const itemId = (f.artwork_versions as unknown as { print_item_id: string } | null)?.print_item_id;
  if (itemId) revalidatePath(`/staff/items/${itemId}`);
  return { message: "Preview saved." };
}

const colorForm = z.object({
  printItemId: uuid,
  pantone: z.string().max(400).optional(),
  cmyk: z.string().max(1000).optional(),
  paperStock: z.string().max(160).optional(),
  pressMachine: z.string().max(160).optional(),
  notes: z.string().max(2000).optional(),
  approvedByName: z.string().max(160).optional(),
  approvedAt: z.string().max(20).optional(),
});

/** CMYK targets typed as "ABC Blue: 100 72 0 6" one per line. */
function parseCmyk(text: string): Record<string, { c: number; m: number; y: number; k: number }> {
  const out: Record<string, { c: number; m: number; y: number; k: number }> = {};
  for (const line of text.split("\n")) {
    const m = /^(.+?)[:=]\s*(\d{1,3})[\s,/]+(\d{1,3})[\s,/]+(\d{1,3})[\s,/]+(\d{1,3})\s*$/.exec(line.trim());
    if (m) out[m[1]!.trim()] = { c: +m[2]!, m: +m[3]!, y: +m[4]!, k: +m[5]! };
  }
  return out;
}

export async function saveColorStandard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireManager().catch(() => null);
  if (!me) return { error: "Not allowed." };
  const p = colorForm.safeParse(Object.fromEntries(formData));
  if (!p.success) return { error: "Check the colour standard fields." };
  const d = p.data;
  const sb = await supabaseServer();
  const { data: item } = await sb.from("print_items").select("id, organization_id, color_standard_id").eq("id", d.printItemId).maybeSingle();
  if (!item) return { error: "Print Item not found." };
  const row = {
    organization_id: item.organization_id, print_item_id: item.id,
    pantone_refs: splitList(d.pantone ?? ""), cmyk_targets: parseCmyk(d.cmyk ?? ""),
    paper_stock: d.paperStock || null, press_machine: d.pressMachine || null, notes: d.notes || null,
    approved_by_name: d.approvedByName || null, approved_at: d.approvedAt ? new Date(`${d.approvedAt}T12:00:00+08:00`).toISOString() : null,
  };
  if (item.color_standard_id) {
    const { error } = await sb.from("color_standards").update(row).eq("id", item.color_standard_id);
    if (error) return { error: "Could not save." };
  } else {
    const { data: cs, error } = await sb.from("color_standards").insert(row).select("id").single();
    if (error || !cs) return { error: "Could not save." };
    await sb.from("print_items").update({ color_standard_id: cs.id }).eq("id", item.id);
  }
  await audit({ action: "color_standard.saved", actorId: me.id, organizationId: item.organization_id, entityType: "print_item", entityId: item.id, meta: row });
  revalidatePath(`/staff/items/${item.id}`);
  return { message: "Colour standard saved." };
}
