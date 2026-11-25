import { Check, PauseCircle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

/** The five stages a client cares about. Each detailed status maps to one of them. */
const STAGES = [
  { key: "submitted", label: "Submitted", statuses: ["submitted"] },
  { key: "confirmed", label: "Confirmed", statuses: ["confirmed", "prepress", "waiting_for_revisions", "waiting_for_client_approval", "approved_for_print"] },
  { key: "production", label: "In production", statuses: ["printing", "finishing", "quality_check"] },
  { key: "ready", label: "Ready / on the way", statuses: ["ready_for_pickup", "out_for_delivery"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered", "closed"] },
];

export function OrderProgress({ status }: { status: string }) {
  if (status === "cancelled") return <p className="mb-4 flex items-center gap-2 rounded-lg border bg-surface-muted p-3 text-sm"><Ban className="size-4" />This order was cancelled.</p>;
  const current = STAGES.findIndex((s) => s.statuses.includes(status));
  return (
    <div className="mb-5">
      {status === "on_hold" ? <p className="mb-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"><PauseCircle className="size-4" />On hold — your account manager will contact you.</p> : null}
      <ol className="grid grid-cols-5 gap-1" aria-label="Order progress">
        {STAGES.map((s, i) => {
          const done = current > i || (current === i && s.key === "delivered");
          const now = current === i && !done;
          return (
            <li key={s.key} className="flex flex-col items-center gap-1.5 text-center" aria-current={now ? "step" : undefined}>
              <div className="flex w-full items-center">
                <span className={cn("h-0.5 flex-1", i === 0 ? "opacity-0" : current >= i ? "bg-primary" : "bg-border")} />
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                  done ? "border-primary bg-primary text-white" : now ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-muted-foreground")}>
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={cn("h-0.5 flex-1", i === STAGES.length - 1 ? "opacity-0" : current > i ? "bg-primary" : "bg-border")} />
              </div>
              <span className={cn("text-[11px] leading-tight sm:text-xs", now ? "font-semibold text-foreground" : "text-muted-foreground")}>{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
