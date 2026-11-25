import { Logo } from "@/components/brand/logo";
import Link from "next/link";
import { getLogoUrl } from "@/lib/brand";
import { t } from "@/i18n";

/** Shared frame for sign-in screens: brand panel on desktop, simple card on phones. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const logoUrl = await getLogoUrl();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo logoUrl={logoUrl} inverted size={36} />
        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight">Reorder in seconds. Every approved file, colour standard and price in one place.</h2>
          <ul className="mt-6 space-y-2 text-sidebar-foreground">
            <li>• One-tap reorders with instant quotes</li>
            <li>• Approved artwork and colour standards kept safe</li>
            <li>• Track every order until delivery</li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/70">© Print Amplified · <Link className="underline" href="/privacy">{t.auth.privacy}</Link></p>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-[var(--brand)]/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-10 size-96 rounded-full bg-[var(--accent-brand)]/20 blur-3xl" />
      </aside>
      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 lg:hidden"><Logo logoUrl={logoUrl} size={34} /></div>
        <div className="w-full max-w-sm">{children}</div>
        <p className="mt-8 text-center text-xs text-muted-foreground lg:hidden">
          <Link className="underline" href="/privacy">{t.auth.privacy}</Link>
        </p>
      </main>
    </div>
  );
}
