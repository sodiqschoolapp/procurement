import { describe, expect, it } from "vitest";

import { type MoveEvent, settlementStays } from "./approval-stays";

// The settlements of the Settlement speed block (10 Analytics, Finance, Settlement speed: "Average
// days from 'Send to settlement' to Closed"; 06 Allowed moves; plan of 6.6b, decided item 3, Look
// first, and the plan review's moves traced through 06). Every history below is one the state
// machine allows: Open and Waiting for settlement have no Cancel or Reject.

const day = (date: string, time = "09:00") => new Date(`2031-05-${date}T${time}:00Z`);

function move(type: MoveEvent["type"], from: MoveEvent["from"], to: MoveEvent["to"], at: Date) {
  return { type, from, to, at };
}

const APPROVED = move("APPROVE", "PENDING_FINANCE", "PURCHASING", day("01"));
const send = (at: Date) => move("SEND_TO_SETTLEMENT", "PURCHASING", "SETTLEMENT", at);
const correct = (at: Date) => move("SEND_BACK_FOR_CORRECTION", "SETTLEMENT", "PURCHASING", at);
const close = (at: Date) => move("CLOSE", "SETTLEMENT", "CLOSED", at);
const closeExact = (at: Date) => move("CLOSE_EXACT", "PURCHASING", "CLOSED", at);
const reopen = (at: Date) => move("REOPEN", "CLOSED", "PURCHASING", at);

describe("settlementStays (10 Finance, Settlement speed; plan of 6.6b, decided item 3)", () => {
  it("one send and one close: the seconds between them", () => {
    expect(settlementStays([APPROVED, send(day("02")), close(day("04", "21:00"))])).toEqual([
      { sentAt: day("02"), closedAt: day("04", "21:00"), seconds: 216_000n },
    ]);
  });

  it("a send back for correction does not end it: counted from the first send", () => {
    const settlements = settlementStays([
      APPROVED,
      send(day("02")),
      correct(day("03")),
      send(day("05")),
      close(day("06")),
    ]);
    expect(settlements).toEqual([{ sentAt: day("02"), closedAt: day("06"), seconds: 345_600n }]);
  });

  it("a correction and then a Close (exact match) by the owner ends it at that close", () => {
    const settlements = settlementStays([
      APPROVED,
      send(day("02")),
      correct(day("03")),
      closeExact(day("04")),
    ]);
    expect(settlements).toEqual([{ sentAt: day("02"), closedAt: day("04"), seconds: 172_800n }]);
  });

  it("a Reopen and a second settlement: two, each from its own send", () => {
    const settlements = settlementStays([
      APPROVED,
      send(day("02")),
      close(day("03")),
      reopen(day("10")),
      send(day("11")),
      close(day("13")),
    ]);
    expect(settlements.map((each) => [each.sentAt, each.seconds])).toEqual([
      [day("02"), 86_400n],
      [day("11"), 172_800n],
    ]);
  });

  it("a Close (exact match) with no send since the last close is none", () => {
    expect(settlementStays([APPROVED, closeExact(day("02"))])).toEqual([]);
    // Settled once, reopened, then closed by exact match: only the first counts.
    const settlements = settlementStays([
      APPROVED,
      send(day("02")),
      close(day("03")),
      reopen(day("04")),
      closeExact(day("05")),
    ]);
    expect(settlements.map((each) => each.closedAt)).toEqual([day("03")]);
  });

  it("an order still waiting for settlement, or back at Open after a correction, has none", () => {
    expect(settlementStays([APPROVED, send(day("02"))])).toEqual([]);
    expect(settlementStays([APPROVED, send(day("02")), correct(day("03"))])).toEqual([]);
  });

  it("a move to another Manager (from = to) changes nothing", () => {
    const settlements = settlementStays([
      APPROVED,
      send(day("02")),
      move("MOVE_OWNER", "SETTLEMENT", "SETTLEMENT", day("02", "12:00")),
      close(day("03")),
    ]);
    expect(settlements).toEqual([{ sentAt: day("02"), closedAt: day("03"), seconds: 86_400n }]);
  });

  it("reads the history in its order, whatever order it is given in", () => {
    const settlements = settlementStays([close(day("03")), send(day("02")), APPROVED]);
    expect(settlements).toEqual([{ sentAt: day("02"), closedAt: day("03"), seconds: 86_400n }]);
  });
});
