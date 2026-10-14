import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// build-plan 0.16: "No secret enters the repository, a pull request or a chat"; CLAUDE.md,
// secrets convention: the developer's .env never enters the image the Dockerfile builds.

describe(".dockerignore keeps the local .env out of the image (build-plan 0.16; CLAUDE.md, secrets)", () => {
  it("lists .env and every .env.* file", () => {
    const entries = readFileSync(".dockerignore", "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim());

    expect(entries).toContain(".env");
    expect(entries).toContain(".env.*");
    expect(entries.some((entry) => entry.startsWith("!.env"))).toBe(false);
  });
});
