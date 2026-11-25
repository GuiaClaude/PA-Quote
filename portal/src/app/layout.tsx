import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { brandCssVars } from "@/theme/color";
import { t } from "@/i18n";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";

// Private, per-user app: always render on request (branding comes from Settings).
export const dynamic = "force-dynamic";

const SPLASH: [number, number, number][] = [[750, 1334, 2], [828, 1792, 2], [1125, 2436, 3], [1170, 2532, 3], [1179, 2556, 3], [1242, 2688, 3], [1284, 2778, 3], [1290, 2796, 3], [1320, 2868, 3]];
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: t.app.name, template: `%s · ${t.app.name}` },
  description: t.app.tagline,
  applicationName: t.app.name,
  robots: { index: false, follow: false }, // private, invite-only app
  icons: {
    icon: [{ url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" }, { url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "PA Orders",
    statusBarStyle: "black-translucent",
    // iPhone splash screens (portrait), one per screen size
    startupImage: SPLASH.map(([w, h, r]) => ({
      url: `/splash/iphone-${w}x${h}.png`,
      media: `(device-width: ${w / r}px) and (device-height: ${h / r}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
    })),
  },
  formatDetection: { telephone: false },
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
      <body className="min-h-dvh">{children}<ServiceWorkerRegister /></body>
    </html>
  );
}
