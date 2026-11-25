"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2, RotateCcw } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { setBrandLogo } from "@/lib/actions/settings";
import type { ActionState } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Logo } from "@/components/brand/logo";

export function LogoUploader({ logoUrl, disabled }: { logoUrl: string | null; disabled: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  async function onFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["png", "jpg", "jpeg", "svg", "webp"].includes(ext)) return setMsg({ error: "Use a PNG, JPG, SVG or WebP image." });
    if (file.size > 2 * 1024 * 1024) return setMsg({ error: "Keep the logo under 2 MB." });
    start(async () => {
      const path = `logo-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabaseBrowser().storage.from("brand").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (error) return setMsg({ error: "Upload failed. Only management can change the logo." });
      setMsg(await setBrandLogo(path));
      router.refresh();
    });
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-lg bg-surface-muted p-4"><Logo logoUrl={logoUrl} size={36} /></div>
      {!disabled ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>{pending ? <Loader2 className="animate-spin" /> : <ImageUp />}Upload logo</Button>
          {logoUrl ? <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { setMsg(await setBrandLogo(null)); router.refresh(); })}><RotateCcw />Use standard mark</Button> : null}
          <input ref={input} type="file" accept=".png,.jpg,.jpeg,.svg,.webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">A wide logo on a transparent background works best (PNG or SVG, at least 400 px wide).</p>
      {msg?.error ? <Alert tone="danger">{msg.error}</Alert> : null}
      {msg?.message ? <Alert tone="success">{msg.message}</Alert> : null}
    </div>
  );
}
