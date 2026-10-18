import { describe, expect, it } from "vitest";

import { FINISHED_REQUEST_STATUSES, REQUEST_STATUSES } from "./request-status";

describe("request statuses (06-approval-workflow.md, Statuses)", () => {
  it("are the ten codes of the spec's table, in its order", () => {
    expect(REQUEST_STATUSES).toEqual([
      "DRAFT",
      "PENDING_HEAD",
      "PENDING_PRINCIPAL",
      "PENDING_FINANCE",
      "RETURNED",
      "PURCHASING",
      "SETTLEMENT",
      "CLOSED",
      "REJECTED",
      "CANCELLED",
    ]);
  });

  it("finished are exactly Closed, Rejected and Cancelled, the three that Nobody acts on next (06 Statuses; plan of 5.12, decided item 1)", () => {
    expect([...FINISHED_REQUEST_STATUSES]).toEqual(["CLOSED", "REJECTED", "CANCELLED"]);
  });
});
