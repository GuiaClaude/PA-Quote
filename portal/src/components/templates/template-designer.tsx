"use client";
import { useRef, useState, useTransition } from "react";
import { Loader2, Save, Trash2, Upload } from "lucide-react";
import { saveTemplate, registerFont } from "@/lib/actions/templates";
import type { ActionState } from "@/lib/actions/account";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { TemplateCanvas, type CanvasField } from "./template-canvas";
import type { PageWithRendition } from "@/lib/data/versions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const BUILT_IN = [
  { css: "Helvetica, Arial, sans-serif", label: "Helvetica / Arial" },
  { css: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { css: "Georgia, 'Times New Roman', serif", label: "Georgia / Times" },
  { css: "'Courier New', Courier, monospace", label: "Courier" },
];
type Font = { id: string; label: string; url: string };
type F = CanvasField & { test: string };
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function TemplateDesigner({ printItemId, pages, fonts: initialFonts, initial }: {
  printItemId: string; pages: PageWithRendition[]; fonts: Font[]; initial: { renditionId: string; fields: CanvasField[] } | null;
}) {
  const [renditionId, setRenditionId] = useState(initial?.renditionId && pages.some((p) => p.id === initial.renditionId) ? initial.renditionId : pages[0]!.id);
  const [fields, setFields] = useState<F[]>(() => (initial?.fields ?? []).map((f) => ({ ...f, test: "" })));
  const [selected, setSelected] = useState<string | null>(null);
  const [fonts, setFonts] = useState(initialFonts);
  const [msg, setMsg] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  const overlay = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: "new" | "move" | "resize"; id: string; x0: number; y0: number; orig: F } | null>(null);
  const page = pages.find((p) => p.id === renditionId) ?? pages[0]!;
  const sel = fields.find((f) => f.id === selected) ?? null;

  const update = (id: string, p: Partial<F>) => setFields((list) => list.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const pct = (e: React.PointerEvent) => {
    const r = overlay.current!.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) };
  };

  function onDown(e: React.PointerEvent) {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-field]");
    const p = pct(e);
    overlay.current!.setPointerCapture(e.pointerId);
    if (target) {
      const f = fields.find((x) => x.id === target.dataset.field)!;
      setSelected(f.id);
      drag.current = { mode: (e.target as HTMLElement).dataset.handle ? "resize" : "move", id: f.id, x0: p.x, y0: p.y, orig: f };
      return;
    }
    const id = crypto.randomUUID();
    const f: F = { id, key: "", label: `Field ${fields.length + 1}`, default_text: "", x_pct: p.x, y_pct: p.y, w_pct: 1, h_pct: 1,
      font_size_pt: 9, color_hex: "#000000", align: "left", font_css: BUILT_IN[0]!.css, font_weight: 400, cover_color: "#FFFFFF", max_chars: 40, font: null, test: "" };
    setFields((l) => [...l, f]);
    setSelected(id);
    drag.current = { mode: "new", id, x0: p.x, y0: p.y, orig: f };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = pct(e);
    if (d.mode === "new") update(d.id, { x_pct: Math.min(d.x0, p.x), y_pct: Math.min(d.y0, p.y), w_pct: Math.max(0.5, Math.abs(p.x - d.x0)), h_pct: Math.max(0.5, Math.abs(p.y - d.y0)) });
    if (d.mode === "move") update(d.id, { x_pct: clamp(d.orig.x_pct + p.x - d.x0, 0, 100 - d.orig.w_pct), y_pct: clamp(d.orig.y_pct + p.y - d.y0, 0, 100 - d.orig.h_pct) });
    if (d.mode === "resize") update(d.id, { w_pct: clamp(d.orig.w_pct + p.x - d.x0, 0.5, 100 - d.orig.x_pct), h_pct: clamp(d.orig.h_pct + p.y - d.y0, 0.5, 100 - d.orig.y_pct) });
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === "new") {
      const f = fields.find((x) => x.id === d.id);
      if (f && (f.w_pct < 2 || f.h_pct < 1)) setFields((l) => l.filter((x) => x.id !== d.id)); // a click, not a drag
    }
  }

  async function uploadFont(file: File, family: string, weight: number) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["ttf", "otf", "woff", "woff2"].includes(ext)) return setMsg({ error: "Upload a TTF, OTF, WOFF or WOFF2 font." });
    const path = `fonts/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseBrowser().storage.from("assets").upload(path, file, { contentType: "font/" + ext });
    if (error) return setMsg({ error: "Font upload failed." });
    const r = await registerFont({ family, weight, style: "normal", path, name: file.name, size: file.size });
    setMsg(r);
    if (r.id) setFonts((l) => [...l, { id: r.id!, label: `${family} ${weight}`, url: URL.createObjectURL(file) }]);
  }

  const values = Object.fromEntries(fields.map((f) => [f.id, f.test || f.default_text]));
  const canvasFields = fields.map((f) => ({ ...f, font: f.font ? { id: f.font.id, url: fonts.find((x) => x.id === f.font!.id)?.url ?? f.font.url } : null }));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Draw boxes on the artwork</CardTitle>
          {pages.length > 1 ? (
            <Select aria-label="Page" value={renditionId} onChange={(e) => setRenditionId(e.target.value)} className="h-9 w-auto">
              {pages.map((p) => <option key={p.id} value={p.id}>{p.side === "front" ? "Front" : p.side === "back" ? "Back" : `Page ${p.pageNo}`}</option>)}
            </Select>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="relative">
            <TemplateCanvas backgroundUrl={page.url} previewWidth={page.width} previewHeight={page.height} pageWidthPt={page.pageWidthPt} fields={canvasFields} values={values} />
            <div ref={overlay} className="absolute inset-x-0 top-0 cursor-crosshair touch-none select-none" style={{ aspectRatio: `${page.width} / ${page.height}` }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
              {fields.map((f) => (
                <div key={f.id} data-field={f.id} className={cn("absolute cursor-move border-2", f.id === selected ? "border-accent bg-accent/5" : "border-dashed border-primary/80")}
                  style={{ left: `${f.x_pct}%`, top: `${f.y_pct}%`, width: `${f.w_pct}%`, height: `${f.h_pct}%` }}>
                  <span className={cn("absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[10px] font-semibold text-white", f.id === selected ? "bg-accent" : "bg-primary")}>{f.label}</span>
                  <span data-handle="1" className="absolute -bottom-1.5 -right-1.5 size-3 cursor-se-resize rounded-sm border-2 border-white bg-accent" />
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Drag on empty space to add a field. Drag a box to move it; drag its corner to resize. Type “Test text” to check how a client&apos;s change will look.</p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Fields ({fields.length})</CardTitle>
            <Button size="sm" disabled={pending} onClick={() => start(async () => setMsg(await saveTemplate({
              printItemId, renditionId,
              fields: fields.map((f) => ({ label: f.label, default_text: f.default_text, x_pct: r2(f.x_pct), y_pct: r2(f.y_pct), w_pct: r2(f.w_pct), h_pct: r2(f.h_pct),
                font_id: f.font?.id ?? null, font_css: f.font_css, font_weight: f.font_weight, font_size_pt: f.font_size_pt, color_hex: f.color_hex,
                align: f.align, max_chars: f.max_chars, cover_color: f.cover_color })),
            })))}>{pending ? <Loader2 className="animate-spin" /> : <Save />}Save</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {msg?.error ? <Alert tone="danger">{msg.error}</Alert> : null}
            {msg?.message ? <Alert tone="success">{msg.message}</Alert> : null}
            {fields.length === 0 ? <p className="text-sm text-muted-foreground">No fields yet. Drag on the artwork to add one.</p> : null}
            <ul className="space-y-1">{fields.map((f) => (
              <li key={f.id}><button type="button" onClick={() => setSelected(f.id)} className={cn("w-full rounded-md px-2 py-1.5 text-left text-sm", f.id === selected ? "bg-accent-soft font-semibold" : "hover:bg-surface-muted")}>{f.label} <span className="text-muted-foreground">· {f.default_text || "(empty)"}</span></button></li>
            ))}</ul>
          </CardContent>
        </Card>

        {sel ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between"><CardTitle>{sel.label}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => { setFields((l) => l.filter((f) => f.id !== sel.id)); setSelected(null); }}><Trash2 />Remove</Button></CardHeader>
            <CardContent className="space-y-3">
              <Row label="Label (what clients see)"><Input value={sel.label} maxLength={60} onChange={(e) => update(sel.id, { label: e.target.value })} /></Row>
              <Row label="Current text on the artwork"><Input value={sel.default_text} maxLength={500} onChange={(e) => update(sel.id, { default_text: e.target.value })} /></Row>
              <Row label="Test text (not saved)"><Input value={sel.test} onChange={(e) => update(sel.id, { test: e.target.value })} placeholder="Try a long value" /></Row>
              <Row label="Font">
                <Select value={sel.font ? `f:${sel.font.id}` : `b:${sel.font_css}`} onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith("f:")) { const ft = fonts.find((x) => x.id === v.slice(2))!; update(sel.id, { font: { id: ft.id, url: ft.url } }); }
                  else update(sel.id, { font: null, font_css: v.slice(2) });
                }}>
                  <optgroup label="Built-in">{BUILT_IN.map((b) => <option key={b.css} value={`b:${b.css}`}>{b.label}</option>)}</optgroup>
                  {fonts.length ? <optgroup label="Uploaded">{fonts.map((f) => <option key={f.id} value={`f:${f.id}`}>{f.label}</option>)}</optgroup> : null}
                </Select>
              </Row>
              <div className="grid grid-cols-3 gap-2">
                <Row label="Size (pt)"><Input type="number" step="0.5" min={2} value={sel.font_size_pt} onChange={(e) => update(sel.id, { font_size_pt: Number(e.target.value) || 9 })} /></Row>
                <Row label="Weight"><Select value={sel.font_weight} onChange={(e) => update(sel.id, { font_weight: Number(e.target.value) })}><option value={400}>Regular</option><option value={600}>Semibold</option><option value={700}>Bold</option></Select></Row>
                <Row label="Max chars"><Input type="number" min={1} value={sel.max_chars ?? ""} onChange={(e) => update(sel.id, { max_chars: e.target.value ? Number(e.target.value) : null })} /></Row>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Row label="Colour"><input type="color" value={sel.color_hex} onChange={(e) => update(sel.id, { color_hex: e.target.value.toUpperCase() })} className="h-10 w-full cursor-pointer rounded border" aria-label="Text colour" /></Row>
                <Row label="Align"><Select value={sel.align} onChange={(e) => update(sel.id, { align: e.target.value as F["align"] })}><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></Select></Row>
                <Row label="Cover">
                  <div className="flex items-center gap-1">
                    <input type="checkbox" checked={sel.cover_color !== null} onChange={(e) => update(sel.id, { cover_color: e.target.checked ? "#FFFFFF" : null })} aria-label="Cover original text" />
                    {sel.cover_color ? <input type="color" value={sel.cover_color} onChange={(e) => update(sel.id, { cover_color: e.target.value.toUpperCase() })} className="h-9 w-full rounded border" aria-label="Cover colour" /> : <span className="text-xs text-muted-foreground">off</span>}
                  </div>
                </Row>
              </div>
              <p className="text-xs text-muted-foreground">“Cover” paints the box in the background colour first, so the old text disappears under the new text.</p>
            </CardContent>
          </Card>
        ) : null}

        <FontUpload onUpload={uploadFont} />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function FontUpload({ onUpload }: { onUpload: (file: File, family: string, weight: number) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [family, setFamily] = useState("");
  const [weight, setWeight] = useState(400);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader><CardTitle>Upload a font</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">Use the same font as the artwork so the preview looks right (TTF, OTF, WOFF). Fonts are shared across all items.</p>
        <div className="grid grid-cols-[1fr_110px] gap-2">
          <Input placeholder="Font name, e.g. Montserrat" value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Font name" />
          <Select value={weight} onChange={(e) => setWeight(Number(e.target.value))} aria-label="Weight"><option value={400}>Regular</option><option value={600}>Semibold</option><option value={700}>Bold</option></Select>
        </div>
        <Button size="sm" variant="outline" disabled={!family.trim() || busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="animate-spin" /> : <Upload />}Choose font file</Button>
        <input ref={input} type="file" accept=".ttf,.otf,.woff,.woff2" className="sr-only"
          onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy(true); await onUpload(f, family.trim(), weight); setBusy(false); }} />
      </CardContent>
    </Card>
  );
}

const r2 = (n: number) => Math.round(n * 100) / 100;
