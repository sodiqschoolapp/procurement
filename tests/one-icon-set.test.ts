import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// docs/design-system.md, "What we never do" 10: no icons from more than one set; D25: "lucide
// is not installed" (review of 0.10a, correction 7). Linted through ESLint's Node API with the
// project's own config, as tests/no-literal-text.test.ts does.

const eslint = new ESLint();

async function reports(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === "no-restricted-imports")
    .map((message) => message.message);
}

describe("one icon set (design system, What we never do 10; D25)", () => {
  beforeAll(async () => {
    await eslint.calculateConfigForFile("src/components/ui/sample.tsx");
  }, 60_000);

  it("refuses a lucide-react import anywhere in src", async () => {
    const code = 'import { X } from "lucide-react";\nexport const icon = X;\n';
    for (const place of ["src/components/ui/sample.tsx", "src/app/sample/page.tsx"]) {
      expect(await reports(code, place), place).toHaveLength(1);
    }
  });
});
