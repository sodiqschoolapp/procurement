import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const USE_THE_CLOCK =
  "reads the system time. Use now() of src/server/clock.ts (CLAUDE.md rule 10).";

// developer-rules.md rule 10: time comes from the one injected clock, src/server/clock.ts.
// Flat config replaces, not merges, the options of `no-restricted-syntax`: every later block
// that sets that rule must spread these selectors in, or the check is lost for its files
// (tests/forbidden-time.test.ts lints samples under src/app and src/components to catch it).
export const FORBIDDEN_TIME_SELECTORS = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: `new Date() ${USE_THE_CLOCK} A fixed moment, new Date("2026-12-31T20:30:00Z"), is allowed.`,
  },
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message: `Date.now ${USE_THE_CLOCK}`,
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message: `Date() ${USE_THE_CLOCK}`,
  },
  {
    selector: "MemberExpression[object.name='Temporal'][property.name='Now']",
    message: `Temporal.Now ${USE_THE_CLOCK}`,
  },
  {
    selector: "CallExpression[callee.property.name='defaultNow']",
    message: `.defaultNow() reads the database's time. Pass the value from now() of src/server/clock.ts (docs/decisions.md, 0.2 item 3).`,
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      "no-restricted-syntax": ["error", ...FORBIDDEN_TIME_SELECTORS],
    },
  },
  {
    // Only tests may fix or ask about the test clock: app code that imported the setter could
    // move business dates on any server whose NODE_ENV is not "production" (permission review of 0.4).
    files: ["src/**"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/clock", "**/server/clock", "./clock"],
              importNames: ["setTestClock", "isTestClockSet"],
              message:
                "The test clock is for tests only (tests/helpers/clock.ts). App code reads now().",
            },
          ],
        },
      ],
    },
  },
  {
    // The one clock: the only file that may read the system time.
    files: ["src/server/clock.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "dist/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
