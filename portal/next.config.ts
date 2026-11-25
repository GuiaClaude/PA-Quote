import type { NextConfig } from "next";

/**
 * Cache Components is OFF on purpose: every screen in this app is private
 * and per-user, so classic always-fresh server rendering is simpler and safer.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  poweredByHeader: false,
  // MuPDF (PDF previews) ships a WebAssembly file; keep it out of the bundle.
  serverExternalPackages: ["mupdf", "sharp"],
  outputFileTracingIncludes: { "/**": ["./node_modules/mupdf/dist/*.wasm", "./node_modules/mupdf/dist/*.js"] },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // The service worker must always be re-checked so updates reach phones quickly.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
    ];
  },
};

export default nextConfig;
