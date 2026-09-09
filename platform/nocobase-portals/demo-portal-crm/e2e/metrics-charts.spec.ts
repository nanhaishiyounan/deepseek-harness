import { expect, test } from "@playwright/test";
import { expectChartRendered, expectMetricNonZero } from "./support/page";

const portal = (path: string) => `/x/crm${path}`;

const metricPages: Record<string, string[]> = {
  "/dashboard": ["Open pipeline", "Weighted forecast", "Expected to close (30 days)", "Won this month", "Untouched 30+ days"],
  "/leads": ["Total leads", "Qualified pipeline", "Average score", "Conversion rate"],
  "/quotes": ["Quote value", "Accepted value", "Open quotes", "Expiring soon"],
  "/products": ["Price book SKUs", "Active products", "Average list price"],
  "/targets": ["Team quota", "Won revenue", "Team attainment", "Pace to date"],
  "/reports": ["Total pipeline", "Won revenue", "Weighted forecast"],
};

for (const [path, labels] of Object.entries(metricPages)) {
  for (const label of labels) {
    test(`${path} KPI ${label} is populated and non-zero`, async ({ page }) => {
      await page.goto(portal(path));
      await expectMetricNonZero(page, label);
    });
  }
}

for (const [path, label] of [
  ["/pipeline", "Open pipeline"],
  ["/customers", "Accounts in view"],
  ["/activities", "In view"],
  ["/follow-ups", "In view"],
] as const) {
  test(`${path} KPI strip is present`, async ({ page }) => {
    await page.goto(portal(path));
    const heading = path === "/pipeline" ? "Pipeline" : path === "/customers" ? "Customers" : path === "/activities" ? "Activities" : "Follow-ups";
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    if (path === "/pipeline") {
      await expect(page.getByText("Inquiry", { exact: true }).last()).toBeVisible();
    } else {
      await expect(page.locator("tbody tr").first()).toBeVisible();
    }
    await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 1_000 });
  });
}

const charts: Record<string, string[]> = {
  "/dashboard": ["Pipeline by stage", "Win / loss analysis", "Monthly won revenue", "Activity volume"],
  "/targets": ["Quota versus actual"],
  "/reports": ["Pipeline by owner and stage", "Monthly won revenue"],
};

for (const [path, titles] of Object.entries(charts)) {
  test(`${path} charts render SVG plot elements`, async ({ page }) => {
    await page.goto(portal(path));
    for (const title of titles) await expectChartRendered(page, title);
  });
}
