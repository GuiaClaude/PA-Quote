import Link from "next/link";
import { requireStaff } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { StaffNav } from "@/components/layout/staff-nav";
import { StaffMobileNav } from "@/components/layout/staff-mobile-nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { Logo } from "@/components/brand/logo";
import { getLogoUrl } from "@/lib/brand";
import { t } from "@/i18n";

/** Uploads make previews in the background after the response; give them time (Vercel limit). */
export const maxDuration = 60;

/** Staff frame: dark sidebar (drawer on phones), top bar with notifications and account. */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const sb = await supabaseServer();
  const logoUrl = await getLogoUrl();
  const [{ count: unread }, { count: newOrders }] = await Promise.all([
    sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "submitted").is("deleted_at", null),
  ]);
  const badges = { "/staff/orders": newOrders ?? 0 };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 overflow-y-auto bg-sidebar px-3 py-5 lg:flex">
        <Link href="/staff" className="px-3"><Logo logoUrl={logoUrl} inverted size={28} /></Link>
        <StaffNav role={user.staffRole} badges={badges} />
        <p className="mt-auto px-3 text-[11px] text-sidebar-foreground/50">{t.roles[user.staffRole]}</p>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-surface/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <StaffMobileNav role={user.staffRole} badges={badges} />
            <Link href="/staff" className="lg:hidden"><Logo logoUrl={logoUrl} size={24} /></Link>
            <span className="hidden text-sm font-medium text-muted-foreground lg:inline">{t.app.name} · {t.app.staffPortal}</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell href="/staff/notifications" count={unread ?? 0} />
            <UserMenu name={user.fullName} subtitle={`${t.roles[user.staffRole]} · ${user.email}`} accountHref="/staff/account" />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
