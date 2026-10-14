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

// 11-screens-and-ux.md rule 14: "No text is written directly in a screen." A string in one of
// these props is a label a person reads, so it must come from the message files too. An empty
// string is no text: `alt=""` marks a decorative image (rule 13) and passes.
const TEXT_PROPS = "/^(aria-label|title|placeholder|alt|label)$/";
const WRITE_IT_IN_THE_MESSAGES =
  "is text written in a screen. Put it in uz.json, ru.json and en.json and read it with t() (11-screens-and-ux.md rule 14).";

export const LITERAL_TEXT_PROP_SELECTORS = [
  `JSXAttribute[name.name=${TEXT_PROPS}] > Literal[value=/./]`,
  `JSXAttribute[name.name=${TEXT_PROPS}] > JSXExpressionContainer > Literal[value=/./]`,
  `JSXAttribute[name.name=${TEXT_PROPS}] > JSXExpressionContainer > TemplateLiteral`,
].map((selector) => ({ selector, message: `A text prop ${WRITE_IT_IN_THE_MESSAGES}` }));

// developer-rules.md rule 4: every query calls authorize(). A page or a shared part reads data
// through src/features/<area>/queries, never through the database client or the schema itself
// (plan of 0.7, the fence progress 0.2 asked for). Static and dynamic imports are both caught;
// tests/database-import-fence.test.ts lints samples.
const THROUGH_THE_QUERIES =
  "reads the database from a screen. Read through src/features/<area>/queries, which call authorize() (developer-rules.md rule 4).";
// The client, the schema and every other module of src/server/db, and the driver itself.
const DATABASE_MODULE = "/(server.db.|^pg$|^drizzle-orm.node-postgres)/";

export const DATABASE_IMPORT_SELECTORS = [
  {
    selector: `ImportDeclaration[source.value=${DATABASE_MODULE}]`,
    message: `This import ${THROUGH_THE_QUERIES}`,
  },
  {
    selector: `ImportExpression[source.value=${DATABASE_MODULE}]`,
    message: `This import() ${THROUGH_THE_QUERIES}`,
  },
];

// developer-rules.md rule 3, "Enforced by: The server-action wrapper. No action opens its own
// transaction." Screens, routes and the actions and queries of src/features run their writes
// through runAction() of src/server/action.ts (plan of 0.8, decision 11); sign-in keeps its own
// in src/server/auth (decisions 0.6, item 3). tests/own-transaction.test.ts lints samples.
export const OWN_TRANSACTION_SELECTORS = [
  {
    selector: "CallExpression[callee.property.name='transaction']",
    message:
      "opens a transaction of its own. Write through the action wrapper, runAction() of src/server/action.ts (developer-rules.md rule 3).",
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
    // Routes and the actions and queries of an area. The screen blocks below set the rule again
    // for their files and spread these selectors in too.
    files: ["src/app/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...FORBIDDEN_TIME_SELECTORS, ...OWN_TRANSACTION_SELECTORS],
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
          // One icon set only: Material Symbols Rounded through src/components/icon.tsx. A later
          // `shadcn add` writes lucide imports (components.json keeps "iconLibrary": "lucide");
          // they are replaced, never installed (D25; design system "What we never do" 10).
          paths: [
            {
              name: "lucide-react",
              message:
                "lucide is not installed (D25). Draw icons with <Icon> of src/components/icon.tsx.",
            },
          ],
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
    // No literal text in screens (11-screens-and-ux.md rule 14; decisions 0.5 item 9). The
    // block sets `no-restricted-syntax` again, so it spreads the clock selectors back in.
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx", "src/features/**/components/**/*.tsx"],
    ignores: ["**/*.test.tsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        { noStrings: true, ignoreProps: true, allowedStrings: [] },
      ],
      "no-restricted-syntax": [
        "error",
        ...FORBIDDEN_TIME_SELECTORS,
        ...LITERAL_TEXT_PROP_SELECTORS,
        ...DATABASE_IMPORT_SELECTORS,
        ...OWN_TRANSACTION_SELECTORS,
      ],
    },
  },
  {
    // The fence for the .ts files of screens: routes, server actions, helpers. `/health` is the
    // one open route that reads the database itself (0.16).
    files: ["src/app/**/*.ts", "src/components/**/*.ts", "src/features/**/components/**/*.ts"],
    ignores: ["**/*.test.ts", "src/app/health/route.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...FORBIDDEN_TIME_SELECTORS,
        ...DATABASE_IMPORT_SELECTORS,
        ...OWN_TRANSACTION_SELECTORS,
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
