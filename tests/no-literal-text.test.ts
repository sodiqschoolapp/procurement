import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// 11-screens-and-ux.md rule 14: "Every label comes from translation files for Uzbek, Russian
// and English. No text is written directly in a screen." The check is `react/jsx-no-literals`
// and the text-prop selectors of eslint.config.mjs (decisions 0.5 item 9), run here through
// ESLint's Node API with the project's own config, as tests/forbidden-time.test.ts does.

const RULES = new Set(["react/jsx-no-literals", "no-restricted-syntax"]);

const eslint = new ESLint();

async function textReports(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId !== null && RULES.has(message.ruleId))
    .map((message) => message.message);
}

const SCREENS = [
  "src/app/sample/page.tsx",
  "src/components/sample.tsx",
  "src/features/catalog/components/sample.tsx",
];

const component = (jsx: string) =>
  `declare const t: (key: string) => string;\nexport function Sample() {\n  return ${jsx};\n}\n`;

const LITERAL_SAMPLES: Record<string, string> = {
  "text between tags": "<p>Saqlash</p>",
  "a string child": '<p>{"Save"}</p>',
  "a placeholder": '<input placeholder="Search" />',
  "a placeholder in braces": '<input placeholder={"Search"} />',
  "a title as a template": "<input title={`Search`} />",
  "an aria-label": '<button aria-label="Close" />',
  "an alt text": '<img alt="Logo" src="/brand/sodiq-mark.svg" />',
};

describe("no text written in a screen (11-screens-and-ux.md rule 14)", () => {
  // The first lint loads the whole config and its plugins, which takes seconds on a cold run.
  beforeAll(async () => {
    await eslint.calculateConfigForFile("src/app/sample/page.tsx");
  }, 60_000);

  for (const [name, jsx] of Object.entries(LITERAL_SAMPLES)) {
    it(`fails on ${name}`, async () => {
      for (const place of SCREENS) {
        expect(await textReports(component(jsx), place), place).toHaveLength(1);
      }
    });
  }

  it("passes a text read with t(), class names and other props", async () => {
    const jsx =
      '<main className="p-6" id="start">\n' +
      '    <h1>{t("start.title")}</h1>{" "}\n' +
      '    <input type="text" placeholder={t("start.notice")} />\n' +
      "  </main>";
    for (const place of SCREENS) {
      expect(await textReports(component(jsx), place), place).toEqual([]);
    }
  });

  it('lets alt="" mark a decorative image (11-screens-and-ux.md rule 13)', async () => {
    const jsx = '<img alt="" src="/brand/sodiq-mark.svg" />';
    for (const place of SCREENS) {
      expect(await textReports(component(jsx), place), place).toEqual([]);
    }
  });

  it("does not check a server file", async () => {
    const code = 'export const label = "Saqlash";\n';
    expect(await textReports(code, "src/server/sample.ts")).toEqual([]);
  });

  it("keeps the clock check on in screens (developer-rules.md rule 10)", async () => {
    const code = "export const moment = new Date();\n";
    expect(await textReports(code, "src/app/sample/page.tsx")).toHaveLength(1);
  });
});
