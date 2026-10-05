import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

/** Status tabs + search box that work through the URL (no client JS needed). */
export function ListFilters({ base, tabs, active, q, extra }: { base: string; tabs: { key: string; label: string; count?: number }[]; active: string; q?: string; extra?: Record<string, string> }) {
  const href = (status: string) => {
    const sp = new URLSearchParams({ ...(extra ?? {}), ...(q ? { q } : {}), status });
    return `${base}?${sp.toString()}`;
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-2.5">
      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            className={cn("rounded-md px-2.5 py-1 text-[13px] font-medium", active === t.key ? "bg-brand-soft text-brand-strong" : "text-ink-2 hover:bg-surface-2")}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1 text-muted">{t.count}</span>}
          </Link>
        ))}
      </div>
      <form action={base} className="relative w-full sm:w-64">
        <input type="hidden" name="status" value={active} />
        {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input name="q" defaultValue={q} placeholder="Search…" className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
      </form>
    </div>
  );
}
