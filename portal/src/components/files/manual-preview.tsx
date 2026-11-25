"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2 } from "lucide-react";
import { applyManualPreview } from "@/lib/actions/print-items";
import { uploadToPrintFiles } from "./upload-core";
import { Button } from "@/components/ui/button";

/** For PSD / ZIP / EPS etc.: staff upload a JPG or PNG that becomes the watermarked preview. */
export function ManualPreviewButton({ fileId, organizationId, printItemId }: { fileId: string; organizationId: string; printItemId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onFile(file: File) {
    if (!/\.(jpe?g|png)$/i.test(file.name)) return setError("Choose a JPG or PNG.");
    setBusy(true); setError(null);
    try {
      const path = `${organizationId}/${printItemId}/tmp/${crypto.randomUUID()}.${file.name.split(".").pop()!.toLowerCase()}`;
      await uploadToPrintFiles(path, file, () => {});
      const r = await applyManualPreview(fileId, path);
      if (r?.error) setError(r.error); else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <ImageUp />}Upload preview image
      </Button>
      <input ref={input} type="file" accept=".jpg,.jpeg,.png" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
      {error ? <span role="alert" className="w-full text-xs text-danger">{error}</span> : null}
    </>
  );
}
