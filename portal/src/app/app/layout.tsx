import Link from "next/link";
import { requireClient } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { ClientBottomNav, ClientSideNav } from "@/components/layout/client-nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { Logo } from "@/components/brand/logo";
import { InstallTracker } from "@/components/layout/install-tracker";
import { t } from "@/i18n";

/** Client app frame: top bar + bottom tabs on phones, sidebar on desktop. */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();
  const sb = await supabaseServer();
  const [{ data: org }, { count: unread }] = await Promise.all([
    sb.from("organizations").select("name").eq("id", user.organizationId).maybeSingle(),
    sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  const company = (org?.name as string | undefined) ?? "";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <InstallTracker />
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-surface p-4 lg:flex">
        <Link href="/app" className="px-2 pt-1"><Logo size={28} /></Link>
        <div className="rounded-lg bg-surface-muted px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Company</p>
          <p className="truncate text-sm font-semibold">{company}</p>
        </div>
        <ClientSideNav />
      </aside>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-surface/95 px-4 backdrop-blur sm:px-6">
          <Link href="/app" className="lg:hidden"><Logo size={26} /></Link>
          <p className="hidden truncate text-sm text-muted-foreground lg:block">{t.app.clientPortal}</p>
          <div className="flex items-center gap-1">
            <NotificationBell href="/app/notifications" count={unread ?? 0} />
            <UserMenu name={user.fullName} subtitle={`${company} · ${t.roles[user.clientRole]}`} accountHref="/app/account" />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-10">{children}</main>
      </div>
      <ClientBottomNav />
    </div>
  );
}
