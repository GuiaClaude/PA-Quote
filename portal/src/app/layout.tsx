import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { brandCssVars } from "@/theme/color";
import { t } from "@/i18n";

// Private, per-user app: always render on request (branding comes from Settings).
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: t.app.name, template: `%s · ${t.app.name}` },
  description: t.app.tagline,
  applicationName: t.app.name,
  robots: { index: false, follow: false }, // private, invite-only app
};

export const viewport: Viewport = {
  themeColor: "#0f1b2d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

async function loadBrandVars(): Promise<Record<string, string>> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return {};
  try {
    const { getSetting } = await import("@/lib/settings");
    const b = await getSetting("branding");
    return brandCssVars(b.primary, b.accent);
  } catch {
    return {};
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const vars = await loadBrandVars();
  return (
    <html lang="en" className={inter.variable} style={vars as React.CSSProperties}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
