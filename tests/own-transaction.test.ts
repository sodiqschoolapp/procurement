import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// developer-rules.md rule 3, "Where each rule is enforced": "The server-action wrapper. No action
// opens its own transaction." The check is `no-restricted-syntax` of eslint.config.mjs (plan of
// 0.8, decision 11), run here through ESLint's own Node API with the project's config. Flat
// config replaces the rule's options per block, so every place is also checked for the clock
// rule, which a block that forgot to spread it would lose.

const eslint = new ESLint();

async function reports(code: string, filePath: string, phrase: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .filter((message) => message.message.includes(phrase))
    .map((message) => message.message);
}

const TRANSACTION =
  "declare const db: { transaction(run: () => Promise<void>): Promise<void> };\n" +
  "export const save = () => db.transaction(async () => undefined);\n";
const CLOCK = "export const moment = new Date();\n";

const FENCED = [
  "src/features/orders/actions/sample.ts",
  "src/features/orders/queries/sample.ts",
  "src/features/orders/components/sample.ts",
  "src/features/orders/components/sample.tsx",
  "src/app/sample/actions.ts",
  "src/app/sample/route.ts",
  "src/app/sample/page.tsx",
  "src/app/health/route.ts",
  "src/components/sample.ts",
  "src/components/sample.tsx",
];

describe("no action opens its own transaction (developer-rules.md rule 3)", () => {
  beforeAll(async () => {
    await eslint.calculateConfigForFile("src/features/orders/actions/sample.ts");
  }, 60_000);

  it("refuses .transaction( in screens, routes and the actions and queries of an area", async () => {
    for (const place of FENCED) {
      expect(await reports(TRANSACTION, place, "opens a transaction"), place).toHaveLength(1);
    }
  });

  it("keeps the clock rule in every one of those places", async () => {
    for (const place of FENCED) {
      expect(await reports(CLOCK, place, "reads the system time"), place).toHaveLength(1);
    }
  });

  it("lets the wrapper, sign-in and tests open one", async () => {
    for (const place of [
      "src/server/action.ts",
      "src/server/auth/sign-in.ts",
      "src/features/orders/actions/sample.test.ts",
    ]) {
      expect(await reports(TRANSACTION, place, "opens a transaction"), place).toEqual([]);
    }
  });
});
