import { describe, expect, it } from "vitest";

import { type StayEvent, approvalStays } from "./approval-stays";

// The stays of the Approval speed block (10 Analytics, Head, Approval speed; 06 Allowed moves;
// plan of 6.4b, decided items 6 to 8; review of the plan, decision 6 worked through).

const at = (time: string) => new Date(`2031-05-02T${time}:00Z`);

function event(
  type: StayEvent["type"],
  from: StayEvent["from"],
  to: StayEvent["to"],
  time: string,
  reason: string | null = null,
): StayEvent {
  return { type, from, to, at: at(time), reason };
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
