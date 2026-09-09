import { expect, test } from "@playwright/test";

const portal = (path: string) => `/x/crm${path}`;

/** Closing a record drawer resets the list filters, so re-apply before reusing rows. */
const filterConverted = async (page: import("@playwright/test").Page) => {
  await page.getByRole("combobox").filter({ hasText: "All statuses" }).click();
  await page.getByRole("option", { name: "Converted", exact: true }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible();
};

test("converted leads cannot be converted again or assigned Converted manually", async ({
  page,
}) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
      /crm_/.test(request.url())
    ) {
      mutations.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.goto(portal("/leads"));
  await filterConverted(page);

  // A lead that already converted offers no way to convert it a second time.
  await page.getByRole("button", { name: "View lead" }).first().click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByRole("heading", { name: "Lead profile" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Convert", exact: true })).toHaveCount(0);
  await detail.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // `Converted` is readable on the record but must not be assignable by hand.
  await filterConverted(page);
  await page.getByRole("button", { name: "Edit lead" }).first().click();
  const editor = page.getByRole("dialog");
  await expect(editor.getByRole("heading", { name: "Edit lead" })).toBeVisible();
  await editor.getByRole("combobox").filter({ hasText: "Converted" }).click();
  await expect(page.getByRole("option", { name: "Working", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Converted", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();

  expect(mutations).toEqual([]);
});
