import { describe, expect, it } from "vitest";

import { approveResultKey, reopenResultKey, skippedShare } from "./move-texts";

// 11-screens-and-ux.md rule 6 ("Irreversible actions ask for confirmation and state the
// result"); 06-approval-workflow.md, Finance step switched off (plan of 4.10c, review of the plan,
// Must fix 3 and Should fix 4).

describe("approveResultKey (06 Allowed moves, the Principal's Approve)", () => {
  it("the Principal's approval with the step off says the orders open at once", () => {
    expect(approveResultKey(["PENDING_PRINCIPAL", "PENDING_PRINCIPAL"], false)).toBe(
      "resultSkipFinance",
    );
  });

  it("with the step on, or at the Head's step, the next approver is told", () => {
    expect(approveResultKey(["PENDING_PRINCIPAL"], true)).toBe("result");
    expect(approveResultKey(["PENDING_HEAD"], false)).toBe("result");
  });

  it("Finance's approval names the cash, whatever the step", () => {
    expect(approveResultKey(["PENDING_FINANCE"], false)).toBe("resultFinance");
    expect(approveResultKey(["PENDING_FINANCE"], true)).toBe("resultFinance");
  });
});

describe("reopenResultKey (06 Finance step switched off 6)", () => {
  it("says the owner closes again for skipped orders, Finance settles for the others, both when mixed", () => {
    expect(reopenResultKey(skippedShare([true, true]))).toBe("REOPEN_SKIPPED");
    expect(reopenResultKey(skippedShare([false]))).toBe("REOPEN");
    expect(reopenResultKey(skippedShare([true, false]))).toBe("REOPEN_MIXED");
    expect(skippedShare([])).toBe("none");
  });
});
