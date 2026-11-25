import Link from "next/link";
import { Bell } from "lucide-react";

export function NotificationBell({ href, count }: { href: string; count: number }) {
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link href={href} aria-label={label} className="relative inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-muted">
      <Bell className="size-5" aria-hidden />
      {count > 0 ? (
        <span className="absolute right-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-white">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
