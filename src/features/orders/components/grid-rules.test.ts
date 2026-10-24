import { describe, expect, it } from "vitest";

import type { WireDraftRow } from "@/features/orders/draft-wire";

import {
  canApplyToTicked,
  canSubmitAgainTicked,
  canSubmitTicked,
  rowHoldsSent,
  ticksMixDraftsAndSentBack,
} from "./grid-rules";

// 03 Manager rights: CREATE_REQUESTS off "can only view orders"; plan of 2.5b, decided item 2
// (Look first); spec review of 2.5b, Must fix 3.
describe("canApplyToTicked (03 Manager rights: CREATE_REQUESTS)", () => {
  const rights = new Map([
    ["own", { editable: true }],
    ["other", { editable: true }],
    ["readOnly", { editable: false }],
  ]);

  it("offers Apply when every ticked row may be edited", () => {
    expect(canApplyToTicked(["own", "other"], rights)).toBe(true);
  });

  it("offers no Apply when a read-only row is ticked, nor for an unknown row or nothing ticked", () => {
    expect(canApplyToTicked(["own", "readOnly"], rights)).toBe(false);
    expect(canApplyToTicked(["readOnly"], rights)).toBe(false);
    expect(canApplyToTicked(["gone"], rights)).toBe(false);
    expect(canApplyToTicked([], rights)).toBe(false);
  });
});

// Review of the plan of 2.6, correction 1 (developer-rules.md rule 9; decisions 2.5b item 10): a
// retry answered stale counts as saved only when the server row holds what the retry sent.
describe("rowHoldsSent (developer-rules rule 9; 11 rule 7)", () => {
  const row = {
    id: "d-1",
    version: 4,
    branchId: "b-1",
    variantId: "v-1",
    departmentId: "dep-1",
    companyId: null,
    referencePhotoFileId: null,
    neededBy: "2026-11-02",
    quantity: "5",
    price: "6750",
    paymentType: "CASH",
    priority: "NORMAL",
    urgentReason: null,
    comment: "Ko'k rangli",
    requesterName: null,
    extras: [],
  } as unknown as WireDraftRow;

  it("the first try was saved: quantity 5, price, comment and date are on the server row", () => {
    expect(rowHoldsSent(row, { quantity: "5" })).toBe(true);
    expect(rowHoldsSent(row, { quantity: " 5.000 " })).toBe(true);
    expect(rowHoldsSent(row, { price: "6 750" })).toBe(true);
    expect(rowHoldsSent(row, { comment: "  Ko'k rangli " })).toBe(true);
    expect(rowHoldsSent(row, { neededBy: "2026-11-02", paymentType: "CASH" })).toBe(true);
    expect(rowHoldsSent(row, { companyId: null, requesterName: "" })).toBe(true);
  });

  it("someone else saved and the first try never arrived: the row differs, so it is stale", () => {
    expect(rowHoldsSent(row, { quantity: "6" })).toBe(false);
    expect(rowHoldsSent(row, { price: "7000" })).toBe(false);
    expect(rowHoldsSent(row, { quantity: "5", comment: "Qora" })).toBe(false);
    expect(rowHoldsSent(row, { paymentType: "TRANSFER" })).toBe(false);
    expect(rowHoldsSent(row, { price: "" })).toBe(false);
  });

  it("a field it cannot compare, or a typed text the server would refuse, is never taken as saved", () => {
    expect(rowHoldsSent(row, { extras: [] })).toBe(false);
    expect(rowHoldsSent(row, { quantity: "abc" })).toBe(false);
    expect(rowHoldsSent(row, { price: "6.5" })).toBe(false);
  });
});

describe("Submit and Submit again on ticked rows (05 Drafts 5; plan of 2.11, decided item 9)", () => {
  // The rights are the state machine's per row (draftSubmittable(), draftSubmittableAgain()): a
  // Head ticking a Manager's sent-back row has submittableAgain false (review of the plan, Must fix 1).
  const rights = new Map([
    ["draft", { submittable: true, submittableAgain: false }],
    ["mine", { submittable: false, submittableAgain: true }],
    ["managers", { submittable: false, submittableAgain: false }],
  ]);

  it("offers Submit again only when every ticked row allows it", () => {
    expect(canSubmitAgainTicked(["mine"], rights)).toBe(true);
    expect(canSubmitAgainTicked(["mine", "managers"], rights)).toBe(false);
    expect(canSubmitAgainTicked([], rights)).toBe(false);
  });

  it("a mixed tick of a draft and a sent-back order offers neither", () => {
    expect(canSubmitTicked(["draft", "mine"], rights)).toBe(false);
    expect(canSubmitAgainTicked(["draft", "mine"], rights)).toBe(false);
  });

  // Owner's report of 23.10.2026: the bar says why it offers neither, instead of showing nothing.
  it("names the mix only when a draft and a sent-back order this person may submit are both ticked", () => {
    expect(ticksMixDraftsAndSentBack(["draft", "mine"], rights)).toBe(true);
    expect(ticksMixDraftsAndSentBack(["draft"], rights)).toBe(false);
    expect(ticksMixDraftsAndSentBack(["mine"], rights)).toBe(false);
    // A row neither button would take is not a mix of the two kinds: no word about it.
    expect(ticksMixDraftsAndSentBack(["draft", "managers"], rights)).toBe(false);
    expect(ticksMixDraftsAndSentBack(["draft", "mine", "managers"], rights)).toBe(false);
    expect(ticksMixDraftsAndSentBack([], rights)).toBe(false);
  });
});
