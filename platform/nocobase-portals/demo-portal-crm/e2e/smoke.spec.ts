import { expect, test } from "@playwright/test";
import { expectHealthyPage, expectRowsOrEmpty, watchPageErrors } from "./support/page";

const routes = [
  ["/dashboard", "Dashboard", false],
  ["/leads", "Leads", true],
  ["/pipeline", "Pipeline", false],
  ["/quotes", "Quotes", true],
  ["/customers", "Customers", true],
  ["/contacts", "Contacts", true],
  ["/products", "Products", true],
  ["/activities", "Activities", true],
  ["/follow-ups", "Follow-ups", true],
  ["/targets", "Sales targets", true],
  ["/reports", "Reports", false],
] as const;

for (const [path, heading, tabular] of routes) {
  test(`${heading} page renders without runtime errors`, async ({ page }) => {
    if (path === "/contacts") {
      test.fail(true, "The declared /contacts route renders the product 404 page in the published portal.");
      await page.goto(`/x/crm${path}`);
      await expect(page.getByRole("heading", { name: "Page not found." })).toBeVisible();
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible({ timeout: 1_000 });
      return;
    }
    const errors = watchPageErrors(page);
    await expectHealthyPage(page, path, heading, errors);
    if (tabular) {
      expect(await expectRowsOrEmpty(page), `${heading} seed rows`).toBeGreaterThan(0);
      await expect(page.getByText(/No data to display|No records/i)).toHaveCount(0);
    } else if (heading === "Pipeline") {
      await expect(page.locator("main").getByText(/Inquiry|Qualified|Proposal|Negotiation/i).first()).toBeVisible();
    } else {
      await expect(page.locator("main").last()).not.toBeEmpty();
    }
  });
}
