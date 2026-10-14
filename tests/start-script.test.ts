import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// build-plan 0.15 (the seed users on the test copy); plan of 0.15, decision 1 (Look first): the
// container migrates, then seeds only with SEED_DEMO_DATA exactly "yes", logs a failed seed and
// starts the app all the same; a failed migration still ends the container (0.16, decision 2).
// scripts/start.sh runs here with a stub `node` and a stub `next` that only write down their
// calls, so the order is checked without a database (review of the plan of 0.15, correction 1).

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

type Outcome = { migrate: number; seed: number };

/** Runs start.sh in a new folder; returns its exit status, its output and the calls made. */
function runStart(env: Record<string, string>, outcome: Outcome) {
  const folder = mkdtempSync(join(tmpdir(), "start-sh-"));
  folders.push(folder);
  mkdirSync(join(folder, "scripts"));
  mkdirSync(join(folder, "bin"));
  mkdirSync(join(folder, "node_modules", ".bin"), { recursive: true });
  copyFileSync("scripts/start.sh", join(folder, "scripts", "start.sh"));
  const calls = join(folder, "calls.txt");
  writeFileSync(
    join(folder, "bin", "node"),
    [
      "#!/bin/sh",
      `echo "node $*" >> "${calls}"`,
      `case "$1" in`,
      `  scripts/db-migrate.mjs) exit ${outcome.migrate} ;;`,
      `  scripts/db-seed.mjs) [ ${outcome.seed} = 0 ] || echo "Refused: invented reason." >&2; exit ${outcome.seed} ;;`,
      "esac",
      "exit 0",
    ].join("\n"),
  );
  writeFileSync(
    join(folder, "node_modules", ".bin", "next"),
    `#!/bin/sh\necho "next $*" >> "${calls}"\n`,
  );
  chmodSync(join(folder, "bin", "node"), 0o755);
  chmodSync(join(folder, "node_modules", ".bin", "next"), 0o755);

  const run = spawnSync("sh", ["scripts/start.sh"], {
    cwd: folder,
    env: {
      NODE_ENV: "test",
      PATH: `${join(folder, "bin")}:/usr/bin:/bin`,
      PORT: "8080",
      ...env,
    },
    encoding: "utf8",
    timeout: 30_000,
  });
  let made: string[] = [];
  try {
    made = readFileSync(calls, "utf8").trim().split("\n");
  } catch {
    made = [];
  }
  return { status: run.status, output: run.stdout + run.stderr, calls: made };
}

const NEXT = "next start --hostname 0.0.0.0 --port 8080";

describe("the container's start seeds the test copy only (build-plan 0.15; plan of 0.15, decision 1)", () => {
  it("with SEED_DEMO_DATA=yes: migrates, seeds, then starts the app", () => {
    const run = runStart({ SEED_DEMO_DATA: "yes" }, { migrate: 0, seed: 0 });

    expect(run.status).toBe(0);
    expect(run.calls).toEqual(["node scripts/db-migrate.mjs", "node scripts/db-seed.mjs", NEXT]);
  });

  it("with SEED_DEMO_DATA=yes and a seed that fails: logs db:seed failed and still starts the app", () => {
    const run = runStart({ SEED_DEMO_DATA: "yes" }, { migrate: 0, seed: 1 });

    expect(run.status).toBe(0);
    expect(run.calls).toEqual(["node scripts/db-migrate.mjs", "node scripts/db-seed.mjs", NEXT]);
    expect(run.output).toContain("Refused: invented reason.");
    expect(run.output).toMatch(/^db:seed failed: /m);
  });

  it("without the switch, or with any word but yes, does not call the seed", () => {
    const envs: Record<string, string>[] = [
      {},
      { SEED_DEMO_DATA: "" },
      { SEED_DEMO_DATA: "true" },
      { SEED_DEMO_DATA: "YES" },
    ];
    for (const env of envs) {
      const run = runStart(env, { migrate: 0, seed: 0 });

      expect(run.status).toBe(0);
      expect(run.calls).toEqual(["node scripts/db-migrate.mjs", NEXT]);
    }
  });

  it("a failed migration ends the start before the seed and the app (0.16, decision 2)", () => {
    const run = runStart({ SEED_DEMO_DATA: "yes" }, { migrate: 1, seed: 0 });

    expect(run.status).not.toBe(0);
    expect(run.calls).toEqual(["node scripts/db-migrate.mjs"]);
  });
});
