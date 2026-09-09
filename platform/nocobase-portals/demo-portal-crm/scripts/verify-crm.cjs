const { chromium } = require("playwright");

const base = "http://127.0.0.1:14308/x/crm/";
const output = "/tmp/claude-1000/-home-albert-prj-vscodes-agent-kb/fa9a4b6c-d0eb-4f57-bdfb-a8f8b72e4be7/scratchpad/enhance/crm-out/screenshots";
const routes = [
  ["dashboard", "dashboard"],
  ["leads", "leads"],
  ["lead-detail", "leads/show/378690591391744"],
  ["quotes", "quotes"],
  ["quote-detail", "quotes/show/378691012919296"],
  ["products", "products"],
  ["targets", "targets"],
  ["reports", "reports"],
  ["customer-360", "customers/show/378464132530176"],
];

let browser;

(async () => {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const responseErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ url: page.url(), text: message.text() });
  });
  page.on("pageerror", (error) => pageErrors.push({ url: page.url(), text: error.message }));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/api/")) {
      responseErrors.push({ url: response.url(), status: response.status() });
    }
  });

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  if (await page.locator("#basic-account").isVisible().catch(() => false)) {
    await page.locator("#basic-account").fill("admin@nocobase.com");
    await page.locator("#basic-password").fill("admin123");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => url.href.includes("/x/crm/") && !url.pathname.includes("/login"), { timeout: 30000 });
    await page.waitForLoadState("networkidle");
  }
  if (page.url().includes("/login")) throw new Error("Authentication did not complete");
  consoleErrors.length = 0;
  pageErrors.length = 0;
  responseErrors.length = 0;

  for (const [locale, prefix] of [["en-US", "en"], ["zh-CN", "zh"]]) {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate((language) => {
      // Keep the conventional i18next key requested by the acceptance
      // contract and the Portal SDK session key used by this runtime.
      localStorage.setItem("i18nextLng", language);
      localStorage.setItem("NOCOBASE_LOCALE", language);
    }, locale);
    await page.reload({ waitUntil: "networkidle" });
    for (const [name, route] of routes) {
      await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
      if (page.url().includes("/login")) throw new Error(`Session lost before route: ${locale} ${route}`);
      await page.waitForTimeout(route === "dashboard" || route === "reports" || route === "targets" ? 1500 : 700);
      await page.screenshot({ path: `${output}/${prefix}-${name}.png`, fullPage: true });
      const bodyText = (await page.locator("body").innerText()).trim();
      if (!bodyText || bodyText.includes("Page not found")) throw new Error(`Route did not render: ${locale} ${route}`);
    }
  }

  const result = { consoleErrors, pageErrors, responseErrors };
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (consoleErrors.length || pageErrors.length || responseErrors.length) process.exitCode = 1;
})().catch(async (error) => {
  console.error(error);
  if (browser) await browser.close();
  process.exitCode = 1;
});
