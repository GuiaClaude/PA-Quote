import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PREVIEW_URL_SECONDS = 600; // links to previews expire after 10 minutes

/**
 * Signed, expiring links to preview images. Called with the USER's client,
 * so storage security rules decide: a client can only sign previews in
 * their own company's folder.
 */
export async function signPreviews(sb: SupabaseClient, paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!unique.length) return {};
  const { data } = await sb.storage.from("previews").createSignedUrls(unique, PREVIEW_URL_SECONDS);
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

export type PreviewPage = { id: string; url: string; width: number; height: number; pageNo: number; side: string | null; fileName: string };
