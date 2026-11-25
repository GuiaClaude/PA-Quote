"use client";
import { useEffect, useRef, useState } from "react";
import { boxPx, fitFontSize, isChanged, pxPerPt, textX } from "@/lib/templates/layout";

export type CanvasField = {
  id: string; key: string; label: string; default_text: string;
  x_pct: number; y_pct: number; w_pct: number; h_pct: number;
  font_size_pt: number; color_hex: string; align: "left" | "center" | "right";
  font_css: string; font_weight: number; cover_color: string | null; max_chars: number | null;
  font: { id: string; url: string } | null;
};

const loadedFonts = new Map<string, Promise<void>>();
function loadFont(f: { id: string; url: string }) {
  if (!loadedFonts.has(f.id)) {
    const face = new FontFace(`pa-font-${f.id}`, `url(${f.url})`);
    loadedFonts.set(f.id, face.load().then((ff) => { document.fonts.add(ff); }).catch(() => undefined));
  }
  return loadedFonts.get(f.id)!;
}

/**
 * Draws the low-res preview on a canvas and paints the client's edited text
 * into the boxes staff defined — instantly, in the browser. Only changed
 * fields are painted (covering the original text with the box colour).
 * Nothing here is used for printing: prepress prepares the real file.
 */
export function TemplateCanvas({
  backgroundUrl, previewWidth, previewHeight, pageWidthPt, fields, values, outline = false, selectedId, className,
}: {
  backgroundUrl: string; previewWidth: number; previewHeight: number; pageWidthPt: number | null;
  fields: CanvasField[]; values: Record<string, string>; outline?: boolean; selectedId?: string | null; className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [width, setWidth] = useState(0);
  const [fontsReady, setFontsReady] = useState(0);

  useEffect(() => {
    const i = new Image();
    i.decoding = "async";
    i.onload = () => setImg(i);
    i.src = backgroundUrl;
  }, [backgroundUrl]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const list = fields.map((f) => f.font).filter((f): f is { id: string; url: string } => Boolean(f));
    if (!list.length) return;
    let alive = true;
    Promise.all(list.map(loadFont)).then(() => { if (alive) setFontsReady((n) => n + 1); });
    return () => { alive = false; };
  }, [fields]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img || !width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = width, H = Math.round((width * previewHeight) / previewWidth);
    c.width = W * dpr; c.height = H * dpr;
    c.style.width = `${W}px`; c.style.height = `${H}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    const scale = pxPerPt(W, pageWidthPt, previewWidth);

    for (const f of fields) {
      const b = boxPx(f, W, H);
      const value = values[f.id];
      if (isChanged(value, f.default_text)) {
        if (f.cover_color) { ctx.fillStyle = f.cover_color; ctx.fillRect(b.x, b.y, b.w, b.h); }
        const family = f.font ? `"pa-font-${f.font.id}", ${f.font_css}` : f.font_css;
        const wanted = f.font_size_pt * scale;
        const size = fitFontSize(wanted, b.w, b.h, (s) => { ctx.font = `${f.font_weight} ${s}px ${family}`; return ctx.measureText(value).width; });
        ctx.font = `${f.font_weight} ${size}px ${family}`;
        ctx.fillStyle = f.color_hex;
        ctx.textAlign = f.align;
        ctx.textBaseline = "middle";
        ctx.fillText(value, textX(f.align, b.x, b.w), b.y + b.h / 2, b.w);
      }
      if (outline) {
        ctx.save();
        ctx.setLineDash(f.id === selectedId ? [] : [4, 3]);
        ctx.lineWidth = f.id === selectedId ? 2 : 1;
        ctx.strokeStyle = f.id === selectedId ? "#C81E4E" : "#007C89";
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = f.id === selectedId ? "#C81E4E" : "#007C89";
        ctx.font = "600 10px system-ui, sans-serif";
        ctx.textAlign = "left"; ctx.textBaseline = "bottom";
        ctx.fillText(f.label, b.x, Math.max(10, b.y - 2));
        ctx.restore();
      }
    }
  }, [img, width, fields, values, outline, selectedId, previewWidth, previewHeight, pageWidthPt, fontsReady]);

  return (
    <div ref={wrap} className={className} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvas} role="img" aria-label="Live preview of your text changes" className="block w-full select-none rounded-lg border" />
      <p className="mt-2 text-center text-[11px] font-medium text-muted-foreground">Preview only — final file will be prepared by Print Amplified prepress</p>
    </div>
  );
}
