import { describe, expect, it } from "vitest";

// Review of the plan of 0.12, correction 2: the app starts with no S3_* variable (the image step
// of CI sets only DATABASE_URL, GIT_COMMIT and PORT); a missing one fails the call that needs the
// storage, not the start.

describe("the storage client is made on first use (review of the plan of 0.12, correction 2)", () => {
  it("imports with no S3_* variable, and names the missing one at first use", async () => {
    for (const name of Object.keys(process.env)) {
      if (name.startsWith("S3_")) delete process.env[name];
    }
    const storage = await import("./storage");
    storage.resetStorage();

    await expect(storage.getObject("a/small.jpg")).rejects.toThrow(/^S3_ENDPOINT is not set\./);
  });
});
