import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Print Amplified Finance", template: "%s · PA Finance" },
  description: "Billing, collections, purchases, payables and reports for Print Amplified OPC",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0097a7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen font-sans text-[14px]">{children}</body>
    </html>
  );
}
