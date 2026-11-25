"use client";
import { useState } from "react";
import { Menu } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { StaffNav } from "./staff-nav";
import { Logo } from "@/components/brand/logo";
import type { StaffRole } from "@/lib/auth/roles";

/** On phones the staff sidebar becomes a slide-in drawer. */
export function StaffMobileNav({ role, badges }: { role: StaffRole; badges: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface-muted lg:hidden" aria-label="Open menu">
        <Menu className="size-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 lg:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto bg-sidebar p-4 lg:hidden">
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <div className="mb-6 px-2"><Logo inverted size={28} /></div>
          <StaffNav role={role} badges={badges} onNavigate={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
