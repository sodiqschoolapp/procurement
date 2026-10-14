import { afterEach, describe, expect, it, vi } from "vitest";

import { currentCommit, shortCommit } from "./commit";

// build-plan 0.16 and docs/decisions.md, "Decided ahead: task 0.16" item 5: the test copy shows
// the commit of main. The commit below is invented.

describe("the commit the app runs (build-plan 0.16; Decided ahead 0.16, item 5)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads GIT_COMMIT and shortens it to seven characters", () => {
    vi.stubEnv("GIT_COMMIT", " 0123456789abcdef0123456789abcdef01234567\n");

    expect(currentCommit()).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(shortCommit()).toBe("0123456");
  });

  it('is "unknown", with no short form, when GIT_COMMIT is not set', () => {
    vi.stubEnv("GIT_COMMIT", "");

    expect(currentCommit()).toBe("unknown");
    expect(shortCommit()).toBeUndefined();
  });
});
