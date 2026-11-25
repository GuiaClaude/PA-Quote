import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * The main flows, end to end, with the DEMO accounts on a DEMO deployment
 * (2-step verification off, as in the demo seed; Turnstile off or using
 * Cloudflare's always-pass test keys). Skipped unless E2E_BASE_URL is set.
 */
const ON = Boolean(process.env.E2E_BASE_URL);
const PASSWORD = process.env.E2E_PASSWORD ?? "Demo-Print-2026!";
test.skip(!ON, "Set E2E_BASE_URL to a demo deployment to run the business flows.");

async function signIn(browser: Browser, email: string, project: { use: { viewport?: { width: number; height: number } | null } }): Promise<Page> {
  const ctx = await browser.newContext({ viewport: project.use.viewport ?? undefined });
  const page = await ctx.newPage();
  await page.goto("/login");
  const tab = page.getByRole("tab", { name: /password/i });
  if (await tab.count()) await tab.click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(app|staff)(\/|$|\?)/);
  return page;
}

test.describe.configure({ mode: "serial" });

test("login page offers no sign-up and reveals no clients", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/create account|sign up|register/i)).toHaveCount(0);
  await expect(page.getByText(/ABC Corporation|Sunrise/i)).toHaveCount(0);
  await page.goto("/app/orders");
  await expect(page).toHaveURL(/\/login\?next=/);
});

let orderUrl = "";

test("a buyer reorders an item in under 30 seconds", async ({ browser }, info) => {
  const page = await signIn(browser, "buyer@abccorp-demo.test", info.project);
  const started = Date.now();
  await page.goto("/app/items");
  await page.getByRole("link", { name: /Product Brochure A4 Trifold/ }).first().click();
  await page.getByRole("link", { name: /^Reorder$/ }).first().click();
  await page.getByRole("button", { name: /Yes — print as is/ }).click();
  await page.getByRole("radio", { name: /1,000 pcs/ }).click();
  await page.getByRole("button", { name: /Reorder now — ₱/ }).click();
  await expect(page.getByText(/your order PA-\d{4}-\d{6} is in/i)).toBeVisible();
  const seconds = (Date.now() - started) / 1000;
  test.info().annotations.push({ type: "reorder seconds", description: seconds.toFixed(1) });
  expect(seconds).toBeLessThan(30);
  orderUrl = new URL(page.url()).pathname;            // /app/orders/<id>
  await expect(page.getByText("Confirmed").first()).toBeVisible();
  await page.context().close();
});

test("sales see it right away; production moves it to Delivered with a note", async ({ browser }, info) => {
  test.skip(!orderUrl, "needs the reorder from the previous test");
  const id = orderUrl.split("/").pop()!;
  const sales = await signIn(browser, "sales1@pa-demo.test", info.project);
  await sales.goto("/staff/orders?status=confirmed");
  await expect(sales.locator(`a[href="/staff/orders/${id}"]`)).toBeVisible();
  await sales.context().close();

  const prod = await signIn(browser, "production@pa-demo.test", info.project);
  await prod.goto(`/staff/orders/${id}`);
  await expect(prod.getByText(/Prices and payments are hidden/)).toBeVisible();
  for (const [status, note] of [["Printing", ""], ["Out for Delivery", "Truck left 8:40 AM"], ["Delivered", "Received by reception"]] as const) {
    await prod.getByLabel("New status").selectOption({ label: status });
    if (note) await prod.getByLabel("Note (optional)").fill(note);
    await prod.getByRole("button", { name: `Update to ${status}` }).click();
    await expect(prod.getByText(new RegExp(`Status changed to ${status}`))).toBeVisible();
  }
  await prod.context().close();
});

test("sales record the payment and the order shows Paid", async ({ browser }, info) => {
  test.skip(!orderUrl, "needs the reorder from the previous test");
  const id = orderUrl.split("/").pop()!;
  const sales = await signIn(browser, "sales1@pa-demo.test", info.project);
  await sales.goto(`/staff/orders/${id}`);
  const rec = sales.getByText("Record a payment");
  if (!(await sales.getByLabel("Reference number").isVisible())) await rec.click();
  await sales.getByRole("radio", { name: "Bank transfer" }).click();
  await sales.getByLabel("Reference number").fill(`E2E-${Date.now()}`);
  await sales.getByLabel("Bank").fill("BDO");
  await sales.getByRole("button", { name: "Record payment" }).click();
  await expect(sales.getByText(/The order is now Paid/)).toBeVisible();
  await sales.context().close();
});

test("the client follows it to Delivered and Paid", async ({ browser }, info) => {
  test.skip(!orderUrl, "needs the reorder from the previous test");
  const page = await signIn(browser, "buyer@abccorp-demo.test", info.project);
  await page.goto(orderUrl);
  await expect(page.getByRole("list", { name: "Order progress" }).getByText("Delivered")).toBeVisible();
  await expect(page.getByText("Received by reception")).toBeVisible();
  await expect(page.getByText(/^Paid$/).first()).toBeVisible();
  await page.context().close();
});

test("a viewer can follow orders but can't reorder or see prices", async ({ browser }, info) => {
  test.skip(!orderUrl, "needs the reorder from the previous test");
  const page = await signIn(browser, "marketing@abccorp-demo.test", info.project);
  await page.goto(orderUrl);
  await expect(page.getByRole("list", { name: "Order progress" })).toBeVisible();
  await expect(page.getByText(/₱/)).toHaveCount(0);
  await page.goto("/app/items");
  await expect(page.getByRole("link", { name: /^Reorder$/ })).toHaveCount(0);
  await page.context().close();
});
