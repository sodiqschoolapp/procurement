import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// developer-rules.md rule 4 ("Every server action and query calls the same authorize()
// function"); permission review of 1.10, Should fix 1. The write bodies the catalog actions share
// with the Excel import carry no permission check of their own: they run only inside an action of
// the wrapper, which asked authorize() first. This test lets them be imported only where such an
// action uses them: their own files, the import actions of 1.10, and tests.

const ROOT = join(import.meta.dirname, "..");

const SHARED = [
  "insertProduct",
  "recordProductCreate",
  "lockProducts",
  "insertDepartment",
  "recordDepartmentCreate",
  "lockDepartments",
  "addSubtype",
  "recordSubtypeCreate",
  "lockSubtypes",
];

const ALLOWED = new Set([
  "src/features/catalog/actions/products.ts",
  "src/features/catalog/actions/departments.ts",
  "src/features/catalog/actions/subtypes.ts",
  "src/features/catalog/actions/imports.ts",
]);

/** The files of src/ that import one of the shared write bodies by name. */
export function importersOf(files: { path: string; text: string }[]): string[] {
  const named = new RegExp(
    `import\\s*(?:type\\s*)?\\{[^}]*\\b(${SHARED.join("|")})\\b[^}]*\\}`,
    "s",
  );
  return files.filter(({ text }) => named.test(text)).map(({ path }) => path);
}

function sourceFiles() {
  return readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf8" })
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => {
      const path = relative(ROOT, join(ROOT, "src", name))
        .split("\\")
        .join("/");
      return { path, text: readFileSync(join(ROOT, path), "utf8") };
    });
}

describe("the catalog's shared write bodies stay behind the wrapper (developer-rules.md rule 4)", () => {
  it("are imported only by the catalog actions and the import actions", () => {
    expect(importersOf(sourceFiles()).filter((path) => !ALLOWED.has(path))).toEqual([]);
  });

  it("the check sees an import of one of them elsewhere", () => {
    const page = {
      path: "src/app/sample/actions.ts",
      text: 'import { a, insertProduct } from "@/features/catalog/actions/products";\n',
    };
    expect(importersOf([page])).toEqual(["src/app/sample/actions.ts"]);
    expect(importersOf([{ ...page, text: 'import { createProduct } from "x";\n' }])).toEqual([]);
  });
});
