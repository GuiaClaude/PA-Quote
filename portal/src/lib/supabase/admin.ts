import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Supabase client with the SECRET key. It bypasses Row Level Security, so:
 *   - only use it on the server (the "server-only" import enforces this),
 *   - only AFTER checking that the signed-in user is allowed to do the action,
 *   - only for things a user client cannot do (create logins, write the
 *     audit log, sign a user out everywhere, read settings before login).
 */
// Untyped until database types are generated (`supabase gen types`, see README).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: SupabaseClient<any, "public", any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supabaseAdmin(): SupabaseClient<any, "public", any> {
  if (!client) {
    const e = env();
    client = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
