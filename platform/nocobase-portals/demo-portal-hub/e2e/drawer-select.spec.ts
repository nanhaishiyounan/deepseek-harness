import { expect, test } from "@playwright/test";

import {
  getPortalStorageKey,
  loadPortalE2EEnvironment,
  requirePortalE2ECredentials,
  resolvePortalTestURL,
  signInPortal,
} from "./support";

const environment = loadPortalE2EEnvironment();

/**
 * Route drawers wrap their overlay in a pointer-events-none container and let
 * the panel opt back in. Popups portal into that container too, so any that
 * forget to opt back in render their options, accept the keyboard, and swallow
 * every click — which is how every select inside a create/edit form in all
 * eight portals became unusable with a mouse without a single test noticing.
 *
 * This asserts the mouse path specifically. A keyboard-driven assertion would
 * have passed throughout the outage.
 */
test("selects inside a drawer commit a value on click", async ({
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
    { name: getPortalStorageKey(environment, "token"), value: session.token },
    { name: getPortalStorageKey(environment, "auth"), value: session.authenticator },
    { name: getPortalStorageKey(environment, "role"), value: session.role },
    { name: getPortalStorageKey(environment, "locale"), value: "en-US" },
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
    await page.goto(resolvePortalTestURL(environment, "/leads/create"));

    const dialog = page.getByRole("dialog").first();
    const combos = dialog.getByRole("combobox");
    await expect(combos.first()).toBeVisible();

    const count = await combos.count();
    expect(count, "the create drawer should expose selects").toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const combo = combos.nth(index);
      const before = (await combo.innerText()).trim();

      await combo.click();
      const options = page.getByRole("option");
      await expect(options.first()).toBeVisible();
      if ((await options.count()) < 2) {
        await page.keyboard.press("Escape");
        continue;
      }

      // A short timeout on purpose: an unclickable option shows up as a hang.
      await options.nth(1).click({ timeout: 5_000 });
      await expect
        .poll(async () => (await combo.innerText()).trim(), {
          message: `select ${index} did not take the clicked option`,
        })
        .not.toBe(before);
    }
  } finally {
    await context.close();
  }
});
