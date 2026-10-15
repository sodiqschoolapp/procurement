import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// CLAUDE.md, Repository layout: "src/domain/ pure business rules and the state machine; no
// imports from outside this folder" (.claude/rules/domain.md; docs/progress.md 2.1, "For 2.2").
// The check is `no-restricted-imports` of eslint.config.mjs; this test runs it through ESLint's
// own Node API with the project's own config.

const RULE = "no-restricted-imports";

const eslint = new ESLint();

async function importReports(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === RULE)
    .map((message) => message.message);
}

const sample = (source: string) => `import { x } from "${source}";\nexport const y = x;\n`;

describe("the domain import fence (CLAUDE.md, Repository layout)", () => {
  beforeAll(async () => {
    await eslint.calculateConfigForFile("src/domain/sample.ts");
  }, 60_000);

  it.each([
    "../server/clock",
    "./../server/clock",
    "../../tests/helpers/clock",
    "..",
    "@/server/db/client",
    "@/i18n/format",
  ])("refuses %s in src/domain/", async (source) => {
    const reports = await importReports(sample(source), "src/domain/sample.ts");
    expect(reports.join("\n")).toContain("leaves src/domain/");
  });

  it.each(["./money", "./payment-types", "decimal.js"])(
    "lets %s through in src/domain/",
    async (source) => {
      expect(await importReports(sample(source), "src/domain/sample.ts")).toEqual([]);
    },
  );

  it("lets a domain test read the helpers under tests/", async () => {
    const code = sample("../../tests/permission-matrix-expected");
    expect(await importReports(code, "src/domain/sample.test.ts")).toEqual([]);
  });

  it("keeps the limits of all app code in src/domain/ (lucide, the test clock)", async () => {
    expect(await importReports(sample("lucide-react"), "src/domain/sample.ts")).toHaveLength(1);
    const clock = 'import { setTestClock } from "./clock";\nexport const y = setTestClock;\n';
    expect(await importReports(clock, "src/domain/sample.ts")).toHaveLength(1);
  });

  it("leaves code outside src/domain/ free to import across folders", async () => {
    expect(await importReports(sample("@/domain/money"), "src/features/sample.ts")).toEqual([]);
  });
});
