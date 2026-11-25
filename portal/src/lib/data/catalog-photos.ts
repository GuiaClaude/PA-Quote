import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Signed links to catalog photos (assets bucket; any signed-in user can view). */
export async function signCatalogPhotos(sb: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await sb.storage.from("assets").createSignedUrls(unique, 3600);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
