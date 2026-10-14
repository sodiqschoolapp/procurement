import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { PERMISSIONS } from "@/domain/permissions";

import {
  OPEN_ROUTES,
  QUERIES,
  SERVER_ACTIONS,
  type SourceFile,
  exportedNames,
  isServerActionFile,
  unlisted,
} from "./permission-registry";

// developer-rules.md rule 4 ("Every server action and query calls the same authorize()
// function"); 03-roles-and-permissions.md rule 1; plan of 0.7: an unlisted action, query or
// open route turns this test red.

const ROOT = join(import.meta.dirname, "..");

function sourceFiles(): SourceFile[] {
  return readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf8" })
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => {
      const path = relative(ROOT, join(ROOT, "src", name))
        .split("\\")
        .join("/");
      return { path, text: readFileSync(join(ROOT, path), "utf8") };
    });
}

describe("the permission registry (developer-rules.md rule 4)", () => {
  it("lists every server action, every query and every open route of src/", () => {
    expect(unlisted(sourceFiles())).toEqual([]);
  });

  it("lists only what exists, with a permission of the matrix", () => {
    const files = sourceFiles();
    const exported = new Set(
      files.flatMap(({ path, text }) => exportedNames(text).map((name) => `${path}#${name}`)),
    );
    for (const key of [...Object.keys(SERVER_ACTIONS), ...Object.keys(QUERIES)]) {
      expect(exported.has(key), key).toBe(true);
    }
    for (const entry of [...Object.values(SERVER_ACTIONS), ...Object.values(QUERIES)]) {
      expect(entry === "OPEN" || entry in PERMISSIONS, entry).toBe(true);
    }
    const paths = new Set(files.map((file) => file.path));
    for (const route of OPEN_ROUTES) expect(paths.has(route), route).toBe(true);
  });

  it("turns red for an unlisted server action", () => {
    const sample = {
      path: "src/features/requests/actions/approve.ts",
      text: `// A sample.\n"use server";\n\nexport async function approveAction() {}\n`,
    };
    expect(unlisted([sample])).toEqual([
      "server action src/features/requests/actions/approve.ts#approveAction",
    ]);
  });

  it("turns red for an unlisted query", () => {
    const sample = {
      path: "src/features/requests/queries/list.ts",
      text: `export async function listRequests() {}\nexport const countRequests = () => 0;\n`,
    };
    expect(unlisted([sample])).toEqual([
      "query src/features/requests/queries/list.ts#listRequests",
      "query src/features/requests/queries/list.ts#countRequests",
    ]);
  });

  it("turns red for a page that checks nobody and is not an open route; passes one that calls requireUser()", () => {
    const open = { path: "src/app/requests/page.tsx", text: "export default function Page() {}" };
    const checked = {
      path: "src/app/stock/page.tsx",
      text: 'export default async function Page() { await requireUser("/stock"); }',
    };
    const route = { path: "src/app/files/[id]/route.ts", text: "export async function GET() {}" };
    expect(unlisted([open, checked, route])).toEqual([
      "open route src/app/requests/page.tsx",
      "open route src/app/files/[id]/route.ts",
    ]);
  });

  it("turns red for an inline server action, a layout or a special route file that checks nobody, and a check written only in a comment", () => {
    const inline = {
      path: "src/app/requests/page.tsx",
      text: `export default async function Page() {\n  await requireUser("/requests");\n  async function save() {\n    "use server";\n  }\n}\n`,
    };
    const layout = { path: "src/app/requests/layout.tsx", text: "export default function L() {}" };
    const image = { path: "src/app/opengraph-image.tsx", text: "export default function I() {}" };
    const comment = {
      path: "src/app/stock/page.tsx",
      text: '// requireUser("/stock") comes later\nexport default function Page() {}',
    };
    expect(unlisted([inline, layout, image, comment])).toEqual([
      "inline server action src/app/requests/page.tsx",
      "open route src/app/requests/layout.tsx",
      "open route src/app/opengraph-image.tsx",
      "open route src/app/stock/page.tsx",
    ]);
  });

  it("sees a default export of a name in a server action file", () => {
    expect(exportedNames("const run = async () => {};\nexport default run;\n")).toEqual([
      "default",
    ]);
  });

  it("reads the directive after comments, and not a string later in the file", () => {
    expect(isServerActionFile(`// note\n/* more */\n"use server";\n`)).toBe(true);
    expect(isServerActionFile(`import x from "y";\nconst a = "use server";\n`)).toBe(false);
  });
});
