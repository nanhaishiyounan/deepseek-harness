import { expect, test } from "@playwright/test";

import {
  getPortalStorageKey,
  loadPortalE2EEnvironment,
  requirePortalE2ECredentials,
  resolvePortalTestURL,
  signInPortal,
} from "./support";

const environment = loadPortalE2EEnvironment();

test("keeps converted leads read-only in the manual status workflow", async ({
  browser,
  request,
}) => {
  test.skip(
    environment.storageType !== "localStorage",
    "Playwright storageState cannot restore a sessionStorage-backed Portal session."
  );

  const credentials = requirePortalE2ECredentials(environment);
  const session = await signInPortal(request, environment, credentials);
  const storageValues = [
    {
      name: getPortalStorageKey(environment, "token"),
      value: session.token,
    },
    {
      name: getPortalStorageKey(environment, "auth"),
      value: session.authenticator,
    },
    {
      name: getPortalStorageKey(environment, "role"),
      value: session.role,
    },
    {
      name: getPortalStorageKey(environment, "locale"),
      value: "en-US",
    },
  ].filter(
    (entry): entry is { name: string; value: string } =>
      typeof entry.value === "string" && entry.value.length > 0
  );

  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(environment.baseURL).origin,
          localStorage: storageValues,
        },
      ],
    },
  });

  try {
    const page = await context.newPage();
    await page.goto(resolvePortalTestURL(environment, "/leads"));

    await page
      .getByRole("button", { name: "Converted", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/[?&]view=converted(?:&|$)/);

    const rows = page.locator("tbody tr");
    await expect(rows.first()).toContainText("Converted");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
    for (let index = 0; index < rowCount; index += 1) {
      await expect(rows.nth(index)).toContainText("Converted");
    }

    const firstConvertedRow = rows.first();
    await expect(
      firstConvertedRow.getByRole("button", { name: "Convert", exact: true })
    ).toBeDisabled();

    await firstConvertedRow.locator("td").nth(2).getByRole("button").click();
    await expect(page).toHaveURL(/\/leads\/show\/[^/?]+\/?$/);
    const leadId = new URL(page.url()).pathname.match(
      /\/leads\/show\/([^/]+)\/?$/
    )?.[1];
    if (!leadId) throw new Error("Unable to resolve the converted lead id.");

    await page.goto(
      resolvePortalTestURL(environment, `/leads/edit/${leadId}`)
    );
    await expect(page.getByText("Edit lead", { exact: true })).toBeVisible();

    await page.getByLabel("Status", { exact: true }).click();
    await expect(
      page.getByRole("option", { name: "New", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Converted", exact: true })
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
