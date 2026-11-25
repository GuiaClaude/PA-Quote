import { expect, test } from "@playwright/test";

test.describe("installable app", () => {
  test("manifest has the name, start page, colours and icons", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m).toMatchObject({ short_name: "PA Orders", display: "standalone", start_url: "/app?source=pwa", theme_color: "#0f1b2d" });
    const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? "any"}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of m.icons) expect((await request.get(icon.src)).headers()["content-type"]).toBe("image/png");
  });

  test("iPhone home-screen icon and splash screens are linked", async ({ page, request }) => {
    await page.goto("/offline");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-touch-icon\.png/);
    const splashes = page.locator('link[rel="apple-touch-startup-image"]');
    expect(await splashes.count()).toBeGreaterThanOrEqual(8);
    expect((await request.get((await splashes.first().getAttribute("href"))!)).ok()).toBe(true);
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "PA Orders");
  });

  test("the service worker is served fresh and handles push", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.headers()["cache-control"]).toContain("no-cache");
    const body = await res.text();
    expect(body).toContain('addEventListener("push"');
    expect(body).toContain('addEventListener("notificationclick"');
  });

  test("with no connection, pages show the offline screen (and nothing private is cached)", async ({ page, context }) => {
    await page.goto("/offline");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();                                   // now controlled by the service worker
    const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)))).flat());
    expect(cached.some((p) => p.startsWith("/app") || p.startsWith("/staff") || p.startsWith("/api"))).toBe(false);
    await context.setOffline(true);
    await page.goto("/app/orders").catch(() => undefined);
    await expect(page.getByRole("heading", { name: /you.re offline/i })).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe("security basics", () => {
  test("security headers are sent", async ({ request }) => {
    const h = (await request.get("/offline")).headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("the developer lab does not exist in production", async ({ request }) => {
    expect((await request.get("/dev/lab")).status()).toBe(404);
  });

  test("the push webhook refuses callers without the secret", async ({ request }) => {
    expect((await request.post("/api/push/dispatch")).status()).toBe(401);
  });
});
