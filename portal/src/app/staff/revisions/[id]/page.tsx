import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Paperclip } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { loadRevision, REVISION_STATUS } from "@/lib/data/revision";
import { loadTemplate, versionPages } from "@/lib/data/versions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StaffRevisionWorkspace } from "@/components/revisions/staff-workspace";
import { CompareSlider } from "@/components/revisions/compare-slider";
import { formatDateTime } from "@/lib/dates";

export default async function StaffRevisionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireStaff(["pa_admin", "pa_sales"]);
  const sb = await supabaseServer();
  const rev = await loadRevision(sb, id);
  if (!rev) notFound();
  const st = REVISION_STATUS[rev.status] ?? REVISION_STATUS.open!;

  // Base version print files (for prepress to edit) and the draft proof version (if started)
  const [{ data: baseFiles }, { data: draft }, template] = await Promise.all([
    sb.from("files").select("id, original_name, kind, external_url").eq("artwork_version_id", rev.baseVersionId).is("deleted_at", null),
    sb.from("artwork_versions").select("id, version_no, files(id, original_name, deleted_at, preview_renditions(status))")
      .eq("print_item_id", rev.printItemId).eq("status", "draft").order("version_no", { ascending: false }).limit(1).maybeSingle(),
    loadTemplate(sb, rev.printItemId),
  ]);
  const draftPages = draft ? await versionPages(sb, draft.id as string) : [];
  const draftFiles = ((draft?.files as unknown as { id: string; original_name: string; deleted_at: string | null; preview_renditions: { status: string }[] }[]) ?? []).filter((f) => !f.deleted_at);
  const open = rev.status === "open" || rev.status === "in_prepress";

  return (
    <>
      <Link href="/staff/revisions" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />Revisions</Link>
      <PageHeader title={`${rev.itemName} — Revision ${rev.roundNo}`}
        breadcrumb={<Link className="hover:underline" href={`/staff/clients/${rev.organizationId}`}>{rev.organizationName}</Link>}
        description={`Sent ${formatDateTime(rev.submittedAt)}${rev.submittedBy ? ` by ${rev.submittedBy}` : ""}${rev.orderNo ? ` · order ${rev.orderNo}` : ""}`}
        actions={<><Badge tone={st.tone}>{st.staff}</Badge><Button asChild variant="outline" size="sm"><Link href={`/staff/items/${rev.printItemId}`}>Open Print Item</Link></Button></>} />

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <StaffRevisionWorkspace
            revisionId={rev.id} status={rev.status} basePages={rev.basePages} markups={rev.markups}
            fieldValues={rev.fieldValues} template={template}
            draft={draft ? { id: draft.id as string, versionNo: draft.version_no as number, files: draftFiles.map((f) => ({ id: f.id, name: f.original_name, status: f.preview_renditions[0]?.status ?? "pending" })) } : null}
            draftPageCount={draftPages.length} organizationId={rev.organizationId} printItemId={rev.printItemId}
            maxMb={(await getSetting("uploads")).max_file_mb} canManage={Boolean(me.staffRole)} />
          {draftPages.length && open ? (
            <Card><CardHeader><CardTitle>Check the proof against the previous version</CardTitle></CardHeader>
              <CardContent><CompareSlider before={rev.basePages} after={draftPages} beforeLabel={`Previous`} afterLabel={`New v${draft?.version_no}`} /></CardContent></Card>
          ) : null}
          {rev.proofPages.length && !open ? (
            <Card><CardHeader><CardTitle>Proof sent to the client</CardTitle></CardHeader>
              <CardContent><CompareSlider before={rev.basePages} after={rev.proofPages} /></CardContent></Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Print files to edit</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {(baseFiles ?? []).map((f) => f.kind === "upload" ? (
                <a key={f.id as string} className="flex items-center gap-2 text-primary hover:underline" href={`/api/files/${f.id}/download`}><Download className="size-4" />{f.original_name as string}</a>
              ) : (
                <a key={f.id as string} className="flex items-center gap-2 text-primary hover:underline" href={f.external_url as string} target="_blank" rel="noopener noreferrer"><Download className="size-4" />Drive link</a>
              ))}
            </CardContent>
          </Card>
          {rev.generalNotes || rev.attachments.length ? (
            <Card>
              <CardHeader><CardTitle>General notes & files</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {rev.generalNotes ? <p className="whitespace-pre-wrap">{rev.generalNotes}</p> : null}
                {rev.attachments.map((a) => a.url ? <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline"><Paperclip className="size-4" />{a.name}</a> : null)}
              </CardContent>
            </Card>
          ) : null}
          {rev.rounds.length > 1 ? (
            <Card><CardHeader><CardTitle>Rounds</CardTitle></CardHeader><CardContent>
              <ol className="space-y-1 text-sm">{rev.rounds.map((r) => (
                <li key={r.id} className="flex justify-between"><Link className={r.id === rev.id ? "font-semibold" : "text-primary hover:underline"} href={`/staff/revisions/${r.id}`}>Revision {r.roundNo}</Link><span className="text-xs text-muted-foreground">{REVISION_STATUS[r.status]?.staff}</span></li>
              ))}</ol>
            </CardContent></Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
