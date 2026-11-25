import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { requireClient } from "@/lib/auth/guards";
import { supabaseServer } from "@/lib/supabase/server";
import { ClientBottomNav, ClientSideNav } from "@/components/layout/client-nav";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { Logo } from "@/components/brand/logo";
import { InstallTracker } from "@/components/layout/install-tracker";
import { getLogoUrl } from "@/lib/brand";
import { t } from "@/i18n";

/** Client app frame: top bar + bottom tabs on phones, sidebar on desktop. */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();
  const sb = await supabaseServer();
  const logoUrl = await getLogoUrl();
  const [{ data: org }, { count: unread }, { data: cart }] = await Promise.all([
    sb.from("organizations").select("name").eq("id", user.organizationId).maybeSingle(),
    sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    sb.from("draft_orders").select("payload").eq("kind", "reorder_cart").eq("created_by", user.id).is("deleted_at", null).limit(1).maybeSingle(),
  ]);
  const cartCount = ((cart?.payload as { lines?: unknown[] } | undefined)?.lines ?? []).length;
  const company = (org?.name as string | undefined) ?? "";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <InstallTracker />
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-surface p-4 lg:flex">
        <Link href="/app" className="px-2 pt-1"><Logo logoUrl={logoUrl} size={28} /></Link>
        <div className="rounded-lg bg-surface-muted px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Company</p>
          <p className="truncate text-sm font-semibold">{company}</p>
        </div>
        <ClientSideNav />
      </aside>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-surface/95 px-4 backdrop-blur sm:px-6">
          <Link href="/app" className="lg:hidden"><Logo logoUrl={logoUrl} size={26} /></Link>
          <p className="hidden truncate text-sm text-muted-foreground lg:block">{t.app.clientPortal}</p>
          <div className="flex items-center gap-1">
            {cartCount > 0 ? (
              <Link href="/app/cart" aria-label={`Reorder cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`} className="relative inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-muted">
                <ShoppingCart className="size-5" aria-hidden />
                <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-white">{cartCount}</span>
              </Link>
            ) : null}
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
