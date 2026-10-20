import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { defineConfig } from "@playwright/test";

import { serverUrl, speedDatabaseUrl } from "./tests/speed/database";
import { E2E_BUCKET, testStorageEnv } from "./tests/helpers/local-storage";

// The speed run of build plan 9.2 (plan of 9.2, What will exist 3): `npm run speed`. Not in CI
// (decided item 7). A production build (`next build`, then `next start`) against the filled
// database procurement_speed on this machine, one worker so nothing competes, the scheduler off so
// no job runs during a timing (review of the plan, correction 2). The fill runs first, through
// Vitest, which runs the TypeScript fill (correction 4).
const PORT = 3200;
const baseURL = `http://localhost:${PORT}`;

if (!process.env.SPEED_SKIP_FILL) {
  execFileSync("npx", ["vitest", "run", "-c", "vitest.speed.config.mts"], { stdio: "inherit" });
}

export default defineConfig({
  testDir: "./tests/speed",
  testMatch: "pages.spec.ts",
  // Its own output folder: Playwright empties it at the start, and test-results/speed-*.json
  // (the refresh time, the timings) lie beside it.
  outputDir: "test-results/speed",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 1_800_000,
  use: { baseURL, browserName: "chromium", viewport: { width: 1440, height: 900 } },
  webServer: {
    command: `npx next build && npx next start --hostname 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    env: {
      DATABASE_URL: speedDatabaseUrl(serverUrl()),
      SCHEDULER: "off",
      // `next start` refuses sign-in without a secret. A throwaway one for this local run on
      // invented data, made here and never written or printed; the local .env's wins if set.
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || randomBytes(32).toString("hex"),
      ...testStorageEnv(E2E_BUCKET),
    },
    reuseExistingServer: false,
    timeout: 900_000,
  },
});
