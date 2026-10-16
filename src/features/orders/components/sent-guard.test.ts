import { describe, expect, it } from "vitest";

import { createSentGuard } from "./sent-guard";

// Review of the plan of 2.6, correction 2 (11-screens-and-ux.md rules 4 and 7): after "Not saved",
// Enter on the same text sends it again; a text that saved is not sent twice.
describe("createSentGuard (11 rules 4 and 7)", () => {
  it("sends a changed text once: Enter and the blur after it send one save", () => {
    const guard = createSentGuard();
    expect(guard.take("20", "10")).toBe(true);
    expect(guard.take("20", "10")).toBe(false);
  });

  it("sends nothing when the text is the server's value", () => {
    expect(createSentGuard().take("10", "10")).toBe(false);
  });

  it("a failed save lets the same text be sent again", () => {
    const guard = createSentGuard();
    expect(guard.take("20", "10")).toBe(true);
    guard.failed("20");
    expect(guard.take("20", "10")).toBe(true);
  });

  it("a failure of an older text does not free a newer one", () => {
    const guard = createSentGuard();
    guard.take("20", "10");
    guard.take("30", "10");
    guard.failed("20");
    expect(guard.take("30", "10")).toBe(false);
  });

  it("reset frees the text (a new server value, or the cell focused again)", () => {
    const guard = createSentGuard();
    guard.take("20", "10");
    guard.reset();
    expect(guard.take("20", "10")).toBe(true);
  });
});
