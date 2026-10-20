import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// build-plan 9.4: "`.do/app.yaml` … turned from the test copy into the live app: app `ombor`,
// 1 GiB container, Managed PostgreSQL with 1 GiB (daily backups), Frankfurt, the R2 buckets
// `ombor-files` and `ombor-copies` …, the address `ombor.sodiqschool.uz`; it starts in trial mode
// with `SEED_DEMO_DATA` on"; 18-hosting-and-costs.md rows 1 to 3; D52; docs/decisions.md,
// "Decided ahead: task 0.16", item 2: no secret in the repository. The file is read as text: no
// YAML library is a dependency of this project. A price is not checked here; the owner checks
// the dashboard's total before creating the app (docs/deploy.md).

const spec = readFileSync(".do/app.yaml", "utf8");
const lines = spec.split(/\r?\n/).filter((line) => !line.trim().startsWith("#"));
const text = lines.join("\n");

function valuesOf(key: string): string[] {
  const pattern = new RegExp(`^\\s*(?:- )?${key}:\\s*(.*)$`);
  return lines.flatMap((line) => {
    const match = pattern.exec(line);
    return match ? [match[1]!.trim()] : [];
  });
}

describe("the App Platform spec of the live app (build-plan 9.4; 18-hosting rows 1 to 3; D52)", () => {
  it("is the app ombor, in Frankfurt, at ombor.sodiqschool.uz", () => {
    expect(valuesOf("region")).toEqual(["fra"]);
    expect(valuesOf("domain")).toEqual(["ombor.sodiqschool.uz"]);
    expect(valuesOf("name")[0]).toBe("ombor");
  });

  it("names the service web and the database component ombor-db, as the live app has them (D59)", () => {
    expect(valuesOf("name")).toEqual(["ombor", "web", "ombor-db"]);
  });

  it("builds this repository's Dockerfile on every push to main (open question 10)", () => {
    expect(valuesOf("repo")).toEqual(["sodiqschoolapp/procurement"]);
    expect(valuesOf("branch")).toEqual(["main"]);
    expect(valuesOf("deploy_on_push")).toEqual(["true"]);
    expect(valuesOf("dockerfile_path")).toEqual(["Dockerfile"]);
  });

  it("has one service of one 1 GiB container (row 1)", () => {
    const slugs = valuesOf("instance_size_slug");
    expect(slugs).toHaveLength(1);
    expect(slugs[0]).toMatch(/-1gb(-|$)/);
    expect(valuesOf("instance_count")).toEqual(["1"]);
  });

  it("uses the managed PostgreSQL 17 cluster ombor-db as its owner (row 2; plan of 9.4, decided item 1)", () => {
    expect(valuesOf("engine")).toEqual(["PG"]);
    expect(valuesOf("version")).toEqual(['"17"']);
    expect(valuesOf("production")).toEqual(["true"]);
    expect(valuesOf("cluster_name")).toEqual(["ombor-db"]);
    expect(valuesOf("db_name")).toEqual(["defaultdb"]);
    expect(valuesOf("db_user")).toEqual(["doadmin"]);
  });

  it("sends traffic to a new version only when /health answers", () => {
    expect(valuesOf("http_path")).toEqual(["/health"]);
    expect(valuesOf("http_port")).toEqual(["8080"]);
  });

  it("holds no secret: every value is a DigitalOcean binding or a plain word (Decided ahead 0.16, item 2)", () => {
    expect(valuesOf("value")).toEqual([
      "production",
      "${ombor-db.DATABASE_URL}",
      "${ombor-db.CA_CERT}",
      "${_self.COMMIT_HASH}",
      '"yes"',
      "auto",
      "ombor-files",
      "ombor-copies",
    ]);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect(text).not.toMatch(/BEGIN CERTIFICATE/);
  });

  // D52 replaces the 0.15 note "the production app spec must not carry SEED_DEMO_DATA": the live
  // app starts in trial mode with it on, and 9.5 removes it (plan of 9.4, decided item 4, Look first).
  it("starts in trial mode and names both R2 buckets, leaving every typed value to the dashboard (D52; build-plan 8.2b)", () => {
    expect(valuesOf("key")).toEqual([
      "NODE_ENV",
      "DATABASE_URL",
      "DATABASE_CA_CERT",
      "GIT_COMMIT",
      "SEED_DEMO_DATA",
      "S3_REGION",
      "S3_BUCKET",
      "BACKUP_S3_BUCKET",
    ]);
    expect(text).not.toMatch(
      /PASSWORD|S3_ENDPOINT|S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY|BETTER_AUTH_SECRET|ERROR_REPORT_DSN/,
    );
  });

  it("keeps no trace of the test copy (D52)", () => {
    expect(spec).not.toMatch(/ombor-test/);
  });
});
