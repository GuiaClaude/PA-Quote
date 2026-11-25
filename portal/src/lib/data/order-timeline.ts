import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TimelineEvent } from "@/components/data/status-timeline";

export const ATTACHMENT_URL_SECONDS = 600;

/** Load an order's timeline with signed (10-minute) links to its photos and receipts — using the viewer's own access. */
export async function loadOrderTimeline(sb: SupabaseClient, orderId: string): Promise<TimelineEvent[]> {
  const [{ data: events }, { data: atts }] = await Promise.all([
    sb.from("order_status_events").select("id, from_status, to_status, note, created_at, client_visible").eq("order_id", orderId),
    sb.from("order_attachments").select("id, status_event_id, kind, files(original_name, storage_path, mime_type)").eq("order_id", orderId),
  ]);
  const rows = (atts ?? []) as unknown as { id: string; status_event_id: string | null; kind: string; files: { original_name: string; storage_path: string; mime_type: string | null } | null }[];
  const paths = rows.map((a) => a.files?.storage_path).filter((p): p is string => Boolean(p));
  const { data: signed } = paths.length ? await sb.storage.from("attachments").createSignedUrls(paths, ATTACHMENT_URL_SECONDS) : { data: [] };
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return ((events ?? []) as TimelineEvent[]).map((e) => ({
    ...e,
    photos: rows.filter((a) => a.status_event_id === e.id && a.files).map((a) => ({
      id: a.id, kind: a.kind, name: a.files!.original_name, url: url.get(a.files!.storage_path) ?? null,
      isImage: /^image\//.test(a.files!.mime_type ?? "") || /\.(jpe?g|png|webp|heic)$/i.test(a.files!.original_name),
    })),
  }));
}
