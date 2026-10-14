import { describe, expect, it } from "vitest";

import { REQUEST_STATUSES } from "./request-status";

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
});
