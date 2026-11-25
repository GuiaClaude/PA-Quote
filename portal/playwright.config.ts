import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests, on a phone and on a desktop.
 *
 *  - e2e/pwa.spec.ts     install, offline page, service worker, security headers.
 *                        Runs against a local production build (no Supabase needed).
 *  - e2e/flows.spec.ts   the main business flows with the demo accounts. Needs a
 *                        DEMO deployment: set E2E_BASE_URL (and optionally
 *                        E2E_PASSWORD). Skipped otherwise. Never point it at the
 *                        live app — it places real orders.
 *
 *   npm run e2e                      (builds first: npm run build)
 *   E2E_BASE_URL=https://demo.example.com npm run e2e
 */
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? "http://localhost:3300";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "off", screenshot: "only-on-failure", locale: "en-PH", timezoneId: "Asia/Manila" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
  ],
  webServer: external ? undefined : {
    command: "npx next start -p 3300",
    url: "http://localhost:3300/offline",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
