"use client";
import Link from "next/link";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { LogOut, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { t } from "@/i18n";

export function UserMenu({ name, subtitle, accountHref }: { name: string; subtitle: string; accountHref: string }) {
  return (
    <Menu.Root>
      <Menu.Trigger className="flex items-center gap-2 rounded-full p-0.5 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring" aria-label="Account menu">
        <Avatar name={name} className="size-8 text-xs" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={8} className="z-50 min-w-56 rounded-xl border bg-surface p-1 shadow-lg">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item asChild>
            <Link href={accountHref} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-surface-muted">
              <UserRound className="size-4" /> {t.nav.account}
            </Link>
          </Menu.Item>
          <form action="/auth/signout" method="post">
            <Menu.Item asChild>
              <button type="submit" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-danger-soft">
                <LogOut className="size-4" /> {t.nav.signOut}
              </button>
            </Menu.Item>
          </form>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
