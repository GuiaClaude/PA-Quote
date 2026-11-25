"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Hand, Loader2, MapPin, Paperclip, PenLine, Send, Square, Trash2, Type, X, StickyNote } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { recordAttachment, submitRevision } from "@/lib/actions/revisions";
import { PreviewViewer, type ViewerPage } from "@/components/files/preview-viewer";
import { MarkupLayer, type Markup, type Tool } from "./markup-layer";
import { TemplateCanvas, type CanvasField } from "@/components/templates/template-canvas";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-submit";
import { cn } from "@/lib/utils";

type DraftMarkup = Markup & { files: File[] };
type Template = { backgroundUrl: string; previewWidth: number; previewHeight: number; pageWidthPt: number | null; fields: CanvasField[] };

export function ReviewClient({
  printItemId, organizationId, itemName, baseVersionId, pages, template, orderId, parentRevisionId, startInRevise = false, maxMb,
}: {
  printItemId: string; organizationId: string; itemName: string; baseVersionId: string; pages: ViewerPage[];
  template: Template | null; orderId?: string | null; parentRevisionId?: string | null; startInRevise?: boolean; maxMb: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"review" | "revise">(startInRevise ? "revise" : "review");
  const [tab, setTab] = useState<"markup" | "text" | "notes">("markup");
  const [tool, setTool] = useState<Tool>("pin");
  const [markups, setMarkups] = useState<DraftMarkup[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((template?.fields ?? []).map((f) => [f.id, f.default_text])));
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const changedFields = useMemo(() => (template?.fields ?? []).filter((f) => (values[f.id] ?? "").trim() !== f.default_text.trim()), [template, values]);
  const changeCount = markups.length + changedFields.length + (notes.trim() ? 1 : 0) + files.length;

  function addMarkup(page: ViewerPage, m: Pick<Markup, "shape" | "x_pct" | "y_pct" | "w_pct" | "h_pct">) {
    const key = crypto.randomUUID();
    setMarkups((list) => [...list, { ...m, key, renditionId: page.id, pageNo: page.pageNo, comment: "", number: list.length + 1, files: [] }]);
    setActive(key);
    setTimeout(() => (document.getElementById(`mk-${key}`) as HTMLTextAreaElement | null)?.focus(), 50);
  }
  const update = (key: string, p: Partial<DraftMarkup>) => setMarkups((l) => l.map((m) => (m.key === key ? { ...m, ...p } : m)));
  const remove = (key: string) => setMarkups((l) => l.filter((m) => m.key !== key).map((m, i) => ({ ...m, number: i + 1 })));
  const tooBig = (f: File) => f.size > maxMb * 1024 * 1024;

  async function uploadAttachment(file: File): Promise<string> {
    const safe = file.name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80);
    const path = `${organizationId}/revisions/${crypto.randomUUID()}-${safe}`;
    const { error: upErr } = await supabaseBrowser().storage.from("attachments").upload(path, file, { contentType: file.type || undefined });
    if (upErr) throw new Error(`Could not upload ${file.name}.`);
    const r = await recordAttachment({ organizationId, path, name: file.name, size: file.size, mime: file.type || undefined });
    if (!r.id) throw new Error(r.error ?? `Could not save ${file.name}.`);
    return r.id;
  }

  async function submit() {
    setError(null);
    if (markups.some((m) => !m.comment.trim())) { setTab("markup"); return setError("Type what to change for every pin and box."); }
    setBusy(true);
    try {
      const markupPayload = [];
      for (const m of markups) {
        const ids = [];
        for (const f of m.files) ids.push(await uploadAttachment(f));
        markupPayload.push({ rendition_id: m.renditionId, page_no: m.pageNo, shape: m.shape, x_pct: round(m.x_pct), y_pct: round(m.y_pct),
          w_pct: m.w_pct != null ? round(m.w_pct) : null, h_pct: m.h_pct != null ? round(m.h_pct) : null, comment: m.comment.trim(), sort: m.number, attachment_file_ids: ids });
      }
      const general = [];
      for (const f of files) general.push(await uploadAttachment(f));
      const res = await submitRevision({
        printItemId, baseVersionId, orderId: orderId ?? null, parentRevisionId: parentRevisionId ?? null, notes,
        markups: markupPayload, fieldValues: changedFields.map((f) => ({ template_field_id: f.id, value: values[f.id] ?? "" })), attachmentIds: general,
      });
      if (!res.id) throw new Error(res.error ?? "Could not send your changes.");
      router.push(`/app/revisions/${res.id}?sent=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (step === "review") {
    return (
      <div className="space-y-5">
        <PreviewViewer pages={pages} />
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-center font-semibold">Is this still correct?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild size="lg" className="h-14 text-base">
                <Link href={`/app/items/${printItemId}/reorder`}><CheckCircle2 />Confirm — print as is</Link>
              </Button>
              <Button size="lg" variant="outline" className="h-14 text-base" onClick={() => setStep("revise")}><PenLine />I have revisions</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tabs = [
    { id: "markup" as const, label: "Mark up", Icon: MapPin, count: markups.length },
    ...(template ? [{ id: "text" as const, label: "Edit text", Icon: Type, count: changedFields.length }] : []),
    { id: "notes" as const, label: "Notes & files", Icon: StickyNote, count: (notes.trim() ? 1 : 0) + files.length },
  ];

  return (
    <div className="space-y-4 pb-36 lg:pb-24">
      <div role="tablist" aria-label="Ways to give changes" className="grid gap-1 rounded-xl bg-surface-muted p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(({ id, label, Icon, count }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium", tab === id ? "bg-surface shadow-sm" : "text-muted-foreground")}>
            <Icon className="size-4" aria-hidden />{label}{count ? <span className="rounded-full bg-primary px-1.5 text-[11px] text-white">{count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "markup" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-2">
            <div role="radiogroup" aria-label="Markup tool" className="flex gap-2">
              {([["pin", "Drop a pin", MapPin], ["box", "Draw a box", Square], ["move", "Move / zoom", Hand]] as const).map(([id, label, Icon]) => (
                <button key={id} role="radio" aria-checked={tool === id} onClick={() => setTool(id)}
                  className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm font-medium", tool === id ? "border-primary bg-primary-soft text-primary" : "bg-surface")}>
                  <Icon className="size-4" aria-hidden />{label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{tool === "pin" ? "Tap the spot you want changed." : tool === "box" ? "Drag across the area you want changed." : "Scroll and zoom without adding marks."}</p>
            <PreviewViewer pages={pages} overlay={(page) => (
              <MarkupLayer markups={markups.filter((m) => m.renditionId === page.id)} tool={tool} editable activeKey={active}
                onAdd={(m) => addMarkup(page, m)} onSelect={(k) => { setActive(k); document.getElementById(`mk-${k}`)?.focus(); }} />
            )} />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Your changes ({markups.length})</h2>
            {markups.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No marks yet. Tap the preview to drop a pin, or draw a box.</p> : null}
            <ol ref={listRef} className="space-y-3">
              {markups.map((m) => (
                <li key={m.key} className={cn("rounded-lg border bg-surface p-3", active === m.key && "border-accent ring-1 ring-accent")}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{m.number}</span>
                    <span className="flex-1 text-xs text-muted-foreground">{m.shape === "pin" ? "Pin" : "Box"} · {pageLabel(pages, m.renditionId)}</span>
                    <button type="button" onClick={() => remove(m.key)} className="rounded p-1 text-muted-foreground hover:bg-danger-soft hover:text-danger" aria-label={`Remove change ${m.number}`}><Trash2 className="size-4" /></button>
                  </div>
                  <Textarea id={`mk-${m.key}`} value={m.comment} onFocus={() => setActive(m.key)} onChange={(e) => update(m.key, { comment: e.target.value })}
                    placeholder="What should change here? e.g. Change phone number to 0917 123 4567" className="min-h-20" maxLength={2000} aria-label={`What to change for mark ${m.number}`} />
                  <FilePicker files={m.files} onChange={(f) => update(m.key, { files: f })} tooBig={tooBig} compact />
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}

      {tab === "text" && template ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <TemplateCanvas backgroundUrl={template.backgroundUrl} previewWidth={template.previewWidth} previewHeight={template.previewHeight}
            pageWidthPt={template.pageWidthPt} fields={template.fields} values={values} />
          <div className="space-y-3">
            {template.fields.map((f) => (
              <div key={f.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`tf-${f.id}`}>{f.label}</Label>
                  {(values[f.id] ?? "") !== f.default_text ? (
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => setValues((v) => ({ ...v, [f.id]: f.default_text }))}>Undo</button>
                  ) : null}
                </div>
                <Input id={`tf-${f.id}`} value={values[f.id] ?? ""} maxLength={f.max_chars ?? 200} onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))} />
                {f.max_chars ? <p className="text-right text-[11px] text-muted-foreground">{(values[f.id] ?? "").length}/{f.max_chars}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "notes" ? (
        <Card><CardContent className="space-y-4 pt-5">
          <div className="space-y-2">
            <Label htmlFor="rev-notes">General notes</Label>
            <Textarea id="rev-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} placeholder="Anything else prepress should know" />
          </div>
          <div className="space-y-2">
            <Label>Files (new logo, photos, text document)</Label>
            <FilePicker files={files} onChange={setFiles} tooBig={tooBig} />
          </div>
        </CardContent></Card>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="pb-safe fixed inset-x-0 bottom-14 z-30 border-t bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-60">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm"><b>{changeCount}</b> change{changeCount === 1 ? "" : "s"}<span className="hidden sm:inline"> for <span className="font-medium">{itemName}</span></span></p>
          <div className="flex shrink-0 gap-2">
            {!startInRevise ? <Button variant="ghost" onClick={() => setStep("review")} disabled={busy} aria-label="Cancel"><X /><span className="hidden sm:inline">Cancel</span></Button> : null}
            <ConfirmButton destructive={false} disabled={busy || changeCount === 0} title="Send these changes to Print Amplified?"
              message="Prepress will make the changes in the real print file and send you a revised proof to approve."
              confirmLabel="Send changes" onConfirm={() => void submit()}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />}Send changes
            </ConfirmButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilePicker({ files, onChange, tooBig, compact }: { files: File[]; onChange: (f: File[]) => void; tooBig: (f: File) => boolean; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [warn, setWarn] = useState<string | null>(null);
  return (
    <div className={cn("space-y-2", compact && "mt-2")}>
      {files.length ? (
        <ul className="space-y-1">{files.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md bg-surface-muted px-2 py-1 text-xs">
            <Paperclip className="size-3.5" /><span className="flex-1 truncate">{f.name}</span>
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))}><X className="size-3.5" /></button>
          </li>
        ))}</ul>
      ) : null}
      <Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()}><Paperclip />Attach file</Button>
      <input ref={input} type="file" multiple className="sr-only" accept="image/*,.pdf,.ai,.eps,.svg,.doc,.docx,.txt,.zip"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          const big = picked.filter(tooBig);
          setWarn(big.length ? `${big.map((f) => f.name).join(", ")} is too large.` : null);
          onChange([...files, ...picked.filter((f) => !tooBig(f))].slice(0, 10));
          e.target.value = "";
        }} />
      {warn ? <p role="alert" className="text-xs text-danger">{warn}</p> : null}
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;
function pageLabel(pages: ViewerPage[], renditionId: string) {
  const p = pages.find((x) => x.id === renditionId);
  return !p ? "" : p.side === "front" ? "Front" : p.side === "back" ? "Back" : `Page ${p.pageNo}`;
}
