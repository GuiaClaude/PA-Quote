"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, PackageSearch, FileText, PenLine, Building2, Layers, FileSpreadsheet, ShoppingBag,
  Percent, UsersRound, Settings, ScrollText, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import type { StaffRole } from "@/lib/auth/roles";

type Item = { href: string; label: string; Icon: LucideIcon; roles?: StaffRole[]; soon?: number; exact?: boolean };
const GROUPS: { label: string; items: Item[] }[] = [
  { label: t.nav.groups.work, items: [
    { href: "/staff", label: t.nav.dashboard, Icon: LayoutDashboard, exact: true },
    { href: "/staff/orders", label: t.nav.orders, Icon: PackageSearch },
    { href: "/staff/quotes", label: t.nav.quotes, Icon: FileText, roles: ["pa_admin", "pa_sales"] },
    { href: "/staff/revisions", label: t.nav.revisions, Icon: PenLine, roles: ["pa_admin", "pa_sales"] },
  ] },
  { label: t.nav.groups.clients, items: [
    { href: "/staff/clients", label: t.nav.clients, Icon: Building2, roles: ["pa_admin", "pa_sales"] },
    { href: "/staff/items", label: t.nav.printItems, Icon: Layers },
    { href: "/staff/estimates", label: t.nav.estimates, Icon: FileSpreadsheet, roles: ["pa_admin", "pa_sales"], soon: 5 },
  ] },
  { label: t.nav.groups.catalog, items: [
    { href: "/staff/catalog", label: t.nav.catalog, Icon: ShoppingBag, roles: ["pa_admin", "pa_sales"], soon: 4 },
    { href: "/staff/pricing", label: t.nav.pricing, Icon: Percent, roles: ["pa_admin", "pa_sales"], soon: 5 },
  ] },
  { label: t.nav.groups.admin, items: [
    { href: "/staff/staff-users", label: t.nav.staffUsers, Icon: UsersRound, roles: ["pa_admin"] },
    { href: "/staff/settings", label: t.nav.settings, Icon: Settings, roles: ["pa_admin", "pa_sales"] },
    { href: "/staff/audit", label: t.nav.audit, Icon: ScrollText, roles: ["pa_admin"] },
  ] },
];

export function StaffNav({ role, badges = {}, onNavigate }: { role: StaffRole; badges?: Record<string, number>; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Staff" className="space-y-6">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => !i.roles || i.roles.includes(role));
        if (!items.length) return null;
        return (
          <div key={g.label}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">{g.label}</p>
            <ul className="space-y-0.5">
              {items.map(({ href, label, Icon, soon, exact }) => {
                const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
                const badge = badges[href];
                if (soon) {
                  return (
                    <li key={href}>
                      <span aria-disabled className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/45" title={t.common.phaseNote(soon)}>
                        <Icon className="size-[18px]" aria-hidden />
                        <span className="flex-1">{label}</span>
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase">{t.nav.comingSoon}</span>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={href}>
                    <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                      className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                        active ? "bg-sidebar-active text-white" : "text-sidebar-foreground hover:bg-white/5 hover:text-white")}>
                      <Icon className="size-[18px]" aria-hidden />
                      <span className="flex-1">{label}</span>
                      {badge ? <span className="rounded-full bg-accent px-2 text-[11px] font-bold leading-5 text-white">{badge}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
