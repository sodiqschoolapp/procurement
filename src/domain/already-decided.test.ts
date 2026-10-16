import { describe, expect, it } from "vitest";

import { type NewestMove, alreadyApprovedBy } from "./already-decided";

// 06-approval-workflow.md rule 7 ("the slower user sees 'Already approved by Dilnoza at 14:32'");
// plan of 2.10, decided item 3 (Look first), as the review narrowed it.

const at = new Date("2026-10-16T09:32:00Z");
const approved: NewestMove = {
  version: 2,
  type: "APPROVE",
  actorId: "aziz",
  actorName: "Aziz Karimov",
  at,
};

describe("alreadyApprovedBy (06 rule 7)", () => {
  it("names the other approver and the time for a stale version", () => {
    expect(
      alreadyApprovedBy({ code: "stale_version", sentVersion: 1 }, approved, "bekzod"),
    ).toEqual({ name: "Aziz Karimov", at });
  });

  it("names them for a wrong status too, when the version moved past the one sent", () => {
    expect(alreadyApprovedBy({ code: "wrong_status", sentVersion: 1 }, approved, "bekzod")).toEqual(
      { name: "Aziz Karimov", at },
    );
  });

  it("is null when the version sent is the current one: the user saw that approval", () => {
    expect(alreadyApprovedBy({ code: "wrong_status", sentVersion: 2 }, approved, "bekzod")).toBe(
      null,
    );
  });

  it("is null for the user's own approval", () => {
    expect(alreadyApprovedBy({ code: "stale_version", sentVersion: 1 }, approved, "aziz")).toBe(
      null,
    );
  });

  it("is null for another newest move: a send back reads its own verb in 2.11", () => {
    expect(
      alreadyApprovedBy(
        { code: "stale_version", sentVersion: 1 },
        { ...approved, type: "SEND_BACK" },
        "bekzod",
      ),
    ).toBe(null);
  });

  it("is null for an order behind a wall (no event read) and for other refusals (03 rule 1)", () => {
    expect(alreadyApprovedBy({ code: "stale_version", sentVersion: 1 }, null, "bekzod")).toBe(null);
    expect(alreadyApprovedBy({ code: "not_found", sentVersion: 1 }, approved, "bekzod")).toBe(null);
    expect(alreadyApprovedBy({ code: "forbidden", sentVersion: 1 }, approved, "bekzod")).toBe(null);
  });
});
