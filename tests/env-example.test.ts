import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// No spec rule covers this file. The test guards docs/build-plan.md task 0.1
// ("`.env.example` with names only") and the CLAUDE.md convention
// "Secrets live in provider dashboards and the local `.env` only."

const NAME_ONLY = /^[A-Z][A-Z0-9_]*=$/;

function isAllowedLine(line: string): boolean {
  const text = line.trim();
  return text === "" || text.startsWith("#") || NAME_ONLY.test(text);
}

describe(".env.example holds names only (build-plan 0.1; CLAUDE.md, secrets convention)", () => {
  it("accepts an empty line, a comment and a name without a value", () => {
    expect(isAllowedLine("")).toBe(true);
    expect(isAllowedLine("# a comment")).toBe(true);
    expect(isAllowedLine("DATABASE_URL=")).toBe(true);
  });

  it("refuses a name with a value and a line that is not a name", () => {
    expect(isAllowedLine("DATABASE_URL=postgres://invented")).toBe(false);
    expect(isAllowedLine('SAMPLE_KEY=""')).toBe(false);
    expect(isAllowedLine("SAMPLE_KEY")).toBe(false);
    expect(isAllowedLine("export SAMPLE_KEY=")).toBe(false);
  });

  it("has no line with a value in the committed file", () => {
    const lines = readFileSync(".env.example", "utf8").split(/\r?\n/);
    const refused = lines.filter((line) => !isAllowedLine(line));

    expect(refused).toEqual([]);
  });
});
