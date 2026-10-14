import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, normalize } from "node:path";

import { describe, expect, it } from "vitest";

// build-plan 0.15 (the seed users on the test copy; the storage check run in the console of the
// test copy) and 0.16, decision 10 (the image holds only what the Dockerfile copies into its run
// stage, and the production packages of `npm ci --omit=dev`). Review of the plan of 0.15,
// correction 1: instead of a CI step, every file the container's scripts reach must be copied,
// and every package they import must be a production dependency.

/** The scripts the image runs: scripts/start.sh, and the check the owner runs in the console. */
const ENTRY_POINTS = ["scripts/db-migrate.mjs", "scripts/db-seed.mjs", "scripts/storage-check.mjs"];

/** The sources of every COPY of the run stage that does not copy from another stage. */
function copiedIntoRunStage(): string[] {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const run = dockerfile.slice(dockerfile.indexOf(" AS run"));
  return run
    .split(/\r?\n/)
    .filter((line) => line.startsWith("COPY ") && !line.includes("--from="))
    .flatMap((line) => {
      const parts = line
        .split(/\s+/)
        .slice(1)
        .filter((part) => !part.startsWith("--"));
      return parts.slice(0, -1).map((source) => normalize(source));
    });
}

function isCopied(file: string, copied: string[]): boolean {
  return copied.some((source) => file === source || file.startsWith(`${source}/`));
}

/** The import specifiers of one file: static, side-effect and dynamic with a literal. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const found = new Set<string>();
  // Statements start a line, so a "from" inside an SQL text is not read as an import.
  const patterns = [
    /^(?:import|export)\s[^;]*?\bfrom\s+"([^"]+)"/gm,
    /^import\s+"([^"]+)"/gm,
    /\bimport\(\s*"([^"]+)"\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) found.add(match[1]!);
  }
  return [...found];
}

function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

/** Every file and package reachable from the entry points through relative imports. */
function reachable(): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [...ENTRY_POINTS];
  while (queue.length > 0) {
    const file = normalize(queue.shift()!);
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of importsOf(file)) {
      if (specifier.startsWith(".")) {
        queue.push(join(dirname(file), specifier));
      } else if (!specifier.startsWith("node:") && !builtinModules.includes(specifier)) {
        packages.add(packageOf(specifier));
      }
    }
  }
  return { files: [...files].sort(), packages: [...packages].sort() };
}

describe("the image holds what its scripts import (build-plan 0.15; 0.16, decision 10)", () => {
  const { files, packages } = reachable();

  it("finds the seed, the storage check and the migration with their imports", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "scripts/db-seed.mjs",
        "scripts/seed.mjs",
        "scripts/first-head.mjs",
        "scripts/storage-check.mjs",
        "scripts/ensure-bucket.mjs",
        "src/server/audit-row.mjs",
        "src/domain/audit-secrets.mjs",
      ]),
    );
    for (const file of files) expect(existsSync(file), file).toBe(true);
  });

  it("copies every one of those files into the run stage", () => {
    const copied = copiedIntoRunStage();
    expect(files.filter((file) => !isCopied(file, copied))).toEqual([]);
  });

  it("imports only production packages, which npm ci --omit=dev installs", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(packages).toEqual(
      expect.arrayContaining(["pg", "pg-connection-string", "sharp", "@aws-sdk/client-s3"]),
    );
    expect(packages.filter((name) => !(name in manifest.dependencies))).toEqual([]);
  });

  it("would notice a file the Dockerfile does not copy", () => {
    expect(isCopied("scripts/seed.mjs", ["scripts/db-seed.mjs"])).toBe(false);
    expect(isCopied("drizzle/0001_sign_in.sql", ["drizzle"])).toBe(true);
  });
});
