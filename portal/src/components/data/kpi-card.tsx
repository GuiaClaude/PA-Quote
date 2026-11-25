import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Dashboard KPI: value, label, a hint (e.g. "Oldest: 30 hours") and a link to the filtered list. */
export function KpiCard({
  label, value, hint, href, Icon, tone = "brand", urgent = false,
}: {
  label: string; value: number | string; hint?: string; href: string; Icon: LucideIcon;
  tone?: "brand" | "warning" | "danger" | "info" | "success" | "accent"; urgent?: boolean;
}) {
  const toneCls = {
    brand: "bg-primary-soft text-primary", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info", success: "bg-success-soft text-success", accent: "bg-accent-soft text-accent",
  }[tone];
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-primary/40 hover:shadow-md",
        urgent && "border-danger/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("inline-flex size-9 items-center justify-center rounded-lg", toneCls)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden />
      </div>
      <div>
        <div className="tabular text-2xl font-bold leading-tight">{value}</div>
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
      </div>
      {hint ? <div className={cn("text-xs font-medium", urgent ? "text-danger" : "text-muted-foreground")}>{hint}</div> : null}
    </Link>
  );
}
