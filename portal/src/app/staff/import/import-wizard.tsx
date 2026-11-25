"use client";
import { useRef, useState, useTransition } from "react";
import Papa from "papaparse";
import { CheckCircle2, Download, FileSpreadsheet, Files, Loader2, XCircle } from "lucide-react";
import { importPrintItems, resolveItemCodes, listImportCodes, approveImportedVersions, type ImportReport } from "@/lib/actions/import";
import { registerUpload } from "@/lib/actions/print-items";
import { importRowSchema, codeFromFileName, MAX_IMPORT_ROWS } from "@/lib/import/rows";
import { isAllowedArtwork } from "@/lib/files/types";
import { newObjectPath, uploadToPrintFiles, formatBytes } from "@/components/files/upload-core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

type Parsed = { rows: Record<string, string>[]; errors: Map<number, string> };

export function ImportWizard({ maxMb }: { maxMb: number }) {
  return (
    <div className="space-y-6">
      <CsvStep />
      <FilesStep maxMb={maxMb} />
    </div>
  );
}

function CsvStep() {
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, start] = useTransition();

  function onFile(file: File) {
    setReport(null);
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase(),
      complete: (res) => {
        const errors = new Map<number, string>();
        res.data.forEach((row, i) => {
          const p = importRowSchema.safeParse(row);
          if (!p.success) errors.set(i, p.error.issues.map((x) => x.message).join("; "));
        });
        setParsed({ rows: res.data, errors });
      },
    });
  }

  const valid = parsed ? parsed.rows.filter((_, i) => !parsed.errors.has(i)) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5 text-primary" />Step 1 · Clients and Print Items from a spreadsheet</CardTitle>
        <CardDescription>Fill in the template in Excel or Google Sheets, save it as CSV, and upload it. Lists inside one cell (finishing, tags, domains) are separated with a semicolon “;”. Importing the same file twice is safe — existing item codes are skipped.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><a href="/templates/print-items-import.csv" download><Download />Download template</a></Button>
          <Button onClick={() => input.current?.click()}><FileSpreadsheet />Choose CSV file</Button>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </div>
        {parsed ? (
          <>
            <p className="text-sm"><b>{fileName}</b>: {parsed.rows.length} rows · <span className="text-success">{valid.length} ready</span>{parsed.errors.size ? <> · <span className="text-danger">{parsed.errors.size} with problems (they will be skipped)</span></> : null}</p>
            {parsed.rows.length > MAX_IMPORT_ROWS ? <Alert tone="danger">Please split the file — at most {MAX_IMPORT_ROWS} rows per import.</Alert> : null}
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <THead><TR><TH>Row</TH><TH>Client</TH><TH>Code</TH><TH>Item</TH><TH>Drive link</TH><TH>Check</TH></TR></THead>
                <TBody>{parsed.rows.slice(0, 200).map((r, i) => (
                  <TR key={i}>
                    <TD className="tabular text-muted-foreground">{i + 2}</TD><TD>{r.client_name}</TD><TD>{r.item_code}</TD><TD>{r.item_name}</TD>
                    <TD>{r.drive_link ? <Badge tone="info">link</Badge> : "—"}</TD>
                    <TD>{parsed.errors.has(i) ? <span className="flex items-center gap-1 text-xs text-danger"><XCircle className="size-4" />{parsed.errors.get(i)}</span> : <CheckCircle2 className="size-4 text-success" aria-label="OK" />}</TD>
                  </TR>
                ))}</TBody>
              </Table>
            </div>
            <Button disabled={pending || valid.length === 0 || parsed.rows.length > MAX_IMPORT_ROWS} onClick={() => start(async () => setReport(await importPrintItems(valid)))}>
              {pending ? <Loader2 className="animate-spin" /> : null}Import {valid.length} row{valid.length === 1 ? "" : "s"}
            </Button>
          </>
        ) : null}
        {report ? (
          report.error ? <Alert tone="danger">{report.error}</Alert> : (
            <Alert tone={report.problems.length ? "warning" : "success"}>
              <p><b>{report.itemsCreated}</b> Print Items created{report.clientsCreated.length ? `, ${report.clientsCreated.length} new client${report.clientsCreated.length > 1 ? "s" : ""} (${report.clientsCreated.join(", ")})` : ""}.</p>
              {report.skipped.length ? <p className="mt-1">Skipped: {report.skipped.join("; ")}</p> : null}
              {report.problems.length ? <ul className="mt-1 list-disc pl-5">{report.problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
              {report.clientsCreated.length ? <p className="mt-1">Next: open each new client to add its email domains and invite its users.</p> : null}
            </Alert>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

type FileRow = { key: string; file: File; code: string | null; state: "ready" | "uploading" | "done" | "error" | "skip"; pct: number; message?: string };

function FilesStep({ maxMb }: { maxMb: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<FileRow[]>([]);
  const [approve, setApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const patch = (key: string, p: Partial<FileRow>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function onFiles(files: FileList) {
    setSummary(null);
    const codes = await listImportCodes();
    setRows(Array.from(files).map((file) => {
      const code = codeFromFileName(file.name, codes);
      const bad = !isAllowedArtwork(file.name) ? "File type not accepted" : file.size > maxMb * 1024 * 1024 ? `Larger than ${maxMb} MB` : !code ? "No item code at the start of the file name" : null;
      return { key: crypto.randomUUID(), file, code, state: bad ? "skip" : "ready", pct: 0, message: bad ?? undefined };
    }));
  }

  async function uploadAll() {
    setBusy(true);
    const ready = rows.filter((r) => r.state === "ready");
    const { targets, error } = await resolveItemCodes([...new Set(ready.map((r) => r.code!))]);
    if (error) { setSummary(error); setBusy(false); return; }
    const byCode = new Map(targets.map((t) => [t.code.toUpperCase(), t]));
    const okVersions = new Set<string>();
    for (const r of ready) {
      const target = byCode.get(r.code!.toUpperCase());
      if (!target) { patch(r.key, { state: "error", message: "Item not found (or not yours)" }); continue; }
      try {
        patch(r.key, { state: "uploading", pct: 0 });
        const path = newObjectPath(target.organizationId, target.printItemId, target.versionId, r.file.name);
        await uploadToPrintFiles(path, r.file, (pct) => patch(r.key, { pct }));
        const res = await registerUpload({ printItemId: target.printItemId, versionId: target.versionId, purpose: "artwork", path, originalName: r.file.name, size: r.file.size, mime: r.file.type || undefined });
        if (res.error) throw new Error(res.error);
        okVersions.add(target.versionId);
        patch(r.key, { state: "done", message: `${target.client} · ${target.itemName}` });
      } catch (e) {
        patch(r.key, { state: "error", message: e instanceof Error ? e.message : "Upload failed" });
      }
    }
    let text = `${okVersions.size} item${okVersions.size === 1 ? "" : "s"} received files. Previews are being made in the background.`;
    if (approve && okVersions.size) {
      const res = await approveImportedVersions([...okVersions]);
      text += ` ${res.approved} marked Approved for Print.${res.problems.length ? ` Problems: ${res.problems.join("; ")}` : ""}`;
    }
    setSummary(text);
    setBusy(false);
  }

  const readyCount = rows.filter((r) => r.state === "ready").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Files className="size-5 text-primary" />Step 2 · Upload the existing files</CardTitle>
        <CardDescription>Start each file name with the item code, e.g. <code>ABC-BR-01.pdf</code> or <code>ABC-BR-01__back.pdf</code>. Each file goes into that item&apos;s draft version (a new draft is created if the item already has an approved version).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}><Files />Choose files</Button>
          <input ref={input} type="file" multiple className="sr-only" onChange={(e) => { if (e.target.files) void onFiles(e.target.files); e.target.value = ""; }} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} className="size-4 accent-[var(--primary)]" />Mark as Approved for Print after upload</label>
        </div>
        {rows.length ? (
          <>
            <ul className="divide-y rounded-lg border text-sm" aria-live="polite">
              {rows.map((r) => (
                <li key={r.key} className="flex items-center gap-3 px-3 py-2">
                  {r.state === "done" ? <CheckCircle2 className="size-4 text-success" /> : r.state === "error" || r.state === "skip" ? <XCircle className="size-4 text-danger" /> : r.state === "uploading" ? <Loader2 className="size-4 animate-spin text-primary" /> : <span className="size-4" />}
                  <span className="min-w-0 flex-1 truncate">{r.file.name}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{formatBytes(r.file.size)}</span>
                  {r.code ? <Badge tone="brand">{r.code}</Badge> : null}
                  <span className="w-56 truncate text-right text-xs text-muted-foreground">{r.state === "uploading" ? `${r.pct}%` : r.message}</span>
                </li>
              ))}
            </ul>
            <Button disabled={busy || readyCount === 0} onClick={() => void uploadAll()}>{busy ? <Loader2 className="animate-spin" /> : null}Upload {readyCount} file{readyCount === 1 ? "" : "s"}</Button>
          </>
        ) : null}
        {summary ? <Alert tone="info">{summary}</Alert> : null}
      </CardContent>
    </Card>
  );
}
