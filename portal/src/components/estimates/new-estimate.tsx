"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, PenLine } from "lucide-react";
import { createEmptyEstimate, createEstimateFromUpload } from "@/lib/actions/estimates";
import { uploadToPrintFiles } from "@/components/files/upload-core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const OK = ["pdf", "xlsx", "xls", "csv", "docx", "doc", "jpg", "jpeg", "png"];

export function NewEstimate({ clients, items, maxMb }: { clients: { id: string; name: string }[]; items: { id: string; name: string; organizationId: string }[]; maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [org, setOrg] = useState(clients[0]?.id ?? "");
  const [item, setItem] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function onFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!OK.includes(ext)) return setError("Upload a PDF, Excel, CSV, Word, JPG or PNG file.");
    if (f.size > maxMb * 1024 * 1024) return setError(`The file is larger than ${maxMb} MB.`);
    setError(null); setPct(0);
    try {
      const safe = f.name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80);
      const path = `${org}/estimates/${crypto.randomUUID()}-${safe}`;
      await uploadToPrintFiles(path, f, setPct);
      const r = await createEstimateFromUpload({ organizationId: org, printItemId: item || null, path, name: f.name, size: f.size });
      if (!r.id) throw new Error(r.error ?? "Could not create the estimate.");
      router.push(`/staff/estimates/${r.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); setPct(null); }
  }
  return (
    <div className="grid max-w-3xl gap-6">
      <Card><CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="ne-org">Client</Label><Select id="ne-org" value={org} onChange={(e) => { setOrg(e.target.value); setItem(""); }}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div className="space-y-1"><Label htmlFor="ne-item">Print Item (optional now)</Label><Select id="ne-item" value={item} onChange={(e) => setItem(e.target.value)}><option value="">Choose later / create new</option>{items.filter((i) => i.organizationId === org).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></div>
      </CardContent></Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileUp className="size-5 text-primary" />Upload the estimate file</CardTitle><CardDescription>PDF, Excel, CSV, Word, or a photo/scan. Clients never see this file.</CardDescription></CardHeader>
          <CardContent>
            <Button disabled={!org || pct !== null} onClick={() => input.current?.click()}>{pct !== null ? <><Loader2 className="animate-spin" />Uploading {pct}%</> : "Choose file"}</Button>
            <input ref={input} type="file" className="sr-only" accept={OK.map((x) => `.${x}`).join(",")} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><PenLine className="size-5 text-primary" />No file?</CardTitle><CardDescription>Type the estimate in from paper.</CardDescription></CardHeader>
          <CardContent><form action={createEmptyEstimate}><input type="hidden" name="organizationId" value={org} /><Button variant="outline" type="submit" disabled={!org}>Type it in</Button></form></CardContent>
        </Card>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
