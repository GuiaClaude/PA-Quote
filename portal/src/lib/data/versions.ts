import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { signPreviews } from "./previews";
import type { CanvasField } from "@/components/templates/template-canvas";

export type PageWithRendition = {
  id: string; url: string; width: number; height: number; pageNo: number; side: string | null; fileName: string; pageWidthPt: number | null;
};

/**
 * Preview pages of one artwork version, for the signed-in user. The version
 * must be visible to them (clients: approved, superseded or a proof sent to
 * them — enforced by the database). File ids come from the admin client only
 * to keep the pages in upload order; clients never receive file rows.
 */
export async function versionPages(sb: SupabaseClient, versionId: string): Promise<PageWithRendition[]> {
  const { data: v } = await sb.from("artwork_versions").select("id").eq("id", versionId).maybeSingle();
  if (!v) return [];
  const { data: files } = await supabaseAdmin().from("files").select("id, original_name, created_at")
    .eq("artwork_version_id", versionId).is("deleted_at", null).eq("kind", "upload").order("created_at");
  const ids = (files ?? []).map((f) => f.id as string);
  if (!ids.length) return [];
  const { data: rows } = await sb.from("preview_renditions")
    .select("id, file_id, page_no, side, preview_path, width, height, page_width_pt").in("file_id", ids).eq("status", "ready");
  const urls = await signPreviews(sb, (rows ?? []).map((r) => r.preview_path as string));
  const order = new Map(ids.map((id, i) => [id, i]));
  const multi = ids.length > 1;
  const nameOf = new Map((files ?? []).map((f) => [f.id as string, (f.original_name as string) ?? "Artwork"]));
  return (rows ?? [])
    .filter((r) => urls[r.preview_path as string])
    .sort((a, b) => (order.get(a.file_id as string)! - order.get(b.file_id as string)!) || (a.page_no as number) - (b.page_no as number))
    .map((r) => ({
      id: r.id as string, url: urls[r.preview_path as string]!, width: r.width as number, height: r.height as number,
      pageNo: r.page_no as number, side: r.side as string | null, fileName: multi ? nameOf.get(r.file_id as string)! : "Artwork",
      pageWidthPt: r.page_width_pt ? Number(r.page_width_pt) : null,
    }));
}

export type TemplateView = {
  id: string; backgroundUrl: string; previewWidth: number; previewHeight: number; pageWidthPt: number | null;
  renditionId: string; fields: CanvasField[];
};

/** The item's editable-field template (if staff set one up), with signed background and font links. */
export async function loadTemplate(sb: SupabaseClient, printItemId: string): Promise<TemplateView | null> {
  const { data: t } = await sb.from("editable_templates")
    .select("id, rendition_id, preview_renditions(id, preview_path, width, height, page_width_pt), template_fields(id, key, label, default_text, x_pct, y_pct, w_pct, h_pct, font_size_pt, color_hex, align, font_css, font_weight, cover_color, max_chars, sort, font_id)")
    .eq("print_item_id", printItemId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const r = t?.preview_renditions as unknown as { id: string; preview_path: string | null; width: number; height: number; page_width_pt: string | null } | null;
  if (!t || !r?.preview_path) return null;
  const urls = await signPreviews(sb, [r.preview_path]);
  if (!urls[r.preview_path]) return null;
  const fields = (t.template_fields as unknown as Array<Record<string, unknown>>).sort((a, b) => (a.sort as number) - (b.sort as number));
  const fontIds = [...new Set(fields.map((f) => f.font_id as string | null).filter(Boolean))] as string[];
  const fontUrls: Record<string, string> = {};
  if (fontIds.length) {
    const { data: fonts } = await sb.from("fonts").select("id, files(storage_path)").in("id", fontIds);
    for (const f of fonts ?? []) {
      const path = (f.files as unknown as { storage_path: string } | null)?.storage_path;
      if (!path) continue;
      const { data } = await sb.storage.from("assets").createSignedUrl(path, 3600);
      if (data?.signedUrl) fontUrls[f.id as string] = data.signedUrl;
    }
  }
  return {
    id: t.id as string, renditionId: r.id, backgroundUrl: urls[r.preview_path]!, previewWidth: r.width, previewHeight: r.height,
    pageWidthPt: r.page_width_pt ? Number(r.page_width_pt) : null,
    fields: fields.map((f) => ({
      id: f.id as string, key: f.key as string, label: f.label as string, default_text: f.default_text as string,
      x_pct: Number(f.x_pct), y_pct: Number(f.y_pct), w_pct: Number(f.w_pct), h_pct: Number(f.h_pct),
      font_size_pt: Number(f.font_size_pt), color_hex: f.color_hex as string, align: f.align as "left" | "center" | "right",
      font_css: f.font_css as string, font_weight: f.font_weight as number, cover_color: (f.cover_color as string | null) ?? null,
      max_chars: (f.max_chars as number | null) ?? null,
      font: f.font_id && fontUrls[f.font_id as string] ? { id: f.font_id as string, url: fontUrls[f.font_id as string]! } : null,
    })),
  };
}
