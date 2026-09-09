const { chromium } = require("playwright");

const base = "http://127.0.0.1:14308/x/crm/";

let browser;

async function signIn(page) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  if (await page.locator("#basic-account").isVisible().catch(() => false)) {
    await page.locator("#basic-account").fill("admin@nocobase.com");
    await page.locator("#basic-password").fill("admin123");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });
  }
  await page.evaluate(() => {
    localStorage.setItem("i18nextLng", "en-US");
    localStorage.setItem("NOCOBASE_LOCALE", "en-US");
  });
  await page.reload({ waitUntil: "networkidle" });
}

(async () => {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  const pageErrors = [];
  const responseErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/api/")) {
      responseErrors.push({ url: response.url(), status: response.status() });
    }
  });

  await signIn(page);
  consoleErrors.length = 0;
  pageErrors.length = 0;
  responseErrors.length = 0;

  const workflow = { leadConversion: "already-converted", quoteRoundTrip: "pending" };

  await page.goto(`${base}leads/show/378690591391744`, { waitUntil: "networkidle" });
  const leadScoreCard = page.locator("div.bg-gradient-to-br:visible").first();
  if (!(await leadScoreCard.getByText("Converted", { exact: true }).isVisible().catch(() => false))) {
    await page.locator('button:has-text("Convert"):visible:not([disabled])').last().click();
    await page.getByRole("alertdialog").locator('button:has-text("Convert"):not([disabled])').last().click();
    await leadScoreCard.getByText("Converted", { exact: true }).waitFor({ timeout: 20000 });
    workflow.leadConversion = "converted-customer-and-deal";
  } else {
    await leadScoreCard.getByText("Converted", { exact: true }).waitFor({ timeout: 10000 });
  }

  await page.goto(`${base}quotes/show/378691012919296`, { waitUntil: "networkidle" });
  const originalCount = await page.getByText("Remove line item", { exact: true }).count();
  const totalValue = page.locator("div.bg-gradient-to-br:visible").first().locator("p").nth(1);
  const originalTotal = await totalValue.innerText();

  await page.getByText("Select from price book", { exact: true }).last().click();
  await page.getByText(/Aero Task Chair/).last().click();
  const numericInputs = page.locator('input[type="number"]:visible');
  await numericInputs.nth(0).fill("2");
  await page.locator('button:has-text("Add item"):visible:not([disabled])').last().click();
  await page.waitForTimeout(1800);
  const addedTotal = await totalValue.innerText();
  if (addedTotal === originalTotal) throw new Error("Quote total did not change after adding a priced line item");

  await page.getByText("Remove line item", { exact: true }).last().locator("xpath=..").click();
  await page.waitForTimeout(1800);
  const finalCount = await page.getByText("Remove line item", { exact: true }).count();
  const finalTotal = await totalValue.innerText();
  if (finalCount !== originalCount || finalTotal !== originalTotal) {
    throw new Error(`Quote round trip did not restore state: ${originalCount}/${originalTotal} -> ${finalCount}/${finalTotal}`);
  }
  workflow.quoteRoundTrip = `add-recalculate-remove-restored (${originalTotal} -> ${addedTotal} -> ${finalTotal})`;

  const result = { workflow, consoleErrors, pageErrors, responseErrors };
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (consoleErrors.length || pageErrors.length || responseErrors.length) process.exitCode = 1;
})().catch(async (error) => {
  console.error(error);
  if (browser) await browser.close();
  process.exitCode = 1;
});
