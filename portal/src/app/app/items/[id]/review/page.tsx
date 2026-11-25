import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { versionPages, loadTemplate } from "@/lib/data/versions";
import { audit } from "@/lib/audit";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ReviewClient } from "@/components/revisions/review-client";

export const metadata = { title: "Review artwork" };

/** "Review Artwork": see exactly what was printed last time, then confirm or mark changes. */
export default async function ReviewArtwork({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ order?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireClient();
  if (user.clientRole === "client_viewer") redirect(`/app/items/${id}`);
  const sb = await supabaseServer();
  const { data: item } = await sb.from("print_items").select("id, name, approved_version_id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!item) notFound();

  const { data: open } = await sb.from("revision_requests").select("id, round_no, status")
    .eq("print_item_id", id).in("status", ["open", "in_prepress", "proof_sent"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!item.approved_version_id) {
    return (<><PageHeader title={item.name as string} /><Alert tone="info">This item has no approved artwork yet. Your account manager will add it.</Alert></>);
  }
  const [pages, template] = await Promise.all([versionPages(sb, item.approved_version_id as string), loadTemplate(sb, id)]);
  const orderId = sp.order && /^[0-9a-f-]{36}$/.test(sp.order) ? sp.order : null;
  await audit({ action: "preview.reviewed", actorId: user.id, organizationId: user.organizationId, entityType: "print_item", entityId: id });

  return (
    <>
      <Link href={`/app/items/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{item.name as string}</Link>
      <PageHeader title="Review artwork" description="This is exactly what was printed last time (low-res preview)." />
      {open ? (
        <Alert tone="info" className="mb-4">
          Revision {open.round_no as number} for this item is already in progress.{" "}
          <Button asChild size="sm" variant="link"><Link href={`/app/revisions/${open.id}`}>Open it</Link></Button>
        </Alert>
      ) : (
        <ReviewClient printItemId={id} organizationId={user.organizationId} itemName={item.name as string} baseVersionId={item.approved_version_id as string}
          pages={pages} template={template} orderId={orderId} maxMb={(await getSetting("uploads")).max_file_mb} />
      )}
    </>
  );
}
