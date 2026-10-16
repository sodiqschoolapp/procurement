import { describe, expect, it } from "vitest";

import { type NewestMove, alreadyDecidedBy } from "./already-decided";

// 06-approval-workflow.md rule 7 ("the slower user sees 'Already approved by Dilnoza at 14:32'");
// plan of 2.10, decided item 3 (Look first), as the review narrowed it; the other verbs: plan of
// 2.11, decided item 7 (Look first).

const BEKZOD = { id: "bekzod", role: "HEAD" } as const;
const at = new Date("2026-10-16T09:32:00Z");
const approved: NewestMove = {
  version: 2,
  type: "APPROVE",
  from: "PENDING_HEAD",
  actorId: "aziz",
  actorName: "Aziz Karimov",
  at,
};

describe("alreadyDecidedBy (06 rule 7)", () => {
  it("names the other approver and the time for a stale version", () => {
    expect(alreadyDecidedBy({ code: "stale_version", sentVersion: 1 }, approved, BEKZOD)).toEqual({
      verb: "APPROVE",
      name: "Aziz Karimov",
      at,
    });
  });

  it("names them for a wrong status too, when the version moved past the one sent", () => {
    expect(alreadyDecidedBy({ code: "wrong_status", sentVersion: 1 }, approved, BEKZOD)).toEqual({
      verb: "APPROVE",
      name: "Aziz Karimov",
      at,
    });
  });

  it("is null when the version sent is the current one: the user saw that approval", () => {
    expect(alreadyDecidedBy({ code: "wrong_status", sentVersion: 2 }, approved, BEKZOD)).toBe(null);
  });

  it("is null for the user's own approval", () => {
    expect(
      alreadyDecidedBy({ code: "stale_version", sentVersion: 1 }, approved, {
        id: "aziz",
        role: "HEAD",
      }),
    ).toBe(null);
  });

  it.each(["SEND_BACK", "REJECT"] as const)(
    "names the approver's %s to a role that decides that step (2.11 decided item 7)",
    (type) => {
      expect(
        alreadyDecidedBy({ code: "wrong_status", sentVersion: 1 }, { ...approved, type }, BEKZOD),
      ).toEqual({ verb: type, name: "Aziz Karimov", at });
      expect(
        alreadyDecidedBy(
          { code: "wrong_status", sentVersion: 1 },
          { ...approved, type },
          { id: "f1", role: "FINANCE" },
        ),
      ).toBe(null);
    },
  );

  it.each(["CANCEL", "TAKE_BACK"] as const)(
    "names the owner's %s to any reader who still sees the order (2.11 decided item 7)",
    (type) => {
      for (const role of ["HEAD", "PRINCIPAL", "FINANCE", "MANAGER"] as const) {
        expect(
          alreadyDecidedBy(
            { code: "wrong_status", sentVersion: 1 },
            { ...approved, type, actorId: "owner" },
            { id: "x", role },
          ),
        ).toEqual({ verb: type, name: "Aziz Karimov", at });
      }
    },
  );

  it.each(["SUBMIT", "SUBMIT_AGAIN"] as const)("never names a %s", (type) => {
    expect(
      alreadyDecidedBy({ code: "wrong_status", sentVersion: 1 }, { ...approved, type }, BEKZOD),
    ).toBe(null);
  });

  it("is null for an order behind a wall (no event read) and for other refusals (03 rule 1)", () => {
    expect(alreadyDecidedBy({ code: "stale_version", sentVersion: 1 }, null, BEKZOD)).toBe(null);
    expect(alreadyDecidedBy({ code: "not_found", sentVersion: 1 }, approved, BEKZOD)).toBe(null);
    expect(alreadyDecidedBy({ code: "forbidden", sentVersion: 1 }, approved, BEKZOD)).toBe(null);
  });

  it("is null for a role that never approves that step (permission review of 2.10, Should fix 2)", () => {
    for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      expect(
        alreadyDecidedBy({ code: "stale_version", sentVersion: 1 }, approved, { id: "x", role }),
      ).toBe(null);
    }
    expect(
      alreadyDecidedBy(
        { code: "stale_version", sentVersion: 1 },
        { ...approved, from: "PENDING_PRINCIPAL" },
        { id: "p2", role: "PRINCIPAL" },
      ),
    ).toEqual({ verb: "APPROVE", name: "Aziz Karimov", at });
  });
});
