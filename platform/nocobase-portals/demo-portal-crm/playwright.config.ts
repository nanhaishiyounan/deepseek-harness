import { devices, defineConfig } from "@playwright/test";
import { loadEnv } from "vite";

import { loadPortalE2EEnvironment } from "./e2e/support/environment";

const fileEnvironment = loadEnv("e2e", process.cwd(), "");
Object.entries(fileEnvironment).forEach(([key, value]) => {
  if (process.env[key] === undefined) process.env[key] = value;
});

const environment = loadPortalE2EEnvironment();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : "list",
  outputDir: "./test-results",
  use: {
    baseURL: environment.baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${environment.port} --strictPort --mode e2e`,
    url: environment.baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NOCOBASE_API_URL: environment.apiURL,
      NOCOBASE_PORTAL_BASE: environment.portalBase,
    },
  },
  projects: [
    // auth.setup.ts signs in through the real UI and saves the session. It is
    // matched by name here because `testMatch` above only picks up *.spec.ts —
    // without this project nothing ever writes the storage state and every
    // spec lands on the sign-in page.
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
    },
  ],
});
