import Link from "next/link";
import { cn } from "@/lib/utils";

/** Filter chips that live in the URL, so filtered lists can be bookmarked and shared. */
export function FilterChips({ options, active, param, base }: {
  options: { value: string; label: string; count?: number }[]; active: string | undefined; param: string; base: string;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="list">
      {options.map((o) => {
        const isActive = (active ?? "") === o.value;
        const href = o.value ? `${base}?${param}=${encodeURIComponent(o.value)}` : base;
        return (
          <Link role="listitem" key={o.value || "all"} href={href} aria-current={isActive ? "true" : undefined}
            className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium",
              isActive ? "border-primary bg-primary-soft text-primary" : "bg-surface hover:bg-surface-muted")}>
            {o.label}
            {o.count !== undefined ? <span className="tabular text-xs text-muted-foreground">{o.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
