"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, Minus, Plus, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewerPage = { id: string; url: string; width: number; height: number; pageNo: number; side: string | null; fileName: string };

const ZOOMS = [1, 1.5, 2, 3, 4];

function pageLabel(p: ViewerPage, all: ViewerPage[]) {
  const sameFile = all.filter((x) => x.fileName === p.fileName);
  const files = new Set(all.map((x) => x.fileName)).size;
  const base = p.side === "front" ? "Front" : p.side === "back" ? "Back" : `Page ${p.pageNo}`;
  return files > 1 && sameFile.length >= 1 ? `${base} · ${p.fileName}` : base;
}

/**
 * VIEW-ONLY low-res preview: zoom, page by page, front and back.
 * There is no download button; right-click, long-press and dragging are
 * disabled; the image links are signed and expire after 10 minutes.
 * (Determined people can always screenshot — which is why previews are
 * low-res and watermarked, and the print files never reach the browser.)
 */
export function PreviewViewer({ pages, compact = false, overlay }: {
  pages: ViewerPage[]; compact?: boolean; overlay?: (page: ViewerPage) => React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(0);
  const page = pages[Math.min(index, pages.length - 1)];
  const go = useCallback((d: number) => { setIndex((i) => Math.max(0, Math.min(pages.length - 1, i + d))); setZoom(0); }, [pages.length]);
  const block = (e: React.SyntheticEvent) => e.preventDefault();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(ZOOMS.length - 1, z + 1));
      if (e.key === "-") setZoom((z) => Math.max(0, z - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!page) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl bg-surface-muted text-sm text-muted-foreground">
        <ImageOff className="size-8" aria-hidden />Preview not available yet.
      </div>
    );
  }
  const scale = ZOOMS[zoom]!;

  return (
    <div className="select-none space-y-3" onContextMenu={block} style={{ WebkitTouchCallout: "none" }}>
      {pages.length > 1 ? (
        <div role="tablist" aria-label="Pages" className="flex gap-1 overflow-x-auto pb-1">
          {pages.map((p, i) => (
            <button key={p.id} role="tab" aria-selected={i === index} onClick={() => { setIndex(i); setZoom(0); }}
              className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium", i === index ? "border-primary bg-primary-soft text-primary" : "bg-surface hover:bg-surface-muted")}>
              {pageLabel(p, pages)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative overflow-auto rounded-xl border bg-[repeating-conic-gradient(#f1f3f6_0_25%,#fff_0_50%)] bg-[length:20px_20px]"
        style={{ maxHeight: compact ? 420 : "70dvh" }}>
        <div className="relative mx-auto" style={{ width: `${scale * 100}%`, aspectRatio: `${page.width} / ${page.height}`, maxWidth: scale === 1 ? `${page.width}px` : undefined }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.url} alt={`${pageLabel(page, pages)} — preview only`} draggable={false} onDragStart={block}
            onDoubleClick={() => setZoom((z) => (z === 0 ? 2 : 0))}
            className="pointer-events-auto absolute inset-0 size-full object-contain" />
          {overlay ? <div className="absolute inset-0">{overlay(page)}</div> : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="Previous page" disabled={index === 0} onClick={() => go(-1)}><ChevronLeft /></Button>
          <span className="tabular min-w-16 text-center text-xs text-muted-foreground">{index + 1} / {pages.length}</span>
          <Button size="icon" variant="outline" aria-label="Next page" disabled={index >= pages.length - 1} onClick={() => go(1)}><ChevronRight /></Button>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}><Minus /></Button>
          <span className="tabular min-w-12 text-center text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
          <Button size="icon" variant="outline" aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}><Plus /></Button>
          <Button size="icon" variant="ghost" aria-label="Fit to screen" onClick={() => setZoom(0)}><Maximize2 /></Button>
        </div>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">Low-resolution preview only · not for printing</p>
    </div>
  );
}
