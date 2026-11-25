"use client";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type Markup = {
  key: string; renditionId: string; pageNo: number; shape: "pin" | "box";
  x_pct: number; y_pct: number; w_pct?: number | null; h_pct?: number | null;
  comment: string; number: number; staffStatus?: string | null;
};
export type Tool = "pin" | "box" | "move";

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Transparent layer on top of a preview page. Pins and boxes are stored as
 * PERCENTAGES of the page, so they stay in the right place at any zoom
 * level and on any screen size.
 */
export function MarkupLayer({ markups, tool, editable, activeKey, onAdd, onSelect }: {
  markups: Markup[]; tool: Tool; editable: boolean; activeKey?: string | null;
  onAdd?: (m: Pick<Markup, "shape" | "x_pct" | "y_pct" | "w_pct" | "h_pct">) => void;
  onSelect?: (key: string) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const pct = (e: React.PointerEvent | React.MouseEvent) => {
    const r = layer.current!.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) };
  };
  const drawing = editable && tool !== "move";

  return (
    <div
      ref={layer}
      className={cn("absolute inset-0", drawing && "cursor-crosshair")}
      style={{ touchAction: editable && tool === "box" ? "none" : "auto" }}
      onClick={(e) => {
        if (!editable || tool !== "pin" || (e.target as HTMLElement).closest("[data-markup]")) return;
        const p = pct(e);
        onAdd?.({ shape: "pin", x_pct: p.x, y_pct: p.y });
      }}
      onPointerDown={(e) => {
        if (!editable || tool !== "box" || (e.target as HTMLElement).closest("[data-markup]")) return;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const p = pct(e);
        setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      }}
      onPointerMove={(e) => { if (draft) { const p = pct(e); setDraft({ ...draft, x1: p.x, y1: p.y }); } }}
      onPointerUp={() => {
        if (!draft) return;
        const x = Math.min(draft.x0, draft.x1), y = Math.min(draft.y0, draft.y1);
        const w = Math.abs(draft.x1 - draft.x0), h = Math.abs(draft.y1 - draft.y0);
        setDraft(null);
        if (w > 1 && h > 1) onAdd?.({ shape: "box", x_pct: x, y_pct: y, w_pct: w, h_pct: h });
      }}
    >
      {markups.map((m) => {
        const active = m.key === activeKey;
        const done = m.staffStatus === "done";
        const tone = done ? "bg-success" : active ? "bg-accent" : "bg-primary";
        return m.shape === "box" ? (
          <button key={m.key} type="button" data-markup aria-label={`Change ${m.number}: ${m.comment || "box"}`} onClick={() => onSelect?.(m.key)}
            className={cn("absolute rounded-sm border-2", active ? "border-accent bg-accent/10" : done ? "border-success bg-success/10" : "border-primary bg-primary/10")}
            style={{ left: `${m.x_pct}%`, top: `${m.y_pct}%`, width: `${m.w_pct}%`, height: `${m.h_pct}%` }}>
            <span className={cn("absolute -left-2.5 -top-2.5 flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white shadow", tone)}>{m.number}</span>
          </button>
        ) : (
          <button key={m.key} type="button" data-markup aria-label={`Change ${m.number}: ${m.comment || "pin"}`} onClick={() => onSelect?.(m.key)}
            className={cn("absolute flex size-7 items-center justify-center rounded-full rounded-bl-none text-xs font-bold text-white shadow-md ring-2 ring-white", tone)}
            style={{ left: `${m.x_pct}%`, top: `${m.y_pct}%`, transform: "translate(0, -100%)" }}>
            {/* the pin's pointed bottom-left corner sits exactly on the tapped spot */}
            {m.number}
          </button>
        );
      })}
      {draft ? (
        <div className="pointer-events-none absolute border-2 border-dashed border-accent bg-accent/10"
          style={{ left: `${Math.min(draft.x0, draft.x1)}%`, top: `${Math.min(draft.y0, draft.y1)}%`, width: `${Math.abs(draft.x1 - draft.x0)}%`, height: `${Math.abs(draft.y1 - draft.y0)}%` }} />
      ) : null}
    </div>
  );
}
