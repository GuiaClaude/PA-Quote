import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js must run on the Node.js runtime, never bundled for the browser.
  serverExternalPackages: ["postgres"],
  devIndicators: false,
};

export default nextConfig;
