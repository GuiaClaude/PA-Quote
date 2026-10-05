"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen, Briefcase, Building2, FileText, HandCoins, LayoutDashboard, ListTree, LogOut, Menu, Receipt, Settings, Truck, Users, Wallet, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo, Wordmark } from "./logo";

const NAV = [
  { group: "", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    group: "Sales",
    items: [
      { href: "/billings", label: "Billings", icon: FileText },
      { href: "/collections", label: "Collections", icon: HandCoins },
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/projects", label: "Projects / CE#", icon: Briefcase },
    ],
  },
  {
    group: "Purchases",
    items: [
      { href: "/purchases", label: "Bills", icon: Receipt },
      { href: "/payments", label: "Payments", icon: Wallet },
      { href: "/suppliers", label: "Suppliers", icon: Truck },
    ],
  },
  {
    group: "Accounting",
    items: [
      { href: "/journal", label: "Journal entries", icon: BookOpen },
      { href: "/accounts", label: "Chart of accounts", icon: ListTree },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function AppShell({ user, children }: { user: { name: string; role: string; orgName: string }; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
      {NAV.map((g) => (
        <div key={g.group || "main"}>
          {g.group && <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.group}</p>}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = pathname === it.href || pathname.startsWith(it.href + "/");
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors",
                      active ? "bg-brand-soft text-brand-strong" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const userBox = (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand-strong">
          {user.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{user.name}</p>
          <p className="truncate text-[12px] capitalize text-muted">{user.role}</p>
        </div>
        <form action="/logout" method="post">
          <button className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink" title="Sign out" aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <Logo size={26} />
          <Wordmark />
        </div>
        <div className="flex items-center gap-1.5 px-5 pt-3 text-[12px] text-muted">
          <Building2 size={13} /> <span className="truncate">{user.orgName}</span>
        </div>
        {nav}
        {userBox}
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="-ml-1 rounded-md p-1.5 text-ink-2 hover:bg-surface-2" aria-label="Open menu">
          <Menu size={20} />
        </button>
        <Logo size={24} />
        <Wordmark />
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <div className="flex items-center gap-2"><Logo size={24} /><Wordmark /></div>
              <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2" aria-label="Close menu"><X size={18} /></button>
            </div>
            {nav}
            {userBox}
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
