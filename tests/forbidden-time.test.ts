import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// developer-rules.md rule 10, "Where each rule is enforced": "One clock provider, injected";
// CLAUDE.md rule 10: "time comes from the injected clock, never from new Date()".
// The check is the rule `no-restricted-syntax` of eslint.config.mjs; this test runs it through
// ESLint's own Node API with the project's own config.

const RULE = "no-restricted-syntax";

const eslint = new ESLint();

async function timeReports(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === RULE)
    .map((message) => message.message);
}

const FORBIDDEN_SAMPLES: Record<string, string> = {
  "new Date()": "export const moment = new Date();\n",
  "new Date without parentheses": "export const moment = new Date;\n",
  "Date.now()": "export const moment = Date.now();\n",
  "Date.now as a reference": "export const read = Date.now;\n",
  "Date() as a function": "export const text = Date();\n",
  "Temporal.Now": "declare const Temporal: { Now: object };\nexport const clock = Temporal.Now;\n",
  ".defaultNow()":
    "declare const column: { defaultNow(): unknown };\nexport const created = column.defaultNow();\n",
};

// A server file, a screen and a shared part: a later block that sets the same rule for screens
// (task 0.5) would replace the selectors there, and this list turns red when it does.
const PLACES = ["src/features/sample.ts", "src/app/sample/page.tsx", "src/components/sample.tsx"];

describe("the forbidden-time check (developer-rules.md rule 10)", () => {
  // The first lint loads the whole config and its plugins, which takes seconds on a cold run.
  beforeAll(async () => {
    await eslint.calculateConfigForFile("src/features/sample.ts");
  }, 60_000);

  for (const [name, code] of Object.entries(FORBIDDEN_SAMPLES)) {
    it(`fails on a sample file with ${name}`, async () => {
      for (const place of PLACES) {
        expect(await timeReports(code, place), place).toHaveLength(1);
      }
    });
  }

  it("lets the clock module read the system time", async () => {
    for (const code of Object.values(FORBIDDEN_SAMPLES)) {
      expect(await timeReports(code, "src/server/clock.ts")).toEqual([]);
    }
  });

  it("allows a fixed moment and a duration", async () => {
    const code =
      'export const yearEnd = new Date("2026-12-31T20:30:00Z");\n' +
      "export const copy = new Date(yearEnd.getTime());\n" +
      "export const tick = performance.now();\n";
    expect(await timeReports(code, "src/features/sample.ts")).toEqual([]);
  });

  it("points to the clock in its message", async () => {
    const [message] = await timeReports(FORBIDDEN_SAMPLES["new Date()"] ?? "", PLACES[0] ?? "");
    expect(message).toContain("src/server/clock.ts");
  });

  it("passes on the codebase", { timeout: 60_000 }, async () => {
    const results = await eslint.lintFiles(["."]);
    const found = results.flatMap((result) =>
      result.messages
        .filter((message) => message.ruleId === RULE)
        .map((message) => `${result.filePath}:${message.line} ${message.message}`),
    );
    expect(found).toEqual([]);
  });
});
