import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("dashboard remains usable without horizontal page overflow on mobile", async ({ page }) => {
  await page.goto("/x/crm/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
  await expect(page.getByRole("link", { name: "Leads", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Leads", exact: true }).click();
  await expect(page).toHaveURL(/\/x\/crm\/leads$/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible();
});
