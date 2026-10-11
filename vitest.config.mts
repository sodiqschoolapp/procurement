import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Two projects. `unit` needs nothing running. `db` needs PostgreSQL (docker compose up -d):
// every `*.db.test.ts` file gets its own database from tests/helpers/.
// `npm test` runs both; `npx vitest run --project unit` runs without Docker.
const DATABASE_TESTS = ["src/**/*.db.test.ts", "tests/**/*.db.test.ts"];

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          // A unit test never reaches a database. With no address, the client refuses to load,
          // so a database test that was named `*.test.ts` by mistake fails instead of writing
          // to the developer's own database.
          env: { DATABASE_URL: "" },
          include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
          exclude: ["node_modules/**", "tests/e2e/**", ...DATABASE_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: DATABASE_TESTS,
          exclude: ["node_modules/**", "tests/e2e/**"],
          globalSetup: ["./tests/helpers/db-global-setup.ts"],
          setupFiles: ["./tests/helpers/db-file-setup.ts"],
        },
      },
    ],
  },
});
