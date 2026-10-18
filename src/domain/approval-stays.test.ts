import { describe, expect, it } from "vitest";

import { type StayEvent, approvalStays, secondsBetween } from "./approval-stays";

// The stays of the Approval speed block (10 Analytics, Head, Approval speed; 06 Allowed moves;
// plan of 6.4b, decided items 6 to 8; review of the plan, decision 6 worked through).

const at = (time: string) => new Date(`2031-05-02T${time}:00Z`);

function event(
  type: StayEvent["type"],
  from: StayEvent["from"],
  to: StayEvent["to"],
  time: string,
  reason: string | null = null,
  actorId = "approver",
): StayEvent {
  return { type, from, to, at: at(time), reason, actorId };
}

const SUBMIT = (time: string) => event("SUBMIT", "DRAFT", "PENDING_HEAD", time);

describe("approvalStays (06 Allowed moves; plan of 6.4b, decided item 6)", () => {
  it("the review's worked example: Head 1 h, Principal 3 h sent back, Head 0.5 h, Principal 1.5 h", () => {
    const stays = approvalStays([
      SUBMIT("09:00"),
      event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "10:00"),
      event("SEND_BACK", "PENDING_PRINCIPAL", "RETURNED", "13:00", "Narxni tekshiring"),
      event("SUBMIT_AGAIN", "RETURNED", "PENDING_HEAD", "14:00"),
      event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "14:30"),
      event("APPROVE", "PENDING_PRINCIPAL", "PENDING_FINANCE", "16:00"),
    ]);
    expect(stays.map((stay) => [stay.step, stay.seconds, stay.decision, stay.reason])).toEqual([
      ["PENDING_HEAD", 3600n, "APPROVE", null],
      ["PENDING_PRINCIPAL", 10800n, "SEND_BACK", "Narxni tekshiring"],
      ["PENDING_HEAD", 1800n, "APPROVE", null],
      ["PENDING_PRINCIPAL", 5400n, "APPROVE", null],
      ["PENDING_FINANCE", null, null, null],
    ]);
    expect(stays.at(-1)!.enteredAt).toEqual(at("16:00"));
  });

  it("a reject ends a stay with its reason; Finance's approve ends the last stay", () => {
    expect(
      approvalStays([
        SUBMIT("09:00"),
        event("REJECT", "PENDING_HEAD", "REJECTED", "09:30", "Kerak emas"),
      ]).map((stay) => [stay.step, stay.decision, stay.reason]),
    ).toEqual([["PENDING_HEAD", "REJECT", "Kerak emas"]]);
    const approved = approvalStays([
      event("SUBMIT", "DRAFT", "PENDING_PRINCIPAL", "09:00"),
      event("APPROVE", "PENDING_PRINCIPAL", "PENDING_FINANCE", "10:00"),
      event("APPROVE", "PENDING_FINANCE", "PURCHASING", "12:00"),
      event("RECORD_PURCHASE", "PURCHASING", "PURCHASING", "13:00"),
    ]);
    expect(approved.map((stay) => [stay.step, stay.seconds])).toEqual([
      ["PENDING_PRINCIPAL", 3600n],
      ["PENDING_FINANCE", 7200n],
    ]);
  });

  it("a Head-created order whose Submit skips the Head step has no Head stay (03 rule 6)", () => {
    const stays = approvalStays([event("SUBMIT", "DRAFT", "PENDING_PRINCIPAL", "09:00")]);
    expect(stays.map((stay) => stay.step)).toEqual(["PENDING_PRINCIPAL"]);
  });

  it("a stay ended by Take back or Cancel is not a decision and is left out", () => {
    expect(
      approvalStays([SUBMIT("09:00"), event("TAKE_BACK", "PENDING_HEAD", "DRAFT", "10:00")]),
    ).toEqual([]);
    expect(
      approvalStays([
        SUBMIT("09:00"),
        event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "10:00"),
        event("CANCEL", "PENDING_PRINCIPAL", "CANCELLED", "11:00", "Endi kerak emas"),
      ]).map((stay) => stay.step),
    ).toEqual(["PENDING_HEAD"]);
  });

  it("a MOVE_OWNER (from = to) inside an open and a decided stay neither starts nor ends one (Should fix 1)", () => {
    const stays = approvalStays([
      SUBMIT("09:00"),
      event("MOVE_OWNER", "PENDING_HEAD", "PENDING_HEAD", "09:20"),
      event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "10:00"),
      event("MOVE_OWNER", "PENDING_PRINCIPAL", "PENDING_PRINCIPAL", "10:30"),
    ]);
    expect(stays.map((stay) => [stay.step, stay.enteredAt, stay.seconds])).toEqual([
      ["PENDING_HEAD", at("09:00"), 3600n],
      ["PENDING_PRINCIPAL", at("10:00"), null],
    ]);
  });

  it("events of one moment are followed in the order of the moves, whatever order they come in", () => {
    const stays = approvalStays([
      event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "09:00"),
      SUBMIT("09:00"),
    ]);
    expect(stays.map((stay) => [stay.step, stay.seconds])).toEqual([
      ["PENDING_HEAD", 0n],
      ["PENDING_PRINCIPAL", null],
    ]);
  });

  it("no history, no stay", () => {
    expect(approvalStays([])).toEqual([]);
  });
});

describe("approvalStays, the decider (10 Analytics, Principal, My approvals: 'my average time to decide'; 03 rule 3; plan of 6.5a, decided item 3)", () => {
  it("a decided stay names the actor of the event that ended it, an open stay none", () => {
    const stays = approvalStays([
      event("SUBMIT", "DRAFT", "PENDING_HEAD", "09:00", null, "manager"),
      event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "10:00", null, "head"),
      event("SEND_BACK", "PENDING_PRINCIPAL", "RETURNED", "11:00", "Narx", "principal-1"),
      event("SUBMIT_AGAIN", "RETURNED", "PENDING_HEAD", "12:00", null, "manager"),
      event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "12:30", null, "head"),
    ]);
    expect(stays.map((stay) => [stay.step, stay.decidedBy])).toEqual([
      ["PENDING_HEAD", "head"],
      ["PENDING_PRINCIPAL", "principal-1"],
      ["PENDING_HEAD", "head"],
      ["PENDING_PRINCIPAL", null],
    ]);
  });

  it("a stay entered under one Principal and decided by an acting one is the acting one's", () => {
    const stays = approvalStays([
      event("SUBMIT", "DRAFT", "PENDING_PRINCIPAL", "09:00", null, "head"),
      event("APPROVE", "PENDING_PRINCIPAL", "PENDING_FINANCE", "15:00", null, "acting"),
    ]);
    expect(stays[0]).toMatchObject({ step: "PENDING_PRINCIPAL", decidedBy: "acting" });
  });
});

// 10 Analytics, Manager, My orders: "average time to full approval"; plan of 6.5b, decided item 1
// (Look first): one formula for a stay and for first submit to Open.
describe("secondsBetween (plan of 6.5b, decided item 1)", () => {
  it("counts whole seconds, rounded down", () => {
    // The review's worked case: submitted 1.10 10:00, approved by Finance 4.10 10:00 → 72 h.
    expect(
      secondsBetween(new Date("2031-10-01T05:00:00Z"), new Date("2031-10-04T05:00:00Z")),
    ).toBe(259_200n);
    expect(
      secondsBetween(new Date("2031-10-01T05:00:00.000Z"), new Date("2031-10-01T05:00:01.999Z")),
    ).toBe(1n);
    expect(secondsBetween(new Date(0), new Date(0))).toBe(0n);
  });

  it("refuses a length that runs backwards", () => {
    expect(() => secondsBetween(new Date(1000), new Date(0))).toThrow(RangeError);
  });
});
