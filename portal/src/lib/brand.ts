import "server-only";
import { getSetting } from "@/lib/settings";

/** Public URL of the uploaded logo, or null to use the built-in mark. */
export async function getLogoUrl(): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const { logo_path } = await getSetting("branding");
    return logo_path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/brand/${logo_path}` : null;
  } catch {
    return null;
  }
}
