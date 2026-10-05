import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end: bill a client, receive the payment with 2% CWT, and check the
 * billing, the journal and the dashboard all reflect it. Runs against the
 * local preview with seeded demo data (AUTH_MODE=dev).
 */
/** Navigate and wait until the page is interactive (React has hydrated), so typed values stick. */
async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

async function signIn(page: Page, role: "Owner" | "Bookkeeper" | "Viewer") {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`Demo ${role}`) }).click();
  await page.waitForURL("**/dashboard**");
}

test("bill → collect with CWT → billing paid, journal balanced, dashboard updated", async ({ page }) => {
  await signIn(page, "Bookkeeper");
  const docNo = `E2E${Date.now().toString().slice(-6)}`;

  // Collections tile before
  await open(page, "/dashboard?period=custom&start=2026-10-01&end=2026-10-31");
  const tile = page.locator("p", { hasText: /^Collections$/ }).locator("..");
  const before = await tile.locator("p.num").innerText();

  // 1. New billing: ₱11,200.00 VAT-inclusive, 2% CWT
  await open(page, "/billings/new");
  await page.getByLabel("Client", { exact: true }).selectOption({ label: "Acme Learning Center Inc." });
  await page.getByLabel("Document no.").fill(docNo);
  await page.getByLabel("Billing date").fill("2026-10-02");
  await page.getByPlaceholder("e.g. Brochures, 1,000 pcs").fill("Flyers A5, 1,000 pcs");
  await page.getByLabel("Qty").fill("1");
  await page.getByLabel("Unit price (₱)").fill("11,200");
  await expect(page.getByText("₱10,000.00")).toBeVisible(); // net of VAT
  await expect(page.getByText("₱1,200.00")).toBeVisible(); // output VAT
  await page.getByRole("button", { name: "Save billing" }).click();
  await page.waitForURL(/\/billings\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: `SI ${docNo}` })).toBeVisible();
  await expect(page.getByText("Accounts Receivable – Trade")).toBeVisible();

  // 2. Receive payment: CWT 2% of ₱10,000 = ₱200 → cash ₱11,000
  await page.getByRole("link", { name: "Receive payment" }).click();
  await page.waitForURL("**/collections/new**");
  await page.waitForLoadState("networkidle");
  const row = page.getByRole("row", { name: new RegExp(docNo) });
  await expect(row.getByRole("checkbox")).toBeChecked();
  await expect(row.locator("input").nth(1)).toHaveValue("11,000.00");
  await expect(row.locator("input").nth(2)).toHaveValue("200.00");
  await page.getByLabel("Receipt no.").fill(`CR-${docNo}`);
  await page.getByLabel("Date received").fill("2026-10-04");
  await page.getByRole("button", { name: /Record payment of ₱11,000.00/ }).click();
  await page.waitForURL("**/collections");
  await expect(page.getByRole("row", { name: new RegExp(`CR-${docNo}`) })).toContainText("2307 pending");

  // 3. Billing is now paid
  await open(page, `/billings?status=paid&q=${docNo}`);
  await expect(page.getByRole("row", { name: new RegExp(docNo) })).toContainText("Paid");

  // 4. Dashboard collections went up by ₱11,200 (cash + CWT)
  await open(page, "/dashboard?period=custom&start=2026-10-01&end=2026-10-31");
  const after = await tile.locator("p.num").innerText();
  const n = (s: string) => Number(s.replace(/[^\d.-]/g, ""));
  expect(Math.round((n(after) - n(before)) * 100)).toBe(1_120_000);

  // 5. Chart of accounts still balances
  await open(page, "/accounts");
  await expect(page.getByText("✓ Balanced")).toBeVisible();
});

test("viewer can read but sees no editing actions", async ({ page }) => {
  await signIn(page, "Viewer");
  await open(page, "/billings");
  await expect(page.getByRole("link", { name: "New billing" })).toHaveCount(0);
  await open(page, "/billings/new");
  await expect(page.getByText(/can only read|Application error|Viewer/i).first()).toBeVisible();
});

test("closed period refuses new transactions", async ({ page }) => {
  await signIn(page, "Owner");
  await open(page, "/settings");
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("To", { exact: true }).fill("2026-08-31");
  await page.getByLabel("From", { exact: true }).fill("2026-08-01");
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-08-01");
  await page.getByRole("button", { name: "Close period" }).click();
  await expect(page.getByText("08/01/2026 – 08/31/2026")).toBeVisible();

  await open(page, "/journal/new");
  await page.getByLabel("Date", { exact: true }).fill("2026-08-15");
  await page.getByPlaceholder(/Depreciation/).fill("Test in closed month");
  const selects = page.locator("select");
  await selects.nth(0).selectOption("6250");
  await selects.nth(1).selectOption("1030");
  const amounts = page.locator('input[inputmode="decimal"]');
  await amounts.nth(0).fill("100");
  await amounts.nth(3).fill("100");
  await page.getByRole("button", { name: "Post entry" }).click();
  await expect(page.getByText(/is closed\. Ask the Owner to unlock it/)).toBeVisible();

  // Owner unlocks with a reason
  await open(page, "/settings");
  page.once("dialog", (d) => d.accept("E2E test unlock"));
  await page.getByRole("button", { name: "Unlock" }).first().click();
  await expect(page.getByText(/Unlocked .*E2E test unlock/)).toBeVisible();
});
