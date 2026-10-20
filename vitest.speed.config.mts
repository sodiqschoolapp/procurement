import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The speed database of build plan 9.2: created, migrated and filled by tests/speed/prepare.speed.ts
// (plan of 9.2, What will exist 1 and 2). Not part of `npm test`: `npm run speed:fill` runs it, and
// playwright.speed.config.ts runs it before the measurement. TypeScript runs here, never through
// node or tsx (decisions 0.2; review of the plan of 9.2, correction 4).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/speed/prepare.speed.ts"],
    testTimeout: 1_800_000,
    hookTimeout: 120_000,
  },
});
