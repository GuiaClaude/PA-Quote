import { ORDER_STATUS_META } from "./status-badge";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export function StatusTimeline({ events, audience = "client" }: {
  events: { id: string; to_status: string; note: string | null; created_at: string }[]; audience?: "client" | "staff";
}) {
  const sorted = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!sorted.length) return <p className="text-sm text-muted-foreground">No updates yet.</p>;
  return (
    <ol className="relative space-y-5 border-l pl-6">
      {sorted.map((e, i) => {
        const meta = ORDER_STATUS_META[e.to_status];
        const Icon = meta?.Icon;
        let label = (t.status as Record<string, string>)[e.to_status] ?? e.to_status;
        if (audience === "staff" && e.to_status === "waiting_for_client_approval") label = "Waiting for Client Approval";
        return (
          <li key={e.id} className="relative">
            <span className={cn("absolute -left-[37px] flex size-6 items-center justify-center rounded-full border-2 border-surface",
              i === 0 ? "bg-primary text-white" : "bg-neutral-soft text-neutral")}>
              {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
            </span>
            <p className={cn("text-sm font-semibold", i !== 0 && "text-foreground/80")}>{label}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</p>
            {e.note ? <p className="mt-1 text-sm">{e.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
