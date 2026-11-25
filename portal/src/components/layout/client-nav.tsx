"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PackageSearch, PlusCircle, Layers, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export const CLIENT_NAV = [
  { href: "/app", label: t.nav.home, Icon: Home, exact: true },
  { href: "/app/order", label: t.nav.order, Icon: PlusCircle },
  { href: "/app/orders", label: t.nav.myOrders, Icon: PackageSearch },
  { href: "/app/items", label: t.nav.myItems, Icon: Layers },
  { href: "/app/account", label: t.nav.account, Icon: UserRound },
];

function isActive(path: string, href: string, exact?: boolean) {
  if (exact) return path === href;
  if (href === "/app/order") return path === "/app/order" || path.startsWith("/app/order/");
  return path === href || path.startsWith(`${href}/`);
}

/** Bottom tab bar on phones. */
export function ClientBottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-surface/95 backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {CLIENT_NAV.map(({ href, label, Icon, exact }) => {
          const active = isActive(path, href, exact);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
                <Icon className={cn("size-6", active && "stroke-[2.4]")} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Sidebar on tablets and desktops. */
export function ClientSideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="space-y-1">
      {CLIENT_NAV.map(({ href, label, Icon, exact }) => {
        const active = isActive(path, href, exact);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium", active ? "bg-primary-soft text-primary" : "text-foreground/80 hover:bg-surface-muted")}>
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
