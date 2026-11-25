"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import type { ActionState } from "./account";

const fieldSchema = z.object({
  label: z.string().trim().min(1, "Every field needs a label.").max(60),
  default_text: z.string().max(500),
  x_pct: z.number().min(0).max(100), y_pct: z.number().min(0).max(100),
  w_pct: z.number().gt(0).max(100), h_pct: z.number().gt(0).max(100),
  font_id: z.uuid().nullable(),
  font_css: z.string().max(200).regex(/^[A-Za-z0-9 ,'"-]+$/, "Invalid font name."),
  font_weight: z.number().int().min(100).max(900),
  font_size_pt: z.number().min(2).max(400),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  align: z.enum(["left", "center", "right"]),
  max_chars: z.number().int().min(1).max(500).nullable(),
  cover_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
});
const saveInput = z.object({ printItemId: z.uuid(), renditionId: z.uuid(), fields: z.array(fieldSchema).max(40) });

const keyOf = (label: string, used: Set<string>) => {
  const base = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";
  let k = base, n = 2;
  while (used.has(k)) k = `${base}_${n++}`;
  used.add(k);
  return k;
};

/**
 * Save the editable fields of a Print Item. If clients already used the
 * current fields in revision requests, a NEW template is created (the old
 * one is kept for history) — otherwise the fields are replaced in place.
 */
export async function saveTemplate(input: z.infer<typeof saveInput>): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me || (me.staffRole !== "pa_admin" && me.staffRole !== "pa_sales")) return { error: "Not allowed." };
  const p = saveInput.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the fields." };
  const { printItemId, renditionId, fields } = p.data;
  const sb = await supabaseServer();

  const { data: item } = await sb.from("print_items").select("id, organization_id").eq("id", printItemId).maybeSingle();
  if (!item) return { error: "Print Item not found." };
  const { data: rendition } = await sb.from("preview_renditions").select("id, files(artwork_version_id, artwork_versions(print_item_id))").eq("id", renditionId).maybeSingle();
  const rf = rendition?.files as unknown as { artwork_version_id: string; artwork_versions: { print_item_id: string } } | null;
  if (!rendition || rf?.artwork_versions?.print_item_id !== printItemId) return { error: "Choose a page of this item." };

  const { data: current } = await sb.from("editable_templates").select("id, rendition_id, template_fields(id)").eq("print_item_id", printItemId).eq("is_active", true).maybeSingle();
  const fieldIds = ((current?.template_fields as { id: string }[] | undefined) ?? []).map((f) => f.id);
  let used = false;
  if (fieldIds.length) {
    const { count } = await sb.from("template_field_values").select("id", { count: "exact", head: true }).in("template_field_id", fieldIds);
    used = (count ?? 0) > 0;
  }

  let templateId = current?.id as string | undefined;
  if (!current || used || current.rendition_id !== renditionId) {
    if (current) await sb.from("editable_templates").update({ is_active: false }).eq("id", current.id);
    const { data: t, error } = await sb.from("editable_templates").insert({
      organization_id: item.organization_id, print_item_id: printItemId, artwork_version_id: rf!.artwork_version_id, rendition_id: renditionId,
    }).select("id").single();
    if (error || !t) return { error: "Could not save." };
    templateId = t.id as string;
  } else {
    await sb.from("template_fields").delete().eq("template_id", current.id);
  }
  if (fields.length) {
    const keys = new Set<string>();
    const { error } = await sb.from("template_fields").insert(fields.map((f, i) => ({
      ...f, organization_id: item.organization_id, template_id: templateId, key: keyOf(f.label, keys), page_no: 1, sort: i,
    })));
    if (error) return { error: "Could not save the fields." };
  }
  await audit({ action: "template.saved", actorId: me.id, organizationId: item.organization_id, entityType: "print_item", entityId: printItemId, meta: { fields: fields.length, new_template: !current || used } });
  revalidatePath(`/staff/items/${printItemId}/template`);
  return { message: fields.length ? `Saved ${fields.length} editable field${fields.length === 1 ? "" : "s"}. Clients can now edit them in Review Artwork.` : "Saved. This item has no editable fields." };
}

const fontInput = z.object({
  family: z.string().trim().min(1).max(80), weight: z.number().int().min(100).max(900), style: z.enum(["normal", "italic"]),
  path: z.string().regex(/^fonts\/[0-9a-f-]{36}\.(ttf|otf|woff2?)$/), name: z.string().max(200), size: z.number().int().positive().max(20 * 1024 * 1024),
});

/** A font file was uploaded to the "assets" bucket; register it so fields can use it. */
export async function registerFont(input: z.infer<typeof fontInput>): Promise<ActionState & { id?: string }> {
  const me = await getSessionUser();
  if (!me || (me.staffRole !== "pa_admin" && me.staffRole !== "pa_sales")) return { error: "Not allowed." };
  const p = fontInput.safeParse(input);
  if (!p.success) return { error: "Upload a TTF, OTF, WOFF or WOFF2 font." };
  const sb = await supabaseServer();
  const { data: file, error } = await sb.from("files").insert({
    organization_id: null, purpose: "font", kind: "upload", bucket: "assets", storage_path: p.data.path, original_name: p.data.name, size_bytes: p.data.size, uploaded_by: me.id,
  }).select("id").single();
  if (error || !file) return { error: "Could not save the font." };
  const { data: font, error: fErr } = await sb.from("fonts").upsert({ family: p.data.family, weight: p.data.weight, style: p.data.style, file_id: file.id, uploaded_by: me.id }, { onConflict: "family,style,weight" }).select("id").single();
  if (fErr || !font) return { error: "Could not save the font." };
  await audit({ action: "font.uploaded", actorId: me.id, entityType: "font", entityId: font.id as string, meta: { family: p.data.family } });
  return { message: `Font “${p.data.family}” added.`, id: font.id as string };
}
