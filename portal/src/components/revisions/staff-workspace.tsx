"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleHelp, FilePlus2, Hammer, Paperclip, Send, XCircle } from "lucide-react";
import { prepareProofVersion, replyToMarkup, sendProof, setRevisionStatus } from "@/lib/actions/revisions";
import type { ActionState } from "@/lib/actions/account";
import { PreviewViewer, type ViewerPage } from "@/components/files/preview-viewer";
import { MarkupLayer, type Markup } from "./markup-layer";
import { TemplateCanvas, type CanvasField } from "@/components/templates/template-canvas";
import { FileUploader } from "@/components/files/file-uploader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-submit";
import { cn } from "@/lib/utils";

type StaffMarkup = Markup & { id: string; staffReply: string | null; attachments: { id: string; name: string; url: string | null }[] };
type Template = { backgroundUrl: string; previewWidth: number; previewHeight: number; pageWidthPt: number | null; fields: CanvasField[] };

export function StaffRevisionWorkspace({ revisionId, status, basePages, markups, fieldValues, template, draft, draftPageCount, organizationId, printItemId, maxMb }: {
  revisionId: string; status: string; basePages: ViewerPage[]; markups: StaffMarkup[];
  fieldValues: { fieldId: string; label: string; defaultText: string; value: string }[]; template: Template | null;
  draft: { id: string; versionNo: number; files: { id: string; name: string; status: string }[] } | null; draftPageCount: number;
  organizationId: string; printItemId: string; maxMb: number; canManage: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [active, setActive] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>) => start(async () => { const r = await fn(); setMsg(r); router.refresh(); });
  const open = status === "open" || status === "in_prepress";
  const values = Object.fromEntries(fieldValues.map((f) => [f.fieldId, f.value]));

  return (
    <>
      {msg?.error ? <Alert tone="danger">{msg.error}</Alert> : null}
      {msg?.message ? <Alert tone="success">{msg.message}</Alert> : null}
      {open ? (
        <div className="flex flex-wrap gap-2">
          {status === "open" ? <Button variant="outline" disabled={pending} onClick={() => run(() => setRevisionStatus(revisionId, "in_prepress"))}><Hammer />Start work</Button> : null}
          <ConfirmButton variant="ghost" disabled={pending} title="Cancel this revision?" message="Use this only if the client withdrew the request. The client will see it as cancelled."
            confirmLabel="Cancel revision" onConfirm={() => run(() => setRevisionStatus(revisionId, "cancelled"))}><XCircle />Cancel revision</ConfirmButton>
        </div>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Client&apos;s marks ({markups.length})</CardTitle></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <PreviewViewer pages={basePages} overlay={(page) => (
            <MarkupLayer markups={markups.filter((m) => m.renditionId === page.id)} tool="move" editable={false} activeKey={active} onSelect={setActive} />
          )} />
          <ol className="space-y-3">
            {markups.length === 0 ? <p className="text-sm text-muted-foreground">No marks on the preview.</p> : null}
            {markups.map((m) => <MarkupReply key={m.id} m={m} active={active === m.id} onFocus={() => setActive(m.id)} editable={open} />)}
          </ol>
        </CardContent>
      </Card>

      {fieldValues.length ? (
        <Card>
          <CardHeader><CardTitle>Edited text</CardTitle><CardDescription>Exactly what the client typed, drawn where it goes. Apply it in the real file.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1fr_320px]">
            {template ? <TemplateCanvas backgroundUrl={template.backgroundUrl} previewWidth={template.previewWidth} previewHeight={template.previewHeight}
              pageWidthPt={template.pageWidthPt} fields={template.fields} values={values} outline /> : <span />}
            <ul className="space-y-2 text-sm">{fieldValues.map((f) => (
              <li key={f.fieldId} className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">{f.label}</p>
                <p><s className="text-muted-foreground">{f.defaultText}</s></p><p className="font-semibold">{f.value}</p>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => navigator.clipboard?.writeText(f.value)}>Copy</button></li>
            ))}</ul>
          </CardContent>
        </Card>
      ) : null}

      {open ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Revised proof</CardTitle>
            <CardDescription>Make the changes in the real print file, upload it here (a low-res preview is made automatically), check it, then send it to the client for approval.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!draft ? (
              <Button disabled={pending} onClick={() => run(async () => { const r = await prepareProofVersion(revisionId); return r?.error ? r : { message: "Draft version created — upload the revised file." }; })}>
                <FilePlus2 />Start revised proof
              </Button>
            ) : (
              <>
                <p className="text-sm">Uploading into <b>version {draft.versionNo}</b> (draft — the client can&apos;t see it until you send it).</p>
                {draft.files.length ? (
                  <ul className="space-y-1 text-sm">{draft.files.map((f) => (
                    <li key={f.id} className="flex items-center gap-2"><Paperclip className="size-4" />{f.name}
                      <Badge tone={f.status === "ready" ? "success" : f.status === "pending" ? "info" : "warning"}>{f.status === "ready" ? "preview ready" : f.status}</Badge></li>
                  ))}</ul>
                ) : null}
                <FileUploader organizationId={organizationId} printItemId={printItemId} versionId={draft.id} maxMb={maxMb} label="Upload the revised print file" />
                <div className="space-y-2">
                  <label htmlFor="proof-msg" className="text-sm font-medium">Message to the client (optional)</label>
                  <Textarea id="proof-msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} placeholder="e.g. We updated the phone number and the logo. Please check the colours on page 2." />
                </div>
                <ConfirmButton destructive={false} disabled={pending || draftPageCount === 0}
                  title="Send this proof to the client?" message="They will get an email and an in-app notice, compare it with the previous version, and approve it or ask for more changes."
                  confirmLabel="Send proof" onConfirm={() => run(() => sendProof(revisionId, draft.id, message))}>
                  <Send />Send proof to client
                </ConfirmButton>
                {draftPageCount === 0 ? <p className="text-xs text-muted-foreground">Available once the new file has a preview.</p> : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function MarkupReply({ m, active, onFocus, editable }: { m: StaffMarkup; active: boolean; onFocus: () => void; editable: boolean }) {
  const [reply, setReply] = useState(m.staffReply ?? "");
  const [state, setState] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  const save = (status: "open" | "done" | "question") => start(async () => setState(await replyToMarkup(m.id, reply, status)));
  return (
    <li className={cn("rounded-lg border p-3 text-sm", active && "border-accent ring-1 ring-accent")} onClick={onFocus}>
      <div className="flex items-start gap-2">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", m.staffStatus === "done" ? "bg-success" : "bg-primary")}>{m.number}</span>
        <p className="flex-1">{m.comment}</p>
      </div>
      {m.attachments.map((a) => a.url ? <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"><Paperclip className="size-3.5" />{a.name}</a> : null)}
      {editable ? (
        <div className="mt-2 space-y-2">
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the client (optional)" className="min-h-14 text-sm" aria-label={`Reply to change ${m.number}`} />
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant={m.staffStatus === "done" ? "default" : "outline"} disabled={pending} onClick={() => save("done")}><CheckCircle2 />Done</Button>
            <Button size="sm" variant={m.staffStatus === "question" ? "default" : "outline"} disabled={pending} onClick={() => save("question")}><CircleHelp />Question</Button>
          </div>
          {state?.error ? <p className="text-xs text-danger">{state.error}</p> : state?.message ? <p className="text-xs text-success">Saved</p> : null}
        </div>
      ) : m.staffReply ? <p className="mt-2 rounded bg-surface-muted p-2 text-xs">{m.staffReply}</p> : null}
    </li>
  );
}
