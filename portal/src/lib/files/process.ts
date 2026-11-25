import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { renderPreviews, processManualPreview, type RenderedPage } from "./render-preview";

/**
 * Runs on the server after a file has been uploaded (and when staff press
 * "Regenerate previews"):
 *   1. downloads it from the private bucket,
 *   2. records its size and SHA-256 checksum,
 *   3. makes the low-res watermarked previews and stores them in the
 *      `previews` bucket under the client's folder,
 *   4. sets the item thumbnail if this is the approved version.
 * Uses the admin client because it runs in the background; the caller has
 * already checked that the user may manage this file.
 */
export async function processUploadedFile(fileId: string): Promise<{ status: string; pages: number; reason?: string }> {
  const admin = supabaseAdmin();
  const { data: file } = await admin.from("files")
    .select("id, organization_id, artwork_version_id, bucket, storage_path, kind, artwork_versions(print_item_id, status)")
    .eq("id", fileId).maybeSingle();
  if (!file || file.kind !== "upload" || !file.bucket || !file.storage_path) return { status: "skipped", pages: 0 };

  const { data: blob, error } = await admin.storage.from(file.bucket).download(file.storage_path);
  if (error || !blob) {
    await setRendition(fileId, file.organization_id, 1, null, { status: "failed", error: "File not found in storage." });
    return { status: "failed", pages: 0, reason: "File not found in storage." };
  }
  const data = new Uint8Array(await blob.arrayBuffer());
  const sha256 = createHash("sha256").update(data).digest("hex");
  await admin.from("files").update({ sha256, size_bytes: data.byteLength }).eq("id", fileId);

  const result = await renderPreviews(data);
  const version = file.artwork_versions as unknown as { print_item_id: string; status: string } | null;
  const folder = previewFolder(file.organization_id, version?.print_item_id ?? null, file.artwork_version_id, fileId);

  if (result.status !== "ready") {
    await setRendition(fileId, file.organization_id, 1, null, { status: result.status, error: result.reason });
    return { status: result.status, pages: 0, reason: result.reason };
  }
  const sides = sideNames(result.pages.length);
  for (const page of result.pages) {
    await storePage(fileId, file.organization_id, folder, page, sides[page.pageNo - 1] ?? null, "auto");
  }
  // Re-checks which version is approved now (it may have been approved while we worked).
  if (version) await refreshThumbnail(version.print_item_id);
  return { status: "ready", pages: result.pages.length };
}

/** Staff upload their own preview image for files we can't render (PSD, ZIP, …). */
export async function storeManualPreview(fileId: string, image: Uint8Array, pageNo = 1): Promise<void> {
  const admin = supabaseAdmin();
  const { data: file } = await admin.from("files")
    .select("id, organization_id, artwork_version_id, artwork_versions(print_item_id, status)").eq("id", fileId).single();
  if (!file) throw new Error("File not found.");
  const version = file.artwork_versions as unknown as { print_item_id: string; status: string } | null;
  const page = await processManualPreview(image);
  const folder = previewFolder(file.organization_id, version?.print_item_id ?? null, file.artwork_version_id, fileId);
  await storePage(fileId, file.organization_id, folder, { ...page, pageNo }, pageNo === 1 ? "front" : pageNo === 2 ? "back" : null, "manual");
  if (version?.status === "approved") await refreshThumbnail(version.print_item_id);
}

function previewFolder(orgId: string, itemId: string | null, versionId: string | null, fileId: string) {
  return itemId && versionId ? `${orgId}/${itemId}/${versionId}/${fileId}` : `${orgId}/other/${fileId}`;
}

/** 1 page = front; 2 pages = front + back; more = numbered pages. */
function sideNames(count: number): (string | null)[] {
  if (count === 1) return ["front"];
  if (count === 2) return ["front", "back"];
  return Array.from({ length: count }, () => null);
}

async function storePage(fileId: string, orgId: string, folder: string, page: RenderedPage, side: string | null, source: "auto" | "manual") {
  const admin = supabaseAdmin();
  const path = `${folder}/p${page.pageNo}-${Date.now().toString(36)}.jpg`;
  const { error } = await admin.storage.from("previews").upload(path, page.jpg, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (error) {
    await setRendition(fileId, orgId, page.pageNo, side, { status: "failed", error: `Upload failed: ${error.message}` });
    return;
  }
  await setRendition(fileId, orgId, page.pageNo, side, {
    status: "ready", preview_path: path, width: page.width, height: page.height, source, error: null,
    page_width_pt: page.pageWidthPt ?? null, page_height_pt: page.pageHeightPt ?? null,
  });
}

/** Update the row for this page if it exists (other records point at it), otherwise create it. */
async function setRendition(fileId: string, orgId: string, pageNo: number, side: string | null, fields: Record<string, unknown>) {
  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("preview_renditions").select("id, preview_path").eq("file_id", fileId).eq("page_no", pageNo).maybeSingle();
  if (existing) {
    await admin.from("preview_renditions").update({ ...fields, side }).eq("id", existing.id);
    // the old image is replaced; remove it so storage doesn't fill up
    if (existing.preview_path && fields.preview_path && existing.preview_path !== fields.preview_path) {
      await admin.storage.from("previews").remove([existing.preview_path as string]);
    }
  } else {
    await admin.from("preview_renditions").insert({ file_id: fileId, organization_id: orgId, page_no: pageNo, side, ...fields });
  }
}

/** Thumbnail = page 1 of the first file of the approved version that has a preview. */
export async function refreshThumbnail(printItemId: string): Promise<void> {
  const admin = supabaseAdmin();
  const { data: item } = await admin.from("print_items").select("approved_version_id").eq("id", printItemId).single();
  if (!item?.approved_version_id) return;
  const { data: rows } = await admin.from("preview_renditions")
    .select("preview_path, page_no, files!inner(artwork_version_id, created_at, deleted_at)")
    .eq("files.artwork_version_id", item.approved_version_id).is("files.deleted_at", null)
    .eq("status", "ready").eq("page_no", 1).limit(10);
  const first = (rows ?? []).sort((a, b) =>
    String((a.files as unknown as { created_at: string }).created_at).localeCompare(String((b.files as unknown as { created_at: string }).created_at)))[0];
  await admin.from("print_items").update({ thumbnail_path: first?.preview_path ?? null }).eq("id", printItemId);
}
