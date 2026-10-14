import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// developer-rules.md rule 4 ("Every server action and query calls the same authorize()
// function"): a screen never reads the database itself (plan of 0.7, the fence asked for by
// progress 0.2). The check is `no-restricted-syntax` of eslint.config.mjs, run here through
// ESLint's own Node API with the project's config.

const eslint = new ESLint();

async function fenceReports(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .filter((message) => message.message.includes("reads the database from a screen"))
    .map((message) => message.message);
}

const SAMPLES: Record<string, string> = {
  "a static import of the client":
    'import { db } from "@/server/db/client";\nexport const a = db;\n',
  "a static import of the schema":
    'import { users } from "@/server/db/schema";\nexport const a = users;\n',
  "a schema file": 'import { users } from "@/server/db/schema/users";\nexport const a = users;\n',
  "a relative import": 'import { db } from "../../server/db/client";\nexport const a = db;\n',
  "an import()": 'export const load = () => import("@/server/db/client");\n',
};

const SCREENS = [
  "src/app/sample/page.tsx",
  "src/app/sample/route.ts",
  "src/app/sample/actions.ts",
  "src/components/sample.tsx",
  "src/components/sample.ts",
  "src/features/requests/components/sample.tsx",
];

describe("the database-import fence (developer-rules.md rule 4)", () => {
  beforeAll(async () => {
    await eslint.calculateConfigForFile("src/app/sample/page.tsx");
  }, 60_000);

  for (const [name, code] of Object.entries(SAMPLES)) {
    it(`fails on ${name} in a screen`, async () => {
      for (const place of SCREENS) {
        expect(await fenceReports(code, place), place).toHaveLength(1);
      }
    });
  }

  it("lets server code, queries and the health route read the database", async () => {
    for (const place of [
      "src/server/sample.ts",
      "src/features/requests/queries/sample.ts",
      "src/app/health/route.ts",
    ]) {
      for (const code of Object.values(SAMPLES)) {
        expect(await fenceReports(code, place), place).toEqual([]);
      }
    }
  });

  it("lets a screen import other server modules", async () => {
    const code =
      'import { requireUser } from "@/server/auth/session";\nexport const a = requireUser;\n';
    expect(await fenceReports(code, "src/app/sample/page.tsx")).toEqual([]);
  });
});
