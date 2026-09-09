import { expect, type Page, type TestInfo } from "@playwright/test";

const IGNORED_CONSOLE_ERRORS = [
  /favicon\.ico/i,
  // Base UI advises that a Button rendering an <a> is not a native <button>.
  // The shared resource buttons and sidebar deliberately render links, and the
  // suggested `nativeButton={false}` is worse than the warning: it stamps
  // role="button" onto the anchor, so navigation announces as a button and
  // every getByRole("link") in this suite stops matching.
  // Verified dev-only — the deployed production build logs none of these.
  /Base UI: A component that acts as a button expected a native <button>/i,
];

export function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!IGNORED_CONSOLE_ERRORS.some((pattern) => pattern.test(text))) errors.push(text);
  });
  page.on("pageerror", (error) => errors.push(`Uncaught: ${error.message}`));
  return errors;
}

export async function expectHealthyPage(
  page: Page,
  path: string,
  heading: string,
  errors: string[],
) {
  await page.goto(`/x/crm${path}`);
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  await expect(page.locator("[data-slot='skeleton']")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText(/Something went wrong|Application error|Error boundary/i)).toHaveCount(0);
  expect(errors, `console/page errors on ${path}`).toEqual([]);
}

export async function expectRowsOrEmpty(page: Page) {
  const rows = page.locator('table tbody tr:not([aria-hidden="true"])');
  const empty = page.getByText(/No data to display|No records|No .* found|Nothing .* yet/i).first();
  await expect(rows.first().or(empty)).toBeVisible();
  return rows.count();
}

export async function expectMetricNonZero(page: Page, label: string) {
  const labelNode = page.getByText(label, { exact: true }).first();
  await expect(labelNode).toBeVisible();
  const container = labelNode.locator("xpath=ancestor::*[@data-slot='card'][1]");
  await expect(container).not.toContainText(/NaN/i);
  await expect
    .poll(async () => {
      const text = (await container.innerText()).replace(label, "").trim();
      return Math.max(
        0,
        ...(text.match(/\d[\d,.]*/g) ?? []).map((value) =>
          Number(value.replace(/,/g, ""))
        )
      );
    }, { message: `${label} should render a non-zero value` })
    .toBeGreaterThan(0);
}

export async function expectChartRendered(page: Page, title: string) {
  const card = page
    .getByText(title, { exact: true })
    .first()
    .locator("xpath=ancestor::*[@data-slot='card'][1]");
  await expect(card).toBeVisible();
  await expect(card.locator("svg").first()).toBeVisible();
  expect(await card.locator("svg path, svg rect, svg circle, canvas").count()).toBeGreaterThan(0);
}

export async function attachDiagnostics(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

export async function clearCrmLocalState(page: Page) {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("crm.views.") || key.startsWith("crm.columns.")) {
        localStorage.removeItem(key);
      }
    }
  });
}
