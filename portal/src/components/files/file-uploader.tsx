"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, UploadCloud, XCircle, AlertTriangle } from "lucide-react";
import { findDuplicates, previewStatus, registerUpload } from "@/lib/actions/print-items";
import { extensionOf, isAllowedArtwork, PHOTO_EXTENSIONS, ARTWORK_EXTENSIONS } from "@/lib/files/types";
import { formatBytes, newObjectPath, sha256Hex, uploadToPrintFiles } from "./upload-core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Row = { key: string; name: string; size: number; stage: "checking" | "duplicate" | "uploading" | "saving" | "preview" | "done" | "error"; pct: number; message?: string; file?: File; sha?: string };

export function FileUploader({ organizationId, printItemId, versionId, purpose = "artwork", maxMb, label, hint }: {
  organizationId: string; printItemId: string; versionId?: string; purpose?: "artwork" | "color_standard_photo"; maxMb: number; label: string; hint?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [drag, setDrag] = useState(false);
  const patch = (key: string, p: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const accept = (purpose === "artwork" ? ARTWORK_EXTENSIONS : PHOTO_EXTENSIONS).map((e) => `.${e}`).join(",");

  async function upload(key: string, file: File, sha: string) {
    try {
      patch(key, { stage: "uploading", pct: 0 });
      const path = newObjectPath(organizationId, printItemId, purpose === "artwork" ? versionId ?? "misc" : "color", file.name);
      await uploadToPrintFiles(path, file, (pct) => patch(key, { pct }));
      patch(key, { stage: "saving" });
      const res = await registerUpload({ printItemId, versionId, purpose, path, originalName: file.name, size: file.size, mime: file.type || undefined });
      if (res.error || !res.fileId) throw new Error(res.error ?? "Could not save.");
      patch(key, { stage: "preview" });
      router.refresh();
      for (let i = 0; i < 60; i++) {           // wait up to ~2 minutes for the preview
        await new Promise((r) => setTimeout(r, 2000));
        const s = (await previewStatus([res.fileId]))[res.fileId];
        if (s && s !== "pending") {
          patch(key, { stage: "done", message: s === "ready" ? "Preview ready" : s === "unsupported" ? "Saved. No automatic preview for this type — upload a preview image." : "Saved, but the preview failed. Try “Regenerate preview”." });
          router.refresh();
          return;
        }
      }
      patch(key, { stage: "done", message: "Saved. The preview is still being made — refresh in a moment." });
      void sha;
    } catch (e) {
      patch(key, { stage: "error", message: e instanceof Error ? e.message : "Upload failed." });
    }
  }

  async function handle(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const key = crypto.randomUUID();
      const ok = purpose === "artwork" ? isAllowedArtwork(file.name) : (PHOTO_EXTENSIONS as readonly string[]).includes(extensionOf(file.name));
      if (!ok) { setRows((r) => [...r, { key, name: file.name, size: file.size, stage: "error", pct: 0, message: "This file type isn't accepted." }]); continue; }
      if (file.size > maxMb * 1024 * 1024) { setRows((r) => [...r, { key, name: file.name, size: file.size, stage: "error", pct: 0, message: `Too large — the limit is ${maxMb} MB.` }]); continue; }
      setRows((r) => [...r, { key, name: file.name, size: file.size, stage: "checking", pct: 0, file }]);
      const sha = await sha256Hex(file);
      const dups = await findDuplicates(organizationId, sha);
      if (dups.length) {
        patch(key, { stage: "duplicate", sha, message: `Same file already stored as “${dups[0]!.name}” (${dups[0]!.item}).` });
        continue;
      }
      void upload(key, file, sha);
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files); }}
        className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition", drag ? "border-primary bg-primary-soft" : "border-input bg-surface-muted/50")}
      >
        <UploadCloud className="size-7 text-primary" aria-hidden />
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint ?? `PDF, AI, PSD, EPS, INDD, TIFF, JPG, PNG or ZIP · up to ${maxMb} MB each`}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>Choose files</Button>
        <input ref={input} type="file" multiple accept={accept} className="sr-only" onChange={(e) => { if (e.target.files) void handle(e.target.files); e.target.value = ""; }} />
      </div>
      {rows.length ? (
        <ul className="space-y-2" aria-live="polite">
          {rows.map((r) => (
            <li key={r.key} className="rounded-lg border bg-surface px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                {r.stage === "done" ? <CheckCircle2 className="size-4 text-success" /> : r.stage === "error" ? <XCircle className="size-4 text-danger" /> : r.stage === "duplicate" ? <AlertTriangle className="size-4 text-warning" /> : <Loader2 className="size-4 animate-spin text-primary" />}
                <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                <span className="tabular text-xs text-muted-foreground">{formatBytes(r.size)}</span>
              </div>
              {r.stage === "uploading" ? (
                <div className="mt-2 h-1.5 rounded-full bg-surface-muted" role="progressbar" aria-valuenow={r.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${r.name}`}>
                  <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${r.pct}%` }} />
                </div>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {r.stage === "checking" ? "Checking for duplicates…" : r.stage === "uploading" ? `Uploading… ${r.pct}%` : r.stage === "saving" ? "Saving…" : r.stage === "preview" ? "Making the low-res preview…" : r.message}
              </p>
              {r.stage === "duplicate" && r.file && r.sha ? (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void upload(r.key, r.file!, r.sha!)}>Upload anyway</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}>Skip</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
