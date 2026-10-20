import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PG_RESTORE_ARGS,
  RESERVED_DATABASES,
  newestCopyKey,
  refuseTarget,
  restoreEnv,
  runPgRestore,
} from "../scripts/restore-copy.mjs";

// The restore of a weekly copy (build-plan 9.6: "into a new, empty database, never over the live
// one"; 13-technology.md Running it; 16-build-order.md phase 8 row; plan of 9.6, decided items 1,
// 5 and 7). The address and passwords here are invented.

const ADDRESS = "postgres://invented_user:inv%40nted-pass@db.invented.example:25060/defaultdb";
const NEVER = /^Refused: .*Nothing was written\.$/;

describe("refuseTarget (decided item 1, Look first: never over the live one)", () => {
  it("refuses the app's own database and PostgreSQL's own ones", () => {
    expect(RESERVED_DATABASES).toEqual(["defaultdb", "postgres", "template0", "template1"]);
    for (const name of [...RESERVED_DATABASES, "procurement"]) {
      expect(() => refuseTarget(name, "procurement"), name).toThrow(NEVER);
    }
  });

  it("refuses a name that is not a plain lower-case identifier", () => {
    for (const name of [
      "",
      "Drill",
      "drill-1",
      '"defaultdb"',
      "drill;drop",
      "1drill",
      "a".repeat(64),
      undefined,
    ]) {
      expect(() => refuseTarget(name, "procurement"), String(name)).toThrow(NEVER);
    }
  });

  it("accepts a new name", () => {
    expect(() => refuseTarget("drill_20261019", "defaultdb")).not.toThrow();
  });
});

describe("newestCopyKey (decided item 5: the newest by the date in its name)", () => {
  it("chooses the newest copy and ignores every other key", () => {
    expect(
      newestCopyKey([
        "backups/database-2026-10-11.dump",
        "backups/database-2026-10-18.dump",
        "backups/database-2026-10-04.dump",
        "backups/database-2026-10-25.dump.part",
        "backups/notes.txt",
        "uploads/database-2026-12-31.dump",
      ]),
    ).toBe("backups/database-2026-10-18.dump");
    expect(newestCopyKey(["backups/notes.txt"])).toBeNull();
    expect(newestCopyKey([])).toBeNull();
  });
});

describe("pg_restore's call (decided item 7; plan of 8.2, nit 4)", () => {
  it("restores into the new database with no owner or grant of the source and stops at the first error", () => {
    expect(PG_RESTORE_ARGS).toEqual([
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--no-password",
    ]);
  });

  it("gives the address as PG* variables, with only the database name replaced, never as an argument", () => {
    const env = restoreEnv(
      {
        DATABASE_URL: ADDRESS,
        PATH: "/usr/bin",
        BACKUP_S3_SECRET_ACCESS_KEY: "invented-backup-secret",
        BETTER_AUTH_SECRET: "invented-auth-secret",
      },
      "drill_20261019",
      "/tmp/invented/ca.crt",
    );
    expect(env).toEqual({
      PATH: "/usr/bin",
      PGHOST: "db.invented.example",
      PGPORT: "25060",
      PGUSER: "invented_user",
      PGPASSWORD: "inv@nted-pass",
      PGDATABASE: "drill_20261019",
      PGSSLMODE: "verify-full",
      PGSSLROOTCERT: "/tmp/invented/ca.crt",
    });
    expect(PG_RESTORE_ARGS.join(" ")).not.toContain("invented");
  });
});

describe("runPgRestore (decided item 8; permission review of 9.6, should fix 2)", () => {
  it("calls pg_restore with its arguments, the new database's name and the file only, and removes the CA file", async () => {
    // An invented pg_restore on PATH that writes down how it was called.
    const folder = await mkdtemp(join(tmpdir(), "fake-pg-restore-"));
    try {
      const record = join(folder, "called.txt");
      const fake = join(folder, "pg_restore");
      await writeFile(
        fake,
        `#!/bin/sh\nprintf '%s\\n' "$@" > "${record}"\nenv | grep '^PG' | sort >> "${record}"\ncat "$PGSSLROOTCERT" >> "${record}"\n`,
      );
      await chmod(fake, 0o700);
      const before = (await readdir(tmpdir())).filter((name) => name.startsWith("db-restore-ca-"));
      const ca = "-----BEGIN CERTIFICATE-----invented-----END CERTIFICATE-----";

      await runPgRestore(
        { DATABASE_URL: ADDRESS, DATABASE_CA_CERT: ca, PATH: `${folder}:/usr/bin:/bin` },
        "drill_20261019",
        "/tmp/invented/copy.dump",
      );

      const lines = (await readFile(record, "utf8")).trim().split("\n");
      expect(lines.slice(0, 6)).toEqual([
        ...PG_RESTORE_ARGS,
        "--dbname=drill_20261019",
        "/tmp/invented/copy.dump",
      ]);
      expect(lines).toContain("PGDATABASE=drill_20261019");
      expect(lines).toContain("PGSSLMODE=verify-full");
      expect(lines.at(-1)).toBe(ca);
      expect(lines.slice(0, 6).join(" ")).not.toContain("inv@nted-pass");
      const after = (await readdir(tmpdir())).filter((name) => name.startsWith("db-restore-ca-"));
      expect(after).toEqual(before);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it("tells only pg_restore's exit code when it fails", async () => {
    const folder = await mkdtemp(join(tmpdir(), "fake-pg-restore-"));
    try {
      await writeFile(
        join(folder, "pg_restore"),
        "#!/bin/sh\necho invented-server-detail >&2\nexit 3\n",
      );
      await chmod(join(folder, "pg_restore"), 0o700);
      await expect(
        runPgRestore(
          { DATABASE_URL: ADDRESS, PATH: `${folder}:/usr/bin:/bin` },
          "drill_x",
          "/tmp/x",
        ),
      ).rejects.toThrow(/^pg_restore ended with code 3$/);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
