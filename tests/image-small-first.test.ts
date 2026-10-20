import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// edge-cases/developer-rules.md rule 12: "Images load as small versions first" (plan of 9.2, What
// will exist 8). Every <img> of src/ (tests left out) asks for the 160 px version, `/files/<id>/small`,
// written as that literal; any other source fails, unless its file is a named full-size viewer that
// opens on a click (review of the plan, correction 6). That the upload makes the 160 px and 1200 px
// versions is src/app/files/route.db.test.ts, "a 3000 × 2000 JPEG becomes 160 px and 1200 px".

const ROOT = join(process.cwd(), "src");

/** The pages that show one record's photo in full, each opened by a click on its row. */
const FULL_SIZE_VIEWERS: Record<string, string> = {
  "app/(app)/suggestions/[id]/page.tsx":
    "one suggestion's own page, opened from its row in the list, which shows the small version",
};

const SMALL = /^\{`\/files\/\$\{[^}]+\}\/small`\}$/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

/** The `src` of each <img> of a source text, as written. */
function imageSources(text: string): string[] {
  return [...text.matchAll(/<img\b([^>]*?)\/?>/gs)].map((match) => {
    const src = /\bsrc=(\{`[^`]*`\}|\{[^}]*\}|"[^"]*")/.exec(match[1]!);
    return src ? src[1]! : "(no src)";
  });
}

describe("images load small first (developer-rules.md rule 12)", () => {
  it("every <img> asks for the small version, but in a named full-size viewer", () => {
    const wrong: string[] = [];
    let seen = 0;
    for (const path of sources(ROOT)) {
      const file = relative(ROOT, path);
      for (const src of imageSources(readFileSync(path, "utf8"))) {
        seen += 1;
        if (!SMALL.test(src) && FULL_SIZE_VIEWERS[file] === undefined)
          wrong.push(`${file}: ${src}`);
      }
    }
    expect(seen).toBeGreaterThan(5);
    expect(wrong).toEqual([]);
  });

  it("an address held in a variable, or the large version, is caught (the check can fail)", () => {
    const sample = `<img src={address} alt="" /><img\n  src={\`/files/\${id}/large\`}\n  alt="" />`;
    expect(imageSources(sample).filter((src) => !SMALL.test(src))).toHaveLength(2);
    expect(
      imageSources('<img src={`/files/${id}/small`} alt="" />').every((src) => SMALL.test(src)),
    ).toBe(true);
  });
});
