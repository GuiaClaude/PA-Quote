import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

/**
 * High-res print file download. Allowed for:
 *   - staff who can see the client (RLS decides), or
 *   - a client user, ONLY if management switched on "Allow high-res download"
 *     for their company, and only for files of an approved version.
 * Every download is written to the audit log. The link expires in 60 seconds.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getSessionUser();
  const deny = () => NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!me || me.needsMfa || !z.uuid().safeParse(id).success) return deny();

  let file: { bucket: string | null; storage_path: string | null; original_name: string | null; organization_id: string } | null = null;
  if (me.staffRole) {
    const sb = await supabaseServer();
    const { data } = await sb.from("files").select("bucket, storage_path, original_name, organization_id, kind").eq("id", id).eq("kind", "upload").maybeSingle();
    file = data;
  } else if (me.organizationId) {
    const admin = supabaseAdmin();
    const { data: org } = await admin.from("organizations").select("allow_highres_download").eq("id", me.organizationId).single();
    if (!org?.allow_highres_download) return deny();
    const { data } = await admin.from("files")
      .select("bucket, storage_path, original_name, organization_id, kind, artwork_versions!inner(status)")
      .eq("id", id).eq("organization_id", me.organizationId).eq("kind", "upload").eq("purpose", "artwork")
      .is("deleted_at", null).eq("artwork_versions.status", "approved").maybeSingle();
    file = data;
  }
  if (!file?.bucket || !file.storage_path) return deny();

  const { data: signed } = await supabaseAdmin().storage.from(file.bucket)
    .createSignedUrl(file.storage_path, 60, { download: file.original_name ?? true });
  if (!signed?.signedUrl) return deny();
  await audit({ action: "file.downloaded", actorId: me.id, actorEmail: me.email, organizationId: file.organization_id, entityType: "file", entityId: id, meta: { name: file.original_name, as: me.staffRole ?? me.clientRole } });
  return NextResponse.redirect(signed.signedUrl, { status: 303 });
}
