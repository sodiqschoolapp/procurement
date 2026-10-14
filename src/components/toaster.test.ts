import { describe, expect, it } from "vitest";

import { toastPriority, toastTimeout } from "./toast";

// 11-screens-and-ux.md rule 4: "Success shows a short message. Errors say in plain words what
// happened and what to do next" (plan of 0.10a, decision 10: success goes after 4 seconds, an
// error stays until it is closed, so the person can read what to do next).

describe("toast timing (11-screens rule 4; decision 10)", () => {
  it("a success message goes after 4 seconds", () => {
    expect(toastTimeout("success")).toBe(4000);
    expect(toastPriority("success")).toBe("low");
  });

  it("an error stays until closed and is announced at once", () => {
    expect(toastTimeout("error")).toBe(0);
    expect(toastPriority("error")).toBe("high");
  });
});
