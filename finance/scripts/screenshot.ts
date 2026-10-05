/**
 * Takes screenshots of pages for review: tsx scripts/screenshot.ts <outDir> <role> <path>[::name] ...
 * Signs in through the demo login (AUTH_MODE=dev), so it only works against a local preview.
 */
import { chromium } from "@playwright/test";

async function main() {
  const [outDir, role, ...paths] = process.argv.slice(2);
  const base = process.env.BASE_URL ?? "http://localhost:3000";
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const mobile = process.env.MOBILE === "1";
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: mobile ? 2 : 1 });
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: new RegExp(role!, "i") }).first().click();
  await page.waitForURL("**/dashboard**");
  for (const p of paths) {
    const [path, name] = p.split("::");
    await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const file = `${outDir}/${name ?? path!.replace(/[^a-z0-9]+/gi, "_")}.png`;
    await page.screenshot({ path: file, fullPage: process.env.FULL !== "0" });
    console.log(file);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
