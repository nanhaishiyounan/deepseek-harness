import { expect, test as setup } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const authFile = "e2e/.auth/admin.json";

const account = process.env.NOCOBASE_E2E_ACCOUNT ?? "admin@nocobase.com";
const password = process.env.NOCOBASE_E2E_PASSWORD;
if (!password) {
  throw new Error(
    "NOCOBASE_E2E_PASSWORD is not set. Copy .env.e2e.example to .env.e2e and fill it in — " +
      "the sign-in password is deliberately not committed."
  );
}

setup("authenticate through the real sign-in UI", async ({ page }) => {
  await page.goto("/x/crm/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  await page.getByRole("textbox", { name: "Username or email" }).fill(account);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/x\/crm\/dashboard(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const nocobaseKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith("NOCOBASE_"))
  );
  expect(nocobaseKeys).toContain("NOCOBASE_TOKEN");
  console.log(`Confirmed auth storage keys: ${nocobaseKeys.join(", ")}`);

  await mkdir("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: authFile });
});
