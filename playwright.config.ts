import { defineConfig } from "@playwright/test";

import { e2eDatabaseUrl, serverDatabaseUrl } from "./tests/e2e/global-setup";
import { E2E_BUCKET, testStorageEnv } from "./tests/helpers/local-storage";

// The browser tests run the app on its own port against their own database, procurement_e2e
// (plan of 0.10b, decision 14), so a dev server on the dev database is never reused by mistake.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // The e2e database and its invented people (tasks 0.6 and 0.10b).
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    browserName: "chromium",
    trace: "on-first-retry",
  },
  // The two widths every screen is checked at (01-summary.md, Quality bar).
  projects: [
    { name: "phone-375", use: { viewport: { width: 375, height: 812 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next dev --hostname 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    // The storage of docker-compose.yml in the e2e bucket (plan of 0.12, review correction 1).
    env: { DATABASE_URL: e2eDatabaseUrl(serverDatabaseUrl()), ...testStorageEnv(E2E_BUCKET) },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
