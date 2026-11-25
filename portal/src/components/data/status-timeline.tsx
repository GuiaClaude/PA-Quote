import { FileText, Lock } from "lucide-react";
import { ORDER_STATUS_META } from "./status-badge";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export type TimelinePhoto = { id: string; url: string | null; name: string; kind: string; isImage: boolean };
export type TimelineEvent = { id: string; to_status: string; from_status?: string | null; note: string | null; created_at: string; client_visible?: boolean; photos?: TimelinePhoto[] };

const KIND: Record<string, string> = { production_photo: "Production photo", delivery_photo: "Delivery photo", delivery_receipt: "Delivery receipt", other: "File" };

/** Newest first. Each step shows the date and time, the note, and any photos or receipts. */
export function StatusTimeline({ events, audience = "client" }: { events: TimelineEvent[]; audience?: "client" | "staff" }) {
  const sorted = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!sorted.length) return <p className="text-sm text-muted-foreground">No updates yet.</p>;
  return (
    <ol className="relative space-y-5 border-l pl-6">
      {sorted.map((e, i) => {
        const meta = ORDER_STATUS_META[e.to_status];
        const Icon = meta?.Icon;
        const sameStatus = e.from_status && e.from_status === e.to_status;
        let label = sameStatus ? "Update" : (t.status as Record<string, string>)[e.to_status] ?? e.to_status;
        if (!sameStatus && audience === "staff" && e.to_status === "waiting_for_client_approval") label = "Waiting for Client Approval";
        return (
          <li key={e.id} className="relative">
            <span className={cn("absolute -left-[37px] flex size-6 items-center justify-center rounded-full border-2 border-surface",
              i === 0 ? "bg-primary text-white" : "bg-neutral-soft text-neutral")}>
              {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
            </span>
            <p className={cn("flex items-center gap-1.5 text-sm font-semibold", i !== 0 && "text-foreground/80")}>
              {label}
              {audience === "staff" && e.client_visible === false ? <span className="inline-flex items-center gap-0.5 rounded bg-surface-muted px-1.5 text-[11px] font-medium text-muted-foreground"><Lock className="size-3" />internal</span> : null}
            </p>
            <p className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</p>
            {e.note ? <p className="mt-1 whitespace-pre-line text-sm">{e.note}</p> : null}
            {e.photos?.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {e.photos.map((p) => (
                  <li key={p.id}>
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="block focus-visible:outline-2 focus-visible:outline-primary" title={`${KIND[p.kind] ?? "File"}: ${p.name}`}>
                        {p.isImage
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={p.url} alt={`${KIND[p.kind] ?? "Photo"}: ${p.name}`} className="size-20 rounded-lg border object-cover" loading="lazy" />
                          : <span className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-lg border bg-surface-muted p-1 text-center text-[11px]"><FileText className="size-5" />{KIND[p.kind] ?? "File"}</span>}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
