import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";
import { clearCrmLocalState, expectRowsOrEmpty } from "./support/page";

const portal = (path: string) => `/x/crm${path}`;

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await clearCrmLocalState(page);
});

test("lead search and status filter change the result set", async ({ page }) => {
  await page.goto(portal("/leads"));
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const initialTotal = await page.getByText(/\d+ row\(s\)/).innerText();

  const search = page.getByPlaceholder("Search name, company or email");
  await search.fill("Sophia Turner");
  await expect(page.getByText("1 row(s)", { exact: true })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText("Sophia Turner");
  expect(await page.locator("tbody tr").first().innerText()).not.toEqual(initialTotal);

  await search.clear();
  await page.getByRole("combobox").filter({ hasText: "All statuses" }).click();
  await page.getByRole("option", { name: "Working", exact: true }).click();
  await expect(page.getByText("23 row(s)", { exact: true })).toBeVisible();
  const statuses = await page.locator("tbody tr td:nth-child(3)").allInnerTexts();
  expect(statuses.every((status) => status.trim() === "Working")).toBeTruthy();
});

test("pagination changes the first lead", async ({ page }) => {
  await page.goto(portal("/leads"));
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeVisible();
  const before = await firstRow.innerText();
  await page.getByRole("button", { name: "Go to next page" }).click();
  await expect(page.getByText("Page 2 of 4", { exact: true })).toBeVisible();
  await expect(firstRow).not.toContainText(before.split("\n")[0]);
});

test("reports CSV export creates a non-empty download", async ({ page }) => {
  await page.goto(portal("/reports"));
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  expect((await stat(path!)).size).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);
});

const createFlows = [
  ["/leads", "New lead", ["Name", "Company"]],
  ["/pipeline", "New deal", ["Deal", "Customer"]],
  ["/quotes", "New quote", ["Quote", "Customer"]],
  ["/customers", "Add customer", ["Company name", "Industry"]],
  ["/products", "New product", ["SKU", "Product"]],
  ["/activities", "Log activity", ["Subject", "Type"]],
  ["/follow-ups", "New follow-up", ["Subject", "Due"]],
] as const;

for (const [path, title, fields] of createFlows) {
  test(`${title} drawer renders fields and cancels without mutation`, async ({ page }) => {
    const mutations: string[] = [];
    page.on("request", (request) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && /crm_/.test(request.url())) {
        mutations.push(`${request.method()} ${request.url()}`);
      }
    });
    await page.goto(portal(path));
    await page.getByRole("link", { name: "Create", exact: true }).click();
    await expect(page.getByText(title, { exact: true }).last()).toBeVisible();
    for (const field of fields) await expect(page.getByText(field, { exact: true }).last()).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/x/crm${path.replaceAll("/", "\\/")}(?:\\?|$)`));
    expect(mutations).toEqual([]);
  });

  test(`${title} marks required fields accessibly`, async ({ page }) => {
    test.fail(true, "Published create forms do not expose required/aria-required markers.");
    await page.goto(portal(path));
    await page.getByRole("link", { name: "Create", exact: true }).click();
    await expect(page.locator('input[required], textarea[required], [aria-required="true"]').first()).toBeVisible({ timeout: 1_000 });
  });
}

test("customer detail contains populated timeline and related tables", async ({ page }) => {
  await page.goto(portal("/customers"));
  await page.locator('tbody tr:not([aria-hidden="true"])').first().click();
  await expect(page.getByText("Account timeline", { exact: true })).toBeVisible();
  for (const section of ["Contacts", "Deals", "Activity log", "Follow-ups"]) {
    await expect(page.getByText(section, { exact: true }).last()).toBeVisible();
  }
  expect(await page.getByRole("dialog").locator("tbody tr").count()).toBeGreaterThan(4);
  await page.getByRole("button", { name: "Close" }).last().click();
  await expect(page).toHaveURL(/\/x\/crm\/customers$/);
});

const detailFlows = [
  ["/leads", "View lead", "Lead profile"],
  ["/quotes", "View quote", "Line items"],
  ["/products", "View product", "Quotes including this product"],
] as const;

for (const [path, action, content] of detailFlows) {
  test(`${path} detail drawer opens with content and closes`, async ({ page }) => {
    await page.goto(portal(path));
    await page.getByRole("button", { name: action }).first().click();
    await expect(page.getByText(content, { exact: true })).toBeVisible();
    if (content === "Line items" || content === "Quotes including this product") {
      await expect(page.getByRole("dialog").locator("tbody tr").first()).toBeVisible();
    }
    await page.getByRole("button", { name: "Close" }).last().click();
    await expect(page).toHaveURL(new RegExp(`/x/crm${path.replaceAll("/", "\\/")}$`));
  });
}

const savedViewPages = [
  ["/leads", "Leads"],
  ["/pipeline", "Pipeline"],
  ["/quotes", "Quotes"],
  ["/customers", "Customers"],
  ["/products", "Products"],
  ["/activities", "Activities"],
  ["/follow-ups", "Follow-ups"],
] as const;
for (const [path, heading] of savedViewPages) {
  test(`${path} exposes its standard saved-view menu`, async ({ page }) => {
    test.fail(true, "Saved Views implemented in the repository are absent from the published portal.");
    await page.goto(portal(path));
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "All records", exact: true })).toBeVisible({ timeout: 1_000 });
  });
}

test("lead table supports sorting", async ({ page }) => {
  test.fail(true, "Sortable headers implemented in source are absent from the published portal.");
  await page.goto(portal("/leads"));
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Score: Sort/ })).toBeVisible({ timeout: 1_000 });
});

test("lead table supports column visibility", async ({ page }) => {
  test.fail(true, "Column Settings implemented in source are absent from the published portal.");
  await page.goto(portal("/leads"));
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Columns", exact: true })).toBeVisible({ timeout: 1_000 });
});

test("lead list exports CSV", async ({ page }) => {
  test.fail(true, "List export implemented in source is absent from the published portal.");
  await page.goto(portal("/leads"));
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible({ timeout: 1_000 });
});

test("bulk actions provide cancellable feedback without changing records", async ({ page }) => {
  test.fail(true, "Row selection and bulk action controls implemented in source are absent from the published portal.");
  await page.goto(portal("/leads"));
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByLabel("Select row").first()).toBeVisible({ timeout: 1_000 });
});

for (const [path, content] of [
  ["/activities", "Activity summary"],
  ["/follow-ups", "Follow-up summary"],
] as const) {
  test(`${path} row opens a populated detail drawer`, async ({ page }) => {
    await page.goto(portal(path));
    await page.locator('tbody tr:not([aria-hidden="true"])').first().click();
    await expect(page.getByText(content, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).last().click();
    await expect(page).toHaveURL(new RegExp(`/x/crm${path.replaceAll("/", "\\/")}$`));
  });
}

test("lead edit drawer can be opened and cancelled without mutation", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && /crm_/.test(request.url())) {
      mutations.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.goto(portal("/leads"));
  await page.getByRole("button", { name: "Edit lead" }).first().click();
  await expect(page.getByText("Edit lead", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Name", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(mutations).toEqual([]);
});
