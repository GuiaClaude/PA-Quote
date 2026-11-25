import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Paperclip } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { loadRevision, REVISION_STATUS } from "@/lib/data/revision";
import { loadTemplate } from "@/lib/data/versions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { PreviewViewer } from "@/components/files/preview-viewer";
import { MarkupLayer } from "@/components/revisions/markup-layer";
import { ProofDecision } from "@/components/revisions/proof-decision";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Revision" };

export default async function ClientRevision({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string; approved?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireClient();
  const sb = await supabaseServer();
  const rev = await loadRevision(sb, id);
  if (!rev) notFound();
  const st = REVISION_STATUS[rev.status] ?? REVISION_STATUS.open!;
  const canAct = user.clientRole !== "client_viewer";
  const template = rev.status === "proof_sent" && canAct ? await loadTemplate(sb, rev.printItemId) : null;
  const latest = rev.rounds[rev.rounds.length - 1];

  return (
    <>
      <Link href={`/app/items/${rev.printItemId}`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ChevronLeft className="size-4" />{rev.itemName}</Link>
      <PageHeader title={`Revision ${rev.roundNo}`} description={`${rev.itemName}${rev.orderNo ? ` · order ${rev.orderNo}` : ""} · sent ${formatDateTime(rev.submittedAt)}${rev.submittedBy ? ` by ${rev.submittedBy}` : ""}`}
        actions={<Badge tone={st.tone}>{st.client}</Badge>} />
      {sp.sent ? <Alert tone="success" className="mb-4">Your changes were sent. Print Amplified prepress will prepare a revised proof — we&apos;ll notify you when it&apos;s ready.</Alert> : null}
      {sp.approved ? <Alert tone="success" className="mb-4">Approved. This is now the <b>Approved for Print</b> version and will be used for your reorders.</Alert> : null}
      {latest && latest.id !== rev.id ? <Alert tone="info" className="mb-4">There is a newer round. <Link className="font-semibold underline" href={`/app/revisions/${latest.id}`}>Open Revision {latest.roundNo}</Link></Alert> : null}

      {rev.status === "proof_sent" ? (
        <ProofDecision revisionId={rev.id} canAct={canAct} proofMessage={rev.proofMessage} before={rev.basePages} after={rev.proofPages}
          printItemId={rev.printItemId} organizationId={user.organizationId} itemName={rev.itemName} resultVersionId={rev.resultVersionId!}
          template={template} maxMb={(await getSetting("uploads")).max_file_mb} />
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader><CardTitle>Your marks</CardTitle></CardHeader>
          <CardContent>
            <PreviewViewer pages={rev.basePages} overlay={(page) => (
              <MarkupLayer markups={rev.markups.filter((m) => m.renditionId === page.id)} tool="move" editable={false} />
            )} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Changes requested</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {rev.markups.length === 0 && rev.fieldValues.length === 0 && !rev.generalNotes ? <p className="text-muted-foreground">Only files were attached.</p> : null}
              <ol className="space-y-3">
                {rev.markups.map((m) => (
                  <li key={m.id} className="rounded-lg border p-3">
                    <div className="flex items-start gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{m.number}</span>
                      <p className="flex-1">{m.comment}</p>
                    </div>
                    {m.attachments.map((a) => <AttachmentLink key={a.id} a={a} />)}
                    {m.staffReply || m.staffStatus !== "open" ? (
                      <p className={`mt-2 rounded-md px-2 py-1.5 text-xs ${m.staffStatus === "question" ? "bg-warning-soft" : "bg-success-soft"}`}>
                        <b>Print Amplified:</b> {m.staffStatus === "done" ? "Done. " : m.staffStatus === "question" ? "Question: " : ""}{m.staffReply}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
              {rev.fieldValues.length ? (
                <div><p className="mb-1 font-semibold">Edited text</p>
                  <ul className="space-y-1">{rev.fieldValues.map((f) => <li key={f.fieldId}><span className="text-muted-foreground">{f.label}:</span> <s className="text-muted-foreground">{f.defaultText}</s> → <b>{f.value}</b></li>)}</ul></div>
              ) : null}
              {rev.generalNotes ? <div><p className="mb-1 font-semibold">Notes</p><p className="whitespace-pre-wrap">{rev.generalNotes}</p></div> : null}
              {rev.attachments.length ? <div><p className="mb-1 font-semibold">Files</p>{rev.attachments.map((a) => <AttachmentLink key={a.id} a={a} />)}</div> : null}
            </CardContent>
          </Card>
          {rev.rounds.length > 1 ? (
            <Card><CardHeader><CardTitle>All rounds</CardTitle></CardHeader><CardContent>
              <ol className="space-y-1 text-sm">{rev.rounds.map((r) => (
                <li key={r.id} className="flex justify-between"><Link className={r.id === rev.id ? "font-semibold" : "text-primary hover:underline"} href={`/app/revisions/${r.id}`}>Revision {r.roundNo}</Link>
                  <span className="text-xs text-muted-foreground">{REVISION_STATUS[r.status]?.client}</span></li>
              ))}</ol>
            </CardContent></Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function AttachmentLink({ a }: { a: { id: string; name: string; url: string | null } }) {
  return a.url ? (
    <a href={a.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"><Paperclip className="size-3.5" />{a.name}</a>
  ) : <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="size-3.5" />{a.name}</p>;
}
