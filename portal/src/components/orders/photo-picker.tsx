"use client";
import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { uploadToBucket } from "@/components/files/upload-core";
import { Button } from "@/components/ui/button";

export type Uploaded = { id: string; name: string; preview: string | null };

/** Take or choose photos (or a PDF receipt); each uploads straight away and returns a file id. */
export function PhotoPicker({ label, accept, folder, files, onChange, record, disabled }: {
  label: string; accept: string; folder: string; files: Uploaded[]; onChange: (f: Uploaded[]) => void; disabled?: boolean;
  record: (path: string, f: File) => Promise<{ id?: string; error?: string }>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function add(list: File[]) {
    setError(null);
    let next = files;
    for (const f of list.slice(0, 20 - files.length)) {
      setBusy(`${f.name} 0%`);
      try {
        const safe = f.name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "photo.jpg";
        const path = `${folder}/${crypto.randomUUID()}-${safe}`;
        await uploadToBucket("attachments", path, f, (p) => setBusy(`${f.name} ${p}%`));
        const r = await record(path, f);
        if (!r.id) throw new Error(r.error ?? "Could not save.");
        next = [...next, { id: r.id, name: f.name, preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null }];
        onChange(next);
      } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    }
    setBusy(null);
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || Boolean(busy)} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <Camera />}{busy ? `Uploading ${busy}` : label}
        </Button>
        <input ref={input} type="file" multiple accept={accept} className="sr-only" onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      {files.length ? (
        <ul className="flex flex-wrap gap-2">{files.map((f) => (
          <li key={f.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {f.preview ? <img src={f.preview} alt={f.name} className="size-16 rounded-lg border object-cover" /> : <span className="flex size-16 items-center justify-center rounded-lg border bg-surface-muted p-1 text-center text-[10px]">{f.name}</span>}
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((x) => x.id !== f.id))} className="absolute -right-1.5 -top-1.5 rounded-full border bg-surface p-0.5"><X className="size-3" /></button>
          </li>
        ))}</ul>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
