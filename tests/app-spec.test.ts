import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// build-plan 0.16: "the DigitalOcean App Platform spec for the test copy, kept in the repository
// (1 GiB container, development database, Frankfurt, a new version on every push to `main`, …,
// the address `ombor-test.sodiqschool.uz`)"; 18-hosting-and-costs.md row 7; docs/decisions.md,
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

describe("the App Platform spec of the test copy (build-plan 0.16; 18-hosting row 7)", () => {
  it("runs in Frankfurt at ombor-test.sodiqschool.uz", () => {
    expect(valuesOf("region")).toEqual(["fra"]);
    expect(valuesOf("domain")).toEqual(["ombor-test.sodiqschool.uz"]);
  });

  it("builds this repository's Dockerfile on every push to main", () => {
    expect(valuesOf("repo")).toEqual(["sodiqschoolapp/procurement"]);
    expect(valuesOf("branch")).toEqual(["main"]);
    expect(valuesOf("deploy_on_push")).toEqual(["true"]);
    expect(valuesOf("dockerfile_path")).toEqual(["Dockerfile"]);
  });

  it("has one service of one 1 GiB container", () => {
    const slugs = valuesOf("instance_size_slug");
    expect(slugs).toHaveLength(1);
    expect(slugs[0]).toMatch(/-1gb(-|$)/);
    expect(valuesOf("instance_count")).toEqual(["1"]);
  });

  it("has one development database, PostgreSQL 17", () => {
    expect(valuesOf("engine")).toEqual(["PG"]);
    expect(valuesOf("version")).toEqual(['"17"']);
    expect(valuesOf("production")).toEqual(["false"]);
  });

  it("sends traffic to a new version only when /health answers", () => {
    expect(valuesOf("http_path")).toEqual(["/health"]);
    expect(valuesOf("http_port")).toEqual(["8080"]);
  });

  it("holds no secret: every value is a DigitalOcean binding or a plain word (Decided ahead 0.16, item 2; build-plan 0.15)", () => {
    expect(valuesOf("value")).toEqual([
      "production",
      "${db.DATABASE_URL}",
      "${db.CA_CERT}",
      "${_self.COMMIT_HASH}",
      '"yes"',
      "auto",
      "ombor-test-files",
    ]);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect(text).not.toMatch(/BEGIN CERTIFICATE/);
  });

  it("seeds the demo users and names the R2 bucket, leaving every typed value to the dashboard (build-plan 0.15)", () => {
    expect(valuesOf("key")).toEqual([
      "NODE_ENV",
      "DATABASE_URL",
      "DATABASE_CA_CERT",
      "GIT_COMMIT",
      "SEED_DEMO_DATA",
      "S3_REGION",
      "S3_BUCKET",
    ]);
    expect(text).not.toMatch(
      /PASSWORD|S3_ENDPOINT|S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY|BETTER_AUTH_SECRET/,
    );
  });
});
