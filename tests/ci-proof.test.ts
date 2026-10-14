import { expect, it } from "vitest";

// build-plan 0.3, Done when: one run where a deliberately failing test turns the check red.
// The next commit deletes this file.
it("fails on purpose, to show that CI turns red", () => {
  expect(1).toBe(2);
});
