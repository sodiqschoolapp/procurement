import { describe, expect, it } from "vitest";

import type { LockedOrder } from "./order-action";
import { orderState } from "./order-moves";

// The machine's view of a locked order (06-approval-workflow.md, Allowed moves; 08 Exact match;
// plan of 4.4, decided item 3): `exactMatch` is what the action's facts step read, and false when
// no step read it, so no move that needs it is ever offered on a guess.

const locked: LockedOrder = {
  id: "00000000-0000-4000-8000-000000000001",
  branchId: "00000000-0000-4000-8000-000000000002",
  ownerId: "00000000-0000-4000-8000-000000000003",
  status: "PURCHASING",
  version: 3,
  revision: 1,
  progress: "DONE",
  createdByHead: false,
  ownerClosesAlone: true,
};

describe("orderState() reads exactMatch from the facts step (08 Exact match)", () => {
  it("is false when no step read it", () => {
    expect(orderState(locked).exactMatch).toBe(false);
  });

  it("is what the step read", () => {
    expect(orderState({ ...locked, exactMatch: true }).exactMatch).toBe(true);
    expect(orderState({ ...locked, exactMatch: false }).exactMatch).toBe(false);
  });

  it("buying finished is progress other than Open (07 Finishing)", () => {
    expect(orderState(locked).buyingFinished).toBe(true);
    expect(orderState({ ...locked, progress: "OPEN" }).buyingFinished).toBe(false);
  });
});
