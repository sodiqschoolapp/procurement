import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

// 11-screens-and-ux.md rule 5: "Pages show grey placeholders in the shape of the content while
// loading, never a full-page spinner" (plan of 9.2, What will exist 9). Every page of the app
// behind sign-in has a loading.tsx in its folder or a parent folder up to src/app/(app), or wraps
// what it reads in <Suspense fallback=…> itself (the home page); the sections of STATUS_FIRST
// excepted. The speed run waits for the
// placeholders' `aria-busy="true"` to be gone.

const APP = join(process.cwd(), "src", "app", "(app)");

/**
 * The sections whose pages answer another role with a 404 (03 rule 1; the tests of
 * users.spec.ts, settings.spec.ts, subtypes.spec.ts and the others read the status). A loading.tsx
 * makes Next.js send the page's frame with 200 before the page can call notFound(), so these keep
 * none (plan of 9.2, decided during the build, Look first). Each opened under 400 ms in the speed
 * run (docs/speed.md).
 */
const STATUS_FIRST = ["branches", "catalog", "prices", "settings", "suggestions", "users"];

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

function placeholderOf(page: string): string | null {
  if (/<Suspense\s+fallback=/.test(readFileSync(page, "utf8"))) return page;
  for (let dir = dirname(page); ; dir = dirname(dir)) {
    const loading = join(dir, "loading.tsx");
    if (existsSync(loading)) return loading;
    if (dir === APP || !dir.startsWith(APP)) return null;
  }
}

describe("placeholders while a page loads (11-screens-and-ux.md rule 5)", () => {
  it("every page has a loading.tsx above it or a Suspense fallback of its own", () => {
    const missing = pages(APP)
      .filter((page) => !STATUS_FIRST.includes(relative(APP, page).split(sep)[0]!))
      .filter((page) => placeholderOf(page) === null)
      .map((page) => relative(APP, page).split(sep).join("/"));
    expect(missing).toEqual([]);
  });

  it("no page of a section that answers 404 has a loading.tsx above it", () => {
    const framed = pages(APP)
      .filter((page) => STATUS_FIRST.includes(relative(APP, page).split(sep)[0]!))
      .filter((page) => placeholderOf(page)?.endsWith("loading.tsx"))
      .map((page) => relative(APP, page).split(sep).join("/"));
    expect(framed).toEqual([]);
  });

  it("each loading.tsx marks its area busy and draws the grey shapes", () => {
    const files = pages(APP)
      .map(placeholderOf)
      .filter((path) => path?.endsWith("loading.tsx"));
    for (const file of new Set(files)) {
      const text = readFileSync(file!, "utf8");
      expect(text, file!).toContain('aria-busy="true"');
      expect(text, file!).toContain("<Skeleton");
    }
  });
});
