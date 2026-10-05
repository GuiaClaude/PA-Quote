"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { addDays, addMonths } from "@/lib/domain/dates";
import { periodLabel, type Period, type PeriodKind } from "@/lib/domain/periods";
import { cn } from "@/lib/cn";

const KINDS: { k: PeriodKind; label: string }[] = [
  { k: "week", label: "Week" },
  { k: "month", label: "Month" },
  { k: "quarter", label: "Quarter" },
  { k: "year", label: "Year" },
  { k: "custom", label: "Custom" },
];

export function PeriodPicker({ period }: { period: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [custom, setCustom] = useState({ start: period.start, end: period.end });
  const [showCustom, setShowCustom] = useState(period.kind === "custom");

  const go = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const k of ["period", "anchor", "start", "end"]) sp.delete(k);
    for (const [k, v] of Object.entries(next)) sp.set(k, v);
    router.push(`${pathname}?${sp.toString()}`);
  };

  const shift = (dir: -1 | 1) => {
    if (period.kind === "custom") return;
    const anchor =
      period.kind === "week" ? addDays(period.start, 7 * dir)
      : period.kind === "month" ? addMonths(period.start, dir)
      : period.kind === "quarter" ? addMonths(period.start, 3 * dir)
      : addMonths(period.start, 12 * dir);
    go({ period: period.kind, anchor });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="tablist" aria-label="Period">
        {KINDS.map(({ k, label }) => (
          <button
            key={k}
            role="tab"
            aria-selected={(showCustom ? "custom" : period.kind) === k}
            onClick={() => (k === "custom" ? setShowCustom(true) : (setShowCustom(false), go({ period: k, anchor: period.start })))}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
              (showCustom ? "custom" : period.kind) === k ? "bg-brand text-white" : "text-ink-2 hover:bg-surface-2",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {showCustom ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.start <= custom.end) go({ period: "custom", start: custom.start, end: custom.end });
          }}
        >
          <input type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px]" aria-label="From" />
          <span className="text-muted">–</span>
          <input type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px]" aria-label="To" />
          <button className="h-8 rounded-lg bg-brand px-3 text-[12px] font-medium text-white">Apply</button>
        </form>
      ) : (
        <div className="inline-flex items-center rounded-lg border border-line bg-surface">
          <button onClick={() => shift(-1)} className="rounded-l-lg p-1.5 text-ink-2 hover:bg-surface-2" aria-label="Previous period"><ChevronLeft size={16} /></button>
          <span className="min-w-[96px] px-2 text-center text-[13px] font-medium">{periodLabel(period)}</span>
          <button onClick={() => shift(1)} className="rounded-r-lg p-1.5 text-ink-2 hover:bg-surface-2" aria-label="Next period"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
