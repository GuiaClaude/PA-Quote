import Link from "next/link";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function NotificationList({ items }: { items: { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }[] }) {
  if (!items.length) return <EmptyState Icon={Bell} title="You're all caught up." description="We'll let you know when a quote is ready, a proof needs approval or an order moves." />;
  return (
    <Card>
      <ul className="divide-y">
        {items.map((n) => {
          const body = (
            <div className="flex gap-3 px-4 py-3">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} aria-label={n.read_at ? undefined : "Unread"} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</p>
                {n.body ? <p className="truncate text-sm text-muted-foreground">{n.body}</p> : null}
                <p className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
              </div>
            </div>
          );
          return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-surface-muted">{body}</Link> : body}</li>;
        })}
      </ul>
    </Card>
  );
}
