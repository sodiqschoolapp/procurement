import { describe, expect, it } from "vitest";

import { NEVER_MAIN, type PageAction, mainAction } from "./main-action";
import type { RequestStatus } from "./request-status";

// 11-screens-and-ux.md, Order page layout 4 ("the main next action this user can take as one
// button, and the user's other actions now under More"); 06-approval-workflow.md, Statuses and
// Allowed moves; plan of 2.9b, decided item 1 (Look first) and its table per status and role. Each
// case gives what the page offers that user today (allowedActions(), buyingActions() and the
// page's can… facts); the main action is one of them, or none.

const cases: {
  status: RequestStatus;
  who: string;
  offered: PageAction[];
  main: PageAction | null;
}[] = [
  { status: "DRAFT", who: "owner or Head, no number", offered: ["SUBMIT"], main: "SUBMIT" },
  {
    status: "DRAFT",
    who: "owner or Head, taken back",
    offered: ["SUBMIT", "CANCEL"],
    main: "SUBMIT",
  },
  {
    status: "PENDING_HEAD",
    who: "Head",
    offered: ["APPROVE", "SEND_BACK", "REJECT", "CANCEL", "COPY"],
    main: "APPROVE",
  },
  {
    status: "PENDING_HEAD",
    who: "owner (Manager)",
    offered: ["TAKE_BACK", "CANCEL", "COPY"],
    main: null,
  },
  {
    status: "PENDING_PRINCIPAL",
    who: "Principal",
    offered: ["APPROVE", "SEND_BACK", "REJECT"],
    main: "APPROVE",
  },
  { status: "PENDING_PRINCIPAL", who: "owner or Head", offered: ["CANCEL", "COPY"], main: null },
  {
    status: "PENDING_FINANCE",
    who: "Finance",
    offered: ["APPROVE", "SEND_BACK", "REJECT"],
    main: "APPROVE",
  },
  { status: "PENDING_FINANCE", who: "owner or Head", offered: ["CANCEL", "COPY"], main: null },
  {
    status: "RETURNED",
    who: "owner or Head",
    offered: ["SUBMIT_AGAIN", "CANCEL", "COPY"],
    main: "SUBMIT_AGAIN",
  },
  {
    status: "PURCHASING",
    who: "owner or Head, buying open",
    offered: ["RECORD_PURCHASE", "FINISH_ORDER", "MARK_NOT_BOUGHT", "COPY"],
    main: "RECORD_PURCHASE",
  },
  { status: "PURCHASING", who: "Finance", offered: ["RECORD_MONEY"], main: "RECORD_MONEY" },
  {
    status: "PURCHASING",
    who: "owner or Head, finished, exact match",
    offered: ["CLOSE_EXACT", "SEND_TO_SETTLEMENT", "REOPEN_BUYING", "COPY"],
    main: "CLOSE_EXACT",
  },
  {
    status: "PURCHASING",
    who: "owner or Head, finished, not exact",
    offered: ["SEND_TO_SETTLEMENT", "REOPEN_BUYING", "COPY"],
    main: "SEND_TO_SETTLEMENT",
  },
  {
    status: "PURCHASING",
    who: "owner or Head, finished, skipped Finance",
    offered: ["CLOSE_SKIPPED", "REOPEN_BUYING", "COPY"],
    main: "CLOSE_SKIPPED",
  },
  {
    status: "PURCHASING",
    who: "owner without CLOSE_ALONE, finished, skipped Finance",
    offered: ["REOPEN_BUYING", "COPY"],
    main: null,
  },
  {
    status: "SETTLEMENT",
    who: "Finance",
    offered: ["SETTLE", "CLOSE", "RECORD_MONEY", "SEND_BACK_FOR_CORRECTION"],
    main: "SETTLE",
  },
  {
    status: "SETTLEMENT",
    who: "Head, an overspend acknowledgment waits",
    offered: ["ACKNOWLEDGE_OVERSPEND", "COPY"],
    main: "ACKNOWLEDGE_OVERSPEND",
  },
  { status: "SETTLEMENT", who: "owner", offered: ["COPY"], main: null },
  { status: "CLOSED", who: "Head", offered: ["REOPEN", "COPY"], main: "COPY" },
  { status: "CLOSED", who: "owner", offered: ["COPY"], main: "COPY" },
  { status: "REJECTED", who: "owner", offered: ["COPY"], main: "COPY" },
  { status: "CANCELLED", who: "owner", offered: ["COPY"], main: "COPY" },
  {
    status: "PENDING_PRINCIPAL",
    who: "another Manager of the branch",
    offered: ["COPY"],
    main: null,
  },
  { status: "CLOSED", who: "another Manager of the branch", offered: ["COPY"], main: "COPY" },
  { status: "CLOSED", who: "Principal or Finance", offered: [], main: null },
  {
    status: "PENDING_HEAD",
    who: "Principal or Finance, not at their step",
    offered: [],
    main: null,
  },
];

describe("mainAction (11 Order page layout 4; plan of 2.9b, decided item 1, Look first)", () => {
  it.each(cases)("$status, $who: $main", ({ status, offered, main }) => {
    expect(mainAction(status, offered)).toBe(main);
  });

  it("never picks an action the page does not offer", () => {
    for (const { status, offered } of cases) {
      const main = mainAction(status, offered);
      if (main !== null) expect(offered).toContain(main);
    }
  });

  it("an undo, stop or correction move is never main, even offered alone", () => {
    for (const action of NEVER_MAIN) {
      for (const status of ["PENDING_HEAD", "PURCHASING", "SETTLEMENT", "CLOSED"] as const) {
        expect(mainAction(status, [action])).toBeNull();
      }
    }
    expect([...NEVER_MAIN].sort()).toEqual(
      [
        "CANCEL",
        "FINISH_ORDER",
        "MARK_NOT_BOUGHT",
        "REJECT",
        "REOPEN",
        "REOPEN_BUYING",
        "SEND_BACK",
        "SEND_BACK_FOR_CORRECTION",
        "TAKE_BACK",
      ].sort(),
    );
  });

  it("Copy as new is main only on a finished order", () => {
    for (const status of ["CLOSED", "REJECTED", "CANCELLED"] as const) {
      expect(mainAction(status, ["COPY"])).toBe("COPY");
    }
    for (const status of [
      "PENDING_HEAD",
      "PENDING_PRINCIPAL",
      "PENDING_FINANCE",
      "RETURNED",
      "PURCHASING",
      "SETTLEMENT",
    ] as const) {
      expect(mainAction(status, ["COPY"])).toBeNull();
    }
  });
});
