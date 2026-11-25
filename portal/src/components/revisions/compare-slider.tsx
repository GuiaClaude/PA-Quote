"use client";
import { useState } from "react";
import { Columns2, SplitSquareHorizontal } from "lucide-react";
import type { ViewerPage } from "@/components/files/preview-viewer";
import { cn } from "@/lib/utils";

/**
 * Previous version vs revised proof: drag the slider to wipe between them,
 * or view them side by side. Pages are matched in order (page 1 vs page 1…).
 */
export function CompareSlider({ before, after, beforeLabel = "Previous", afterLabel = "Revised proof" }: {
  before: ViewerPage[]; after: ViewerPage[]; beforeLabel?: string; afterLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState(50);
  const [mode, setMode] = useState<"slider" | "side">("slider");
  const count = Math.max(before.length, after.length);
  const b = before[Math.min(index, before.length - 1)];
  const a = after[Math.min(index, after.length - 1)];
  if (!a) return <p className="text-sm text-muted-foreground">The proof preview isn&apos;t ready yet.</p>;
  const ratio = `${a.width} / ${a.height}`;
  const block = (e: React.SyntheticEvent) => e.preventDefault();

  return (
    <div className="space-y-3 select-none" onContextMenu={block}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {count > 1 ? (
          <div role="tablist" aria-label="Pages" className="flex gap-1 overflow-x-auto">
            {Array.from({ length: count }, (_, i) => (
              <button key={i} role="tab" aria-selected={i === index} onClick={() => setIndex(i)}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium", i === index ? "border-primary bg-primary-soft text-primary" : "bg-surface")}>
                {after[i]?.side === "front" ? "Front" : after[i]?.side === "back" ? "Back" : `Page ${i + 1}`}
              </button>
            ))}
          </div>
        ) : <span />}
        <div role="radiogroup" aria-label="Compare mode" className="flex rounded-lg border p-0.5 text-xs font-medium">
          <button role="radio" aria-checked={mode === "slider"} onClick={() => setMode("slider")} className={cn("flex items-center gap-1 rounded-md px-2 py-1", mode === "slider" && "bg-primary-soft text-primary")}><SplitSquareHorizontal className="size-3.5" />Slider</button>
          <button role="radio" aria-checked={mode === "side"} onClick={() => setMode("side")} className={cn("flex items-center gap-1 rounded-md px-2 py-1", mode === "side" && "bg-primary-soft text-primary")}><Columns2 className="size-3.5" />Side by side</button>
        </div>
      </div>

      {mode === "slider" ? (
        <>
          <div className="relative w-full overflow-hidden rounded-xl border bg-surface-muted" style={{ aspectRatio: ratio }}>
            {b ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.url} alt={`${beforeLabel} — preview`} draggable={false} className="absolute inset-0 size-full object-contain" />
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={`${afterLabel} — preview`} draggable={false} className="absolute inset-0 size-full object-contain"
              style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
            <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent shadow" style={{ left: `${pos}%` }}>
              <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent px-2 py-1 text-[10px] font-bold text-white">⟷</span>
            </div>
            <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">{beforeLabel}</span>
            <span className="absolute right-2 top-2 rounded bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">{afterLabel}</span>
          </div>
          <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="w-full accent-[var(--accent)]"
            aria-label={`Slide to compare ${beforeLabel} and ${afterLabel}`} />
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {[[beforeLabel, b], [afterLabel, a]].map(([label, p]) => (
            <figure key={label as string} className="space-y-1">
              <figcaption className="text-xs font-semibold text-muted-foreground">{label as string}</figcaption>
              {p ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(p as ViewerPage).url} alt={`${label as string} — preview`} draggable={false} className="w-full rounded-lg border" />
              ) : <div className="flex aspect-[4/3] items-center justify-center rounded-lg border text-xs text-muted-foreground">No page</div>}
            </figure>
          ))}
        </div>
      )}
      <p className="text-center text-[11px] text-muted-foreground">Low-resolution previews only · not for printing</p>
    </div>
  );
}
