"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { Download, FileUp, Loader2, Paperclip } from "lucide-react";
import { importEstimates, attachEstimateOriginal } from "@/lib/actions/estimates";
import { uploadToPrintFiles } from "@/components/files/upload-core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";

type Result = Awaited<ReturnType<typeof importEstimates>>;

export function EstimateImport({ maxMb }: { maxMb: number }) {
  const csvInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [attach, setAttach] = useState<{ name: string; status: string }[]>([]);
  const [pending, start] = useTransition();

  function onCsv(f: File) {
    setResult(null); setName(f.name);
    Papa.parse<Record<string, string>>(f, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase(), complete: (r) => setRows(r.data) });
  }

  /** Originals are matched to estimates by file name: it must START with the estimate number, e.g. "CE-2024-0099.pdf". */
  async function onOriginals(files: File[]) {
    if (!result) return;
    const list = files.map((f) => ({ name: f.name, status: "waiting" }));
    setAttach(list);
    for (const [i, f] of files.entries()) {
      const set = (status: string) => setAttach((a) => a.map((x, j) => (j === i ? { ...x, status } : x)));
      const est = [...result.estimates].sort((a, b) => b.estimateNo.length - a.estimateNo.length).find((e) => f.name.toLowerCase().startsWith(e.estimateNo.toLowerCase()));
      if (!est) { set("no matching estimate number"); continue; }
      if (f.size > maxMb * 1024 * 1024) { set(`larger than ${maxMb} MB`); continue; }
      try {
        const safe = f.name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80);
        const path = `${est.organizationId}/estimates/${crypto.randomUUID()}-${safe}`;
        await uploadToPrintFiles(path, f, (p) => set(`${p}%`));
        const r = await attachEstimateOriginal(est.id, path, f.name, f.size);
        set(r?.error ?? `attached to ${est.estimateNo}`);
      } catch { set("upload failed"); }
    }
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader><CardTitle>1. The spreadsheet</CardTitle>
          <CardDescription>Columns: client_name, item_code, estimate_no, estimate_date (YYYY-MM-DD), vat_inclusive (yes/no), quantity, total_price, valid_until, notes. Clients and Print Items (with item codes) must exist first.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><a href="/templates/past-estimates-import.csv" download><Download />Download template</a></Button>
            <Button onClick={() => csvInput.current?.click()}><FileUp />Choose CSV</Button>
            <input ref={csvInput} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsv(f); e.target.value = ""; }} />
          </div>
          {rows ? <p className="text-sm">{name}: <b>{rows.length}</b> row{rows.length === 1 ? "" : "s"} read.</p> : null}
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div><p className="text-sm font-medium">Confirm the prices straight away</p><p className="text-xs text-muted-foreground">Only if the spreadsheet is already checked. Otherwise they stay as drafts for review.</p></div>
            <Switch checked={confirm} onCheckedChange={setConfirm} aria-label="Confirm imported prices" />
          </div>
          <Button disabled={!rows?.length || pending} onClick={() => start(async () => setResult(await importEstimates(rows!, confirm)))}>
            {pending ? <Loader2 className="animate-spin" /> : null}Import {rows?.length ?? 0} rows
          </Button>
          {result?.error ? <Alert tone="danger">{result.error}</Alert> : null}
          {result && !result.error ? (
            <Alert tone={result.problems.length ? "warning" : "success"}>
              <p><b>{result.created}</b> estimate{result.created === 1 ? "" : "s"} created{confirm ? `, ${result.confirmed} confirmed` : " as drafts"}.</p>
              {result.problems.length ? <ul className="mt-2 list-disc pl-5 text-sm">{result.problems.slice(0, 30).map((p) => <li key={p}>{p}</li>)}</ul> : null}
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card aria-disabled={!result?.created}>
        <CardHeader><CardTitle>2. The original files (optional)</CardTitle>
          <CardDescription>Select many files at once. Each file name must start with its estimate number, e.g. <code>CE-2024-0099.pdf</code> or <code>CE-2024-0099 ABC brochure.xlsx</code>.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" disabled={!result?.created} onClick={() => filesInput.current?.click()}><Paperclip />Choose files</Button>
          <input ref={filesInput} type="file" multiple className="sr-only" accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.jpg,.jpeg,.png" onChange={(e) => { void onOriginals([...(e.target.files ?? [])]); e.target.value = ""; }} />
          {attach.length ? <ul className="divide-y rounded-lg border text-sm">{attach.map((a, i) => <li key={i} className="flex justify-between gap-2 px-3 py-2"><span className="truncate">{a.name}</span><span className="shrink-0 text-muted-foreground">{a.status}</span></li>)}</ul> : null}
          {result?.created ? <Button asChild variant="link" className="px-0"><Link href="/staff/estimates?status=draft">Review the drafts →</Link></Button> : null}
        </CardContent>
      </Card>
    </div>
  );
}
