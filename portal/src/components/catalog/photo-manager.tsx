"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { setProductPhotos } from "@/lib/actions/catalog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function PhotoManager({ productId, photos }: { productId: string; photos: { path: string; url: string | null }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (paths: string[]) => start(async () => { const r = await setProductPhotos(productId, paths); if (r?.error) setError(r.error); router.refresh(); });
  async function add(files: FileList) {
    setError(null);
    const paths = photos.map((p) => p.path);
    for (const f of Array.from(files).slice(0, 8 - paths.length)) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (!["jpg", "jpeg", "png", "webp"].includes(ext) || f.size > 5 * 1024 * 1024) { setError("Photos must be JPG, PNG or WebP under 5 MB."); continue; }
      const path = `catalog/${crypto.randomUUID()}.${ext}`;
      const { error: e } = await supabaseBrowser().storage.from("assets").upload(path, f, { contentType: f.type });
      if (e) { setError("Upload failed."); continue; }
      paths.push(path);
    }
    save(paths);
  }
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.path} className="relative aspect-square overflow-hidden rounded-lg border bg-surface-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.url ? <img src={p.url} alt={`Photo ${i + 1}`} className="size-full object-cover" /> : null}
            <button type="button" aria-label={`Remove photo ${i + 1}`} disabled={pending} onClick={() => save(photos.filter((x) => x.path !== p.path).map((x) => x.path))}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"><X className="size-3.5" /></button>
            {i === 0 ? <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-semibold text-white">Main</span> : null}
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" disabled={pending || photos.length >= 8} onClick={() => input.current?.click()}>{pending ? <Loader2 className="animate-spin" /> : <ImagePlus />}Add photos</Button>
      <input ref={input} type="file" multiple accept=".jpg,.jpeg,.png,.webp" className="sr-only" onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = ""; }} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
