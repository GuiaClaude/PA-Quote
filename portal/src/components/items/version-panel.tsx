"use client";
import { useActionState, useState, useTransition } from "react";
import {
  CheckCircle2, Download, ExternalLink, FileWarning, ImagePlus, Link2, Lock, Plus, RefreshCcw, Trash2, Archive, FileArchive,
} from "lucide-react";
import { addDriveLink, approveVersion, createVersion, markCopiedToArchive, regeneratePreview, removeFile } from "@/lib/actions/print-items";
import type { ActionState } from "@/lib/actions/account";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-submit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FileUploader } from "@/components/files/file-uploader";
import { ManualPreviewButton } from "@/components/files/manual-preview";
import { formatBytes } from "@/components/files/upload-core";
import { fileTypeLabel } from "@/lib/files/types";
import { formatDate, formatDateTime } from "@/lib/dates";
import { t } from "@/i18n";

export type PageView = { id: string; pageNo: number; side: string | null; status: string; error: string | null; source: string; url: string | null; width: number | null; height: number | null };
export type FileView = { id: string; kind: string; name: string; url: string | null; size: number | null; sha256: string | null; copiedAt: string | null; pages: PageView[] };
export type VersionView = {
  id: string; versionNo: number; status: string; notes: string | null; createdAt: string; approvedAt: string | null;
  uploadedBy: string | null; approvedBy: string | null; files: FileView[];
};

const STATUS: Record<string, { label: string; tone: "success" | "neutral" | "info" | "warning" }> = {
  approved: { label: "Approved for Print", tone: "success" },
  superseded: { label: "Superseded", tone: "neutral" },
  draft: { label: "Draft", tone: "warning" },
  proof: { label: "Proof", tone: "info" },
};

export function VersionPanel({ version: v, canManage, organizationId, printItemId, maxMb }: {
  version: VersionView; canManage: boolean; organizationId: string; printItemId: string; maxMb: number;
}) {
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionState>) => start(async () => setMsg(await fn()));
  const locked = v.status === "approved" || v.status === "superseded";
  const editable = canManage && v.status === "draft"; // proofs are with the client; approved ones are locked
  const hasUncopiedDrive = v.files.some((f) => f.kind === "drive_link" && !f.copiedAt);
  const meta = STATUS[v.status] ?? STATUS.draft!;

  return (
    <Card className={v.status === "approved" ? "border-success/40" : v.status === "superseded" ? "opacity-80" : ""}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Version {v.versionNo}</h3>
            <Badge tone={meta.tone}>{locked ? <Lock /> : null}{meta.label}</Badge>
          </div>
          {v.notes ? <p className="mt-1 text-sm">{v.notes}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Created {formatDate(v.createdAt)}{v.uploadedBy ? ` by ${v.uploadedBy}` : ""}
            {v.approvedAt ? ` · approved ${formatDateTime(v.approvedAt)}${v.approvedBy ? ` by ${v.approvedBy}` : ""}` : ""}
          </p>
        </div>
        {v.status === "proof" ? <p className="text-xs text-muted-foreground">Sent to the client for approval — see the revision.</p> : null}
        {editable ? (
          <ConfirmButton destructive={false} disabled={pending || v.files.length === 0} title={`Approve version ${v.versionNo} for print?`}
            message="It becomes the version used for every reorder and is locked: it can't be edited or deleted, only replaced by a newer approved version. The current approved version (if any) is kept in history."
            confirmLabel="Approve for Print" onConfirm={() => run(() => approveVersion(v.id))}>
            <CheckCircle2 /> Approve for Print
          </ConfirmButton>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {msg?.error ? <Alert tone="danger">{msg.error}</Alert> : null}
        {msg?.message ? <Alert tone="success">{msg.message}</Alert> : null}
        {v.files.length === 0 ? <p className="text-sm text-muted-foreground">No files yet.</p> : (
          <ul className="space-y-3">
            {v.files.map((f) => <FileItem key={f.id} f={f} canManage={canManage} editable={editable} pending={pending} run={run} organizationId={organizationId} printItemId={printItemId} />)}
          </ul>
        )}
        {editable ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <FileUploader organizationId={organizationId} printItemId={printItemId} versionId={v.id} maxMb={maxMb} label="Upload print files" />
            <DriveLinkForm versionId={v.id} />
          </div>
        ) : null}
        {canManage && locked && v.status === "approved" && hasUncopiedDrive ? (
          <FileUploader organizationId={organizationId} printItemId={printItemId} versionId={v.id} maxMb={maxMb}
            label="Upload the archive copy of the Drive file" hint="Download it from Drive, upload it here, then press “Mark as copied”." />
        ) : null}
      </CardContent>
    </Card>
  );
}

function FileItem({ f, canManage, editable, pending, run, organizationId, printItemId }: {
  f: FileView; canManage: boolean; editable: boolean; pending: boolean; run: (fn: () => Promise<ActionState>) => void; organizationId: string; printItemId: string;
}) {
  const ready = f.pages.filter((p) => p.status === "ready" && p.url);
  const status = f.pages[0]?.status ?? (f.kind === "upload" ? "pending" : null);
  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start gap-3">
        {f.kind === "drive_link" ? (
          <span className="inline-flex size-12 items-center justify-center rounded-md bg-info-soft text-info"><Link2 className="size-5" /></span>
        ) : ready[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ready[0].url!} alt="" loading="lazy" draggable={false} className="size-12 rounded-md border object-cover" />
        ) : (
          <span className="inline-flex size-12 items-center justify-center rounded-md bg-surface-muted text-xs font-bold text-muted-foreground">{fileTypeLabel(f.name)}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{f.name}</p>
          <p className="text-xs text-muted-foreground">
            {f.kind === "drive_link" ? "Google Drive link" : [f.size ? formatBytes(f.size) : null, f.sha256 ? `SHA-256 ${f.sha256.slice(0, 10)}…` : null, ready.length ? `${ready.length} preview page${ready.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}
          </p>
          {f.kind === "drive_link" && !f.copiedAt ? <p className="mt-1 flex items-center gap-1 text-xs font-medium text-danger"><FileWarning className="size-3.5" />{t.items.driveOnly}</p> : null}
          {f.kind === "drive_link" && f.copiedAt ? <p className="mt-1 text-xs text-success">Copied into the archive {formatDate(f.copiedAt)}</p> : null}
          {status === "pending" ? <p className="mt-1 text-xs text-muted-foreground">Making preview…</p> : null}
          {status === "unsupported" ? <p className="mt-1 text-xs text-warning">No automatic preview for this file type — upload a preview image.</p> : null}
          {status === "failed" ? <p className="mt-1 text-xs text-danger">Preview failed{f.pages[0]?.error ? `: ${f.pages[0].error}` : ""}</p> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          {f.kind === "drive_link" && f.url ? <Button asChild size="sm" variant="ghost"><a href={f.url} target="_blank" rel="noopener noreferrer"><ExternalLink />Open</a></Button> : null}
          {f.kind === "upload" ? <Button asChild size="sm" variant="ghost"><a href={`/api/files/${f.id}/download`}><Download />Download</a></Button> : null}
          {canManage && f.kind === "drive_link" && !f.copiedAt ? <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => markCopiedToArchive(f.id))}><Archive />Mark as copied</Button> : null}
          {canManage && f.kind === "upload" ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => regeneratePreview(f.id))} title="Regenerate preview"><RefreshCcw /><span className="sr-only">Regenerate preview</span></Button> : null}
          {canManage && f.kind === "upload" && (status === "unsupported" || status === "failed") ? <ManualPreviewButton fileId={f.id} organizationId={organizationId} printItemId={printItemId} /> : null}
          {editable ? (
            <ConfirmButton size="sm" variant="ghost" title="Remove this file?" message={`“${f.name}” will be removed from this draft version. It stays in the archive history.`} confirmLabel="Remove" onConfirm={() => run(() => removeFile(f.id))}>
              <Trash2 /><span className="sr-only">Remove</span>
            </ConfirmButton>
          ) : null}
        </div>
      </div>
      {ready.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {ready.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.url!} alt={`Page ${p.pageNo}`} loading="lazy" draggable={false} className="h-20 w-auto rounded border" />
          ))}
        </div>
      ) : null}
      {f.kind === "upload" && status === "unsupported" && f.name.toLowerCase().endsWith(".zip") ? <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><FileArchive className="size-3.5" />ZIP packages are stored as-is.</p> : null}
    </li>
  );
}

function DriveLinkForm({ versionId }: { versionId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(addDriveLink, undefined);
  return (
    <form action={action} className="space-y-2 rounded-xl border border-dashed p-4">
      <p className="flex items-center gap-2 text-sm font-medium"><Link2 className="size-4 text-info" />Add a Google Drive link</p>
      <input type="hidden" name="versionId" value={versionId} />
      <Input name="url" type="url" placeholder="https://drive.google.com/…" aria-label="Drive link" required />
      <Input name="label" placeholder="Label, e.g. Client's Drive folder" aria-label="Label" />
      <p className="text-xs text-muted-foreground">Links can disappear when the owner leaves. Upload a real copy whenever you can.</p>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.message ? <Alert tone="success">{state.message}</Alert> : null}
      <SubmitButton size="sm" variant="outline">Add link</SubmitButton>
    </form>
  );
}

export function NewVersionButton({ printItemId }: { printItemId: string }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus />New version</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>New artwork version</DialogTitle>
          <DialogDescription>Describe what changed. The current approved version stays in use until you approve the new one.</DialogDescription>
          <Textarea className="mt-4" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. New hotline number and 2026 logo" aria-label="What changed" />
          {msg?.error ? <Alert tone="danger" className="mt-3">{msg.error}</Alert> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending} onClick={() => start(async () => { const r = await createVersion(printItemId, notes); setMsg(r); if (!r?.error) { setOpen(false); setNotes(""); } })}>
              <ImagePlus />Create version
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
