"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { submitPaymentSlip } from "@/lib/actions/tracking";
import { uploadToBucket } from "@/components/files/upload-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

/** Optional: the client sends a photo of the deposit slip or cheque. Staff still check and record the payment. */
export function PaymentSlipUpload({ orderId, organizationId }: { orderId: string; organizationId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [, start] = useTransition();
  async function send(f: File) {
    if (!/^image\/|application\/pdf/.test(f.type)) return setMsg({ ok: false, text: "Please send a photo (JPG/PNG) or a PDF." });
    if (f.size > 15 * 1024 * 1024) return setMsg({ ok: false, text: "Please send a file smaller than 15 MB." });
    setMsg(null); setPct(0);
    try {
      const safe = f.name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "slip.jpg";
      const path = `${organizationId}/payment-slips/${orderId}/${crypto.randomUUID()}-${safe}`;
      await uploadToBucket("attachments", path, f, setPct);
      const r = await submitPaymentSlip({ orderId, path, name: f.name, size: f.size, mime: f.type || undefined, note });
      setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: r?.message ?? "Sent." });
      if (!r?.error) { setNote(""); start(() => router.refresh()); }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed." }); }
    setPct(null);
  }
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-sm font-semibold">Already paid?</p>
      <p className="text-xs text-muted-foreground">Optional: send a photo of the deposit slip or cheque so we can match your payment faster.</p>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. Deposited at BDO Makati, ₱12,500" aria-label="Note for the payment slip" maxLength={500} />
      <Button type="button" variant="outline" size="sm" disabled={pct !== null} onClick={() => input.current?.click()}>
        {pct !== null ? <><Loader2 className="animate-spin" />Sending {pct}%</> : <><Camera />Send slip photo</>}
      </Button>
      <input ref={input} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ""; }} />
      {msg ? <Alert tone={msg.ok ? "success" : "danger"}>{msg.text}</Alert> : null}
    </div>
  );
}
