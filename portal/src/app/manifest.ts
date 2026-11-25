import type { MetadataRoute } from "next";
import { t } from "@/i18n";

/** "Add to Home Screen": app name, icons, colours and the start screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: t.app.name,
    short_name: "PA Orders",
    description: t.app.tagline,
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f1b2d",
    theme_color: "#0f1b2d",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Reorder", url: "/app/items", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My orders", url: "/app/orders", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
