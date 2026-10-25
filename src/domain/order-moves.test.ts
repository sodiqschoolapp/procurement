import { describe, expect, it } from "vitest";

import {
  ownerMoveAllows,
  behindDraftWall,
  ORDER_ACTIONS,
  ORDER_ACTION_MAX,
  ORDER_MOVES,
  type OrderAction,
  OrderMoveRefused,
  type PlannedMove,
  type OrderState,
  allowedActions,
  assertMove,
  checkMoves,
  isMoveReason,
  moveReason,
} from "./order-moves";
import { type Actor, type ManagerRight, ROLES, type Role } from "./permissions";
import { REQUEST_STATUSES, type RequestStatus } from "./request-status";

// 06-approval-workflow.md (Statuses; Allowed moves; Rules 3, 4, 8); developer-rules.md rule 2;
// 03-roles-and-permissions.md (Rules 1, 6, 8; Manager rights); 08-money-and-settlement.md
// (Closing). The oracle below is the allowed-moves table written out a second time by hand; it
// never reads ORDER_MOVES, so a wrong entry there turns a test red (plan of 2.3, Tests).

const OWN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ME = "33333333-3333-4333-8333-333333333333";
const COLLEAGUE = "44444444-4444-4444-8444-444444444444";
const REASON = "Wrong department";

// ---------------------------------------------------------------------------------------------
// The oracle: one line per row of the table and per "from" status.
//   who: "owner" Owner; "edit" Owner or Head (CREATE_REQUESTS); "close" Owner or Head
//   (CLOSE_ALONE); "settle" Owner or Head (no right); "step1/2/3" the approver of that step;
//   "finance" Finance; "head" Head. `skipped`: the row is only for an order that skipped Finance
//   (true) or only for one that did not (false); 06 Finance step switched off (plan of 4.10c).

type Who = "owner" | "edit" | "close" | "settle" | "step1" | "step2" | "step3" | "finance" | "head";
type Row = {
  from: RequestStatus;
  action: OrderAction;
  to: RequestStatus;
  who: Who;
  skipped?: boolean;
};

const TABLE: readonly Row[] = [
  { from: "DRAFT", action: "SUBMIT", to: "PENDING_HEAD", who: "edit" },
  { from: "PENDING_HEAD", action: "APPROVE", to: "PENDING_PRINCIPAL", who: "step1" },
  { from: "PENDING_PRINCIPAL", action: "APPROVE", to: "PENDING_FINANCE", who: "step2" },
  { from: "PENDING_FINANCE", action: "APPROVE", to: "PURCHASING", who: "step3" },
  { from: "PENDING_HEAD", action: "SEND_BACK", to: "RETURNED", who: "step1" },
  { from: "PENDING_PRINCIPAL", action: "SEND_BACK", to: "RETURNED", who: "step2" },
  { from: "PENDING_FINANCE", action: "SEND_BACK", to: "RETURNED", who: "step3" },
  { from: "PENDING_HEAD", action: "REJECT", to: "REJECTED", who: "step1" },
  { from: "PENDING_PRINCIPAL", action: "REJECT", to: "REJECTED", who: "step2" },
  { from: "PENDING_FINANCE", action: "REJECT", to: "REJECTED", who: "step3" },
  { from: "PENDING_HEAD", action: "TAKE_BACK", to: "DRAFT", who: "owner" },
  { from: "RETURNED", action: "SUBMIT_AGAIN", to: "PENDING_HEAD", who: "edit" },
  { from: "PENDING_HEAD", action: "CANCEL", to: "CANCELLED", who: "edit" },
  { from: "PENDING_PRINCIPAL", action: "CANCEL", to: "CANCELLED", who: "edit" },
  { from: "PENDING_FINANCE", action: "CANCEL", to: "CANCELLED", who: "edit" },
  { from: "RETURNED", action: "CANCEL", to: "CANCELLED", who: "edit" },
  { from: "DRAFT", action: "CANCEL", to: "CANCELLED", who: "edit" },
  { from: "PURCHASING", action: "CLOSE_EXACT", to: "CLOSED", who: "close", skipped: false },
  // Open, skipped Finance | Close | Owner or Head | Closed | buying finished (06 Allowed moves).
  { from: "PURCHASING", action: "CLOSE_SKIPPED", to: "CLOSED", who: "close", skipped: true },
  {
    from: "PURCHASING",
    action: "SEND_TO_SETTLEMENT",
    to: "SETTLEMENT",
    who: "settle",
    skipped: false,
  },
  { from: "SETTLEMENT", action: "SEND_BACK_FOR_CORRECTION", to: "PURCHASING", who: "finance" },
  { from: "SETTLEMENT", action: "CLOSE", to: "CLOSED", who: "finance" },
  { from: "CLOSED", action: "REOPEN", to: "PURCHASING", who: "head" },
];

const WITH_REASON: readonly OrderAction[] = [
  "SEND_BACK",
  "REJECT",
  "CANCEL",
  "SEND_BACK_FOR_CORRECTION",
  "REOPEN",
];

type Case = {
  role: Role;
  place: "own" | "other";
  isOwner: boolean;
  off: ManagerRight | null;
  createdByHead: boolean;
  buyingFinished: boolean;
  exactMatch: boolean;
  ownerClosesAlone: boolean;
  readyToClose: boolean;
  skippedFinance: boolean;
  /** The setting `finance_step` the move reads (06 Finance step switched off). */
  financeStep: boolean;
};

type Expected =
  | {
      ok: true;
      to: RequestStatus;
      revisionUp: boolean;
      headStepAuto: boolean;
      skipsFinance: boolean;
    }
  | { ok: false; reason: "not_found" | "wrong_status" | "forbidden" | "not_ready" };

function mayAct(who: Who, c: Case): boolean {
  const manager = c.role === "MANAGER";
  switch (who) {
    case "owner":
      return c.isOwner && (c.role === "HEAD" || (manager && c.off !== "CREATE_REQUESTS"));
    case "edit":
      return c.role === "HEAD" || (manager && c.isOwner && c.off !== "CREATE_REQUESTS");
    case "close":
      return c.role === "HEAD" || (manager && c.isOwner && c.off !== "CLOSE_ALONE");
    case "settle":
      return c.role === "HEAD" || (manager && c.isOwner);
    case "step1":
    case "head":
      return c.role === "HEAD";
    case "step2":
      return c.role === "PRINCIPAL";
    case "step3":
    case "finance":
      return c.role === "FINANCE";
  }
}

/** What the server must answer for one order; `screen` leaves out Finance's close readiness. */
function expected(status: RequestStatus, action: OrderAction, c: Case, screen = false): Expected {
  if (c.place === "other" && c.role !== "HEAD") return { ok: false, reason: "not_found" };
  if (status === "DRAFT" && c.role !== "HEAD" && !c.isOwner) {
    return { ok: false, reason: "not_found" };
  }
  const row = TABLE.find((each) => each.from === status && each.action === action);
  if (!row) return { ok: false, reason: "wrong_status" };
  // "Open, skipped Finance" is its own "from" (06 Allowed moves).
  if (row.skipped !== undefined && row.skipped !== c.skippedFinance) {
    return { ok: false, reason: "wrong_status" };
  }
  if (!mayAct(row.who, c)) return { ok: false, reason: "forbidden" };
  if (action === "SEND_TO_SETTLEMENT" && !c.buyingFinished) {
    return { ok: false, reason: "not_ready" };
  }
  if (action === "CLOSE_EXACT" && !(c.buyingFinished && c.exactMatch && c.ownerClosesAlone)) {
    return { ok: false, reason: "not_ready" };
  }
  // Whatever the difference, no exact match and no CLOSE_ALONE of the owner asked: the Head
  // closes for a Manager whose right is off (06 Finance step switched off 3).
  if (action === "CLOSE_SKIPPED" && !c.buyingFinished) return { ok: false, reason: "not_ready" };
  if (action === "CLOSE" && !screen && !c.readyToClose) return { ok: false, reason: "not_ready" };
  const headStepAuto = action === "SUBMIT" && c.createdByHead;
  // The Principal's Approve goes to Open when the Finance step is off (06 Allowed moves).
  const skipsFinance = status === "PENDING_PRINCIPAL" && action === "APPROVE" && !c.financeStep;
  return {
    ok: true,
    to: headStepAuto ? "PENDING_PRINCIPAL" : skipsFinance ? "PURCHASING" : row.to,
    revisionUp: action === "SUBMIT_AGAIN",
    headStepAuto,
    skipsFinance,
  };
}

// ---------------------------------------------------------------------------------------------

function actor(role: Role, off: ManagerRight | null = null): Actor {
  return {
    userId: ME,
    role,
    branchIds: role === "HEAD" ? [] : [OWN],
    disabledRights: off ? [off] : [],
  };
}

let serial = 0;
function order(status: RequestStatus, overrides: Partial<OrderState> = {}): OrderState {
  serial += 1;
  return {
    id: `order-${serial}`,
    status,
    branchId: OWN,
    ownerId: ME,
    createdByHead: false,
    // A Draft here was taken back unless a test says otherwise; Submit does not read it.
    numbered: true,
    buyingFinished: true,
    exactMatch: true,
    ownerClosesAlone: true,
    readyToClose: true,
    skippedFinance: false,
    ...overrides,
  };
}

function orderFor(status: RequestStatus, c: Case): OrderState {
  return order(status, {
    branchId: c.place === "own" ? OWN : OTHER,
    ownerId: c.isOwner ? ME : COLLEAGUE,
    createdByHead: c.createdByHead,
    buyingFinished: c.buyingFinished,
    exactMatch: c.exactMatch,
    ownerClosesAlone: c.ownerClosesAlone,
    readyToClose: c.readyToClose,
    skippedFinance: c.skippedFinance,
  });
}

function* cases(): Generator<Case> {
  const flags = [false, true];
  for (const role of ROLES) {
    const rights: (ManagerRight | null)[] =
      role === "MANAGER" ? [null, "CREATE_REQUESTS", "CLOSE_ALONE"] : [null];
    for (const place of ["own", "other"] as const)
      for (const isOwner of flags)
        for (const off of rights)
          for (const createdByHead of flags)
            for (const buyingFinished of flags)
              for (const exactMatch of flags)
                for (const ownerClosesAlone of flags)
                  for (const readyToClose of flags)
                    yield {
                      role,
                      place,
                      isOwner,
                      off,
                      createdByHead,
                      buyingFinished,
                      exactMatch,
                      ownerClosesAlone,
                      readyToClose,
                      skippedFinance: false,
                      financeStep: true,
                    };
  }
}

/**
 * Each status with the case, and with the two facts of 4.10c where they can differ (06 Finance
 * step switched off): the step off at the Principal's step, the only move that reads it; the mark
 * from Open on, the only statuses an order that skipped Finance can stand at (migration 0054
 * refuses it Waiting for Finance or for settlement, and it is written by the move into Open).
 */
function* atStatuses(c: Case): Generator<[RequestStatus, Case]> {
  for (const status of REQUEST_STATUSES) {
    yield [status, c];
    if (status === "PENDING_PRINCIPAL") yield [status, { ...c, financeStep: false }];
    if (status === "PURCHASING" || status === "CLOSED") {
      yield [status, { ...c, skippedFinance: true }];
    }
  }
}

function movesOf(check: ReturnType<typeof checkMoves>): readonly PlannedMove[] {
  if (!check.ok) throw new Error(`expected the move to pass: ${JSON.stringify(check.refusal)}`);
  return check.moves;
}

function asExpected(check: ReturnType<typeof checkMoves>): Expected {
  if (check.ok) {
    const [move] = check.moves;
    if (!move) throw new Error("expected one move");
    return {
      ok: true,
      to: move.to,
      revisionUp: move.revisionUp,
      headStepAuto: move.headStepAuto,
      skipsFinance: move.skipsFinance,
    };
  }
  if (check.refusal.kind !== "orders") throw new Error(`unexpected ${check.refusal.kind}`);
  const [refused] = check.refusal.orders;
  if (!refused) throw new Error("expected one refused order");
  return { ok: false, reason: refused.reason };
}

describe("ORDER_MOVES (06-approval-workflow.md, Allowed moves)", () => {
  it("has exactly the 23 entries of the table, each from a status of request-status.ts", () => {
    const pairs = (rows: readonly { from: string; action: string; to: string }[]) =>
      rows.map((row) => `${row.from} ${row.action} ${row.to}`).toSorted();
    expect(pairs(ORDER_MOVES)).toEqual(pairs(TABLE));
    for (const move of ORDER_MOVES) {
      expect(REQUEST_STATUSES).toContain(move.from);
      expect(REQUEST_STATUSES).toContain(move.to);
      expect(ORDER_ACTIONS).toContain(move.action);
    }
  });

  it("lists the thirteen actions of the table, in its order (decisions 9 and 12; 06 Finance step switched off)", () => {
    expect(ORDER_ACTIONS).toEqual([
      "SUBMIT",
      "APPROVE",
      "SEND_BACK",
      "REJECT",
      "TAKE_BACK",
      "SUBMIT_AGAIN",
      "CANCEL",
      "CLOSE_EXACT",
      "CLOSE_SKIPPED",
      "SEND_TO_SETTLEMENT",
      "SEND_BACK_FOR_CORRECTION",
      "CLOSE",
      "REOPEN",
    ]);
  });
});

describe("every row of the table passes (06, Allowed moves)", () => {
  const ROLE_OF: Record<Who, Role> = {
    owner: "MANAGER",
    edit: "MANAGER",
    close: "MANAGER",
    settle: "MANAGER",
    step1: "HEAD",
    step2: "PRINCIPAL",
    step3: "FINANCE",
    finance: "FINANCE",
    head: "HEAD",
  };
  it.each(TABLE)("$from × $action → $to", (row) => {
    const role = ROLE_OF[row.who];
    const one = order(row.from, { skippedFinance: row.skipped === true });
    const check = checkMoves(actor(role), [one], row.action, { reason: REASON });
    expect(check.ok).toBe(true);
    expect(movesOf(check)[0]).toMatchObject({ from: row.from, to: row.to });
    expect(allowedActions(actor(role), [one])).toContain(row.action);
  });
});

describe("every other combination is refused, generated (06: any move not in the table is impossible)", () => {
  it("checkMoves() and allowedActions() answer as the oracle for every status × action × role × relation × facts", () => {
    let checked = 0;
    for (const base of cases()) {
      const who = actor(base.role, base.off);
      for (const [status, c] of atStatuses(base)) {
        const offered = allowedActions(who, [orderFor(status, c)]);
        for (const action of ORDER_ACTIONS) {
          const label = `${status} ${action} ${JSON.stringify(c)}`;
          const answer = asExpected(
            checkMoves(who, [orderFor(status, c)], action, {
              reason: REASON,
              financeStep: c.financeStep,
            }),
          );
          expect(answer, label).toEqual(expected(status, action, c));
          expect(offered.includes(action), label).toBe(expected(status, action, c, true).ok);
          checked += 1;
        }
      }
    }
    // Ten statuses and three variants of 4.10c, thirteen actions, 768 cases.
    expect(checked).toBe(13 * 13 * 6 * 2 ** 7);
  });

  it("reaches exactly the (from, to, role) triples of the table", () => {
    const reached = new Set<string>();
    for (const base of cases()) {
      for (const [status, c] of atStatuses(base)) {
        for (const action of ORDER_ACTIONS) {
          const check = checkMoves(actor(c.role, c.off), [orderFor(status, c)], action, {
            reason: REASON,
            financeStep: c.financeStep,
          });
          for (const move of check.ok ? check.moves : [])
            reached.add(`${status} ${move.to} ${c.role}`);
        }
      }
    }
    // Written out by hand from the table: the roles of each row; the Head's own Submit goes to
    // the Principal (03 rule 6).
    expect([...reached].toSorted()).toEqual(
      [
        "DRAFT PENDING_HEAD HEAD",
        "DRAFT PENDING_HEAD MANAGER",
        "DRAFT PENDING_PRINCIPAL HEAD",
        "DRAFT PENDING_PRINCIPAL MANAGER",
        "PENDING_HEAD PENDING_PRINCIPAL HEAD",
        "PENDING_PRINCIPAL PENDING_FINANCE PRINCIPAL",
        // The Finance step switched off (06 Allowed moves, Principal's Approve).
        "PENDING_PRINCIPAL PURCHASING PRINCIPAL",
        "PENDING_FINANCE PURCHASING FINANCE",
        "PENDING_HEAD RETURNED HEAD",
        "PENDING_PRINCIPAL RETURNED PRINCIPAL",
        "PENDING_FINANCE RETURNED FINANCE",
        "PENDING_HEAD REJECTED HEAD",
        "PENDING_PRINCIPAL REJECTED PRINCIPAL",
        "PENDING_FINANCE REJECTED FINANCE",
        "PENDING_HEAD DRAFT HEAD",
        "PENDING_HEAD DRAFT MANAGER",
        "RETURNED PENDING_HEAD HEAD",
        "RETURNED PENDING_HEAD MANAGER",
        "PENDING_HEAD CANCELLED HEAD",
        "PENDING_HEAD CANCELLED MANAGER",
        "PENDING_PRINCIPAL CANCELLED HEAD",
        "PENDING_PRINCIPAL CANCELLED MANAGER",
        "PENDING_FINANCE CANCELLED HEAD",
        "PENDING_FINANCE CANCELLED MANAGER",
        "RETURNED CANCELLED HEAD",
        "RETURNED CANCELLED MANAGER",
        "DRAFT CANCELLED HEAD",
        "DRAFT CANCELLED MANAGER",
        "PURCHASING CLOSED HEAD",
        "PURCHASING CLOSED MANAGER",
        "PURCHASING SETTLEMENT HEAD",
        "PURCHASING SETTLEMENT MANAGER",
        "SETTLEMENT PURCHASING FINANCE",
        "SETTLEMENT CLOSED FINANCE",
        "CLOSED PURCHASING HEAD",
      ].toSorted(),
    );
  });
});

describe("Submit (06 Allowed moves; 03 rule 6; 05 Order number 4)", () => {
  it("sends an order the Head created to the Principal, logged as the Head step done", () => {
    const check = checkMoves(actor("HEAD"), [order("DRAFT", { createdByHead: true })], "SUBMIT");
    expect(check).toEqual({
      ok: true,
      moves: [
        expect.objectContaining({ to: "PENDING_PRINCIPAL", headStepAuto: true, revisionUp: false }),
      ],
    });
  });

  it("sends a Manager's draft to the Head, also when the Head submits it", () => {
    const draft = order("DRAFT", { ownerId: COLLEAGUE });
    const check = checkMoves(actor("HEAD"), [draft], "SUBMIT");
    expect(movesOf(check)[0]).toMatchObject({ to: "PENDING_HEAD", headStepAuto: false });
  });

  it("keeps the revision when a taken-back draft is submitted (decision 1)", () => {
    const check = checkMoves(actor("MANAGER"), [order("DRAFT")], "SUBMIT");
    expect(movesOf(check)[0]).toMatchObject({ revisionUp: false });
  });

  it("Submit again goes to the Head and raises the revision, for an order the Head created too (rule 4; decision 3)", () => {
    for (const createdByHead of [false, true]) {
      const check = checkMoves(
        actor("HEAD"),
        [order("RETURNED", { createdByHead })],
        "SUBMIT_AGAIN",
      );
      expect(movesOf(check)[0]).toMatchObject({
        to: "PENDING_HEAD",
        revisionUp: true,
        headStepAuto: false,
      });
    }
  });
});

describe("Owner only: Take back (06 Allowed moves; decision 5)", () => {
  // Submit again was the owner's only too until the spec change of 20.10.2026 (D55, item 12):
  // "Sent back for editing | Submit again | Owner or Head" (plan of 2.3b, decided items 2 and 3).
  it("refuses the Head's Take back on an order owned by another user, and lets the owner act", () => {
    const pending = order("PENDING_HEAD", { ownerId: COLLEAGUE });
    expect(checkMoves(actor("HEAD"), [pending], "TAKE_BACK")).toEqual({
      ok: false,
      refusal: { kind: "orders", orders: [{ orderId: pending.id, reason: "forbidden" }] },
    });
    expect(checkMoves(actor("MANAGER"), [order("PENDING_HEAD")], "TAKE_BACK").ok).toBe(true);
  });

  it("lets the Head submit again a Manager's sent-back order: to the Head, revision up, no shortcut (06 Submit again row; rule 4; D55 item 12)", () => {
    for (const createdByHead of [false, true]) {
      const returned = order("RETURNED", { ownerId: COLLEAGUE, createdByHead });
      expect(movesOf(checkMoves(actor("HEAD"), [returned], "SUBMIT_AGAIN"))).toEqual([
        {
          orderId: returned.id,
          from: "RETURNED",
          to: "PENDING_HEAD",
          revisionUp: true,
          headStepAuto: false,
          skipsFinance: false,
        },
      ]);
    }
    // Another Manager of the branch still may not (D40: the same order, only the actor differs).
    const returned = order("RETURNED", { ownerId: COLLEAGUE });
    expect(
      asExpected(checkMoves({ ...actor("MANAGER"), userId: "x" }, [returned], "SUBMIT_AGAIN")),
    ).toEqual({ ok: false, reason: "forbidden" });
  });

  it("takes back only before the Head decides", () => {
    for (const status of ["PENDING_PRINCIPAL", "PENDING_FINANCE"] as const) {
      expect(asExpected(checkMoves(actor("MANAGER"), [order(status)], "TAKE_BACK"))).toEqual({
        ok: false,
        reason: "wrong_status",
      });
    }
  });

  it("refuses a Manager whose CREATE_REQUESTS is off (03 Manager rights)", () => {
    const manager = actor("MANAGER", "CREATE_REQUESTS");
    for (const [status, action] of [
      ["DRAFT", "SUBMIT"],
      ["PENDING_HEAD", "TAKE_BACK"],
      ["RETURNED", "SUBMIT_AGAIN"],
      ["RETURNED", "CANCEL"],
    ] as const) {
      expect(checkMoves(manager, [order(status)], action, { reason: REASON }).ok, action).toBe(
        false,
      );
    }
  });
});

describe("The approver of each step, in their branch (03 Permission matrix; rule 1)", () => {
  it("refuses another role at each step, and another branch's Principal as not found", () => {
    const pending = order("PENDING_PRINCIPAL");
    expect(allowedActions(actor("PRINCIPAL"), [pending])).toEqual([
      "APPROVE",
      "SEND_BACK",
      "REJECT",
    ]);
    expect(allowedActions(actor("HEAD"), [pending])).toEqual(["CANCEL"]);
    expect(allowedActions(actor("FINANCE"), [pending])).toEqual([]);
    const elsewhere = order("PENDING_PRINCIPAL", { branchId: OTHER });
    expect(asExpected(checkMoves(actor("PRINCIPAL"), [elsewhere], "APPROVE"))).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("hides another user's draft from everyone but its owner and the Head (06 Statuses)", () => {
    const draft = order("DRAFT", { ownerId: COLLEAGUE });
    for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      expect(asExpected(checkMoves(actor(role), [draft], "SUBMIT")), role).toEqual({
        ok: false,
        reason: "not_found",
      });
    }
    expect(allowedActions(actor("HEAD"), [draft])).toEqual(["SUBMIT", "CANCEL"]);
  });
});

describe("Reasons (06 rule 3; decision 13)", () => {
  it("need 5 to 500 code points once trimmed", () => {
    expect(isMoveReason("  abcd  ")).toBe(false);
    expect(isMoveReason("  abcde  ")).toBe(true);
    expect(isMoveReason("😀😀😀😀😀")).toBe(true);
    expect(isMoveReason("a".repeat(500))).toBe(true);
    expect(isMoveReason("a".repeat(501))).toBe(false);
    expect(isMoveReason(undefined)).toBe(false);
    expect(moveReason("  Late  ")).toBe("Late");
  });

  it.each(WITH_REASON)("%s refuses a short reason and accepts five code points", (action) => {
    const row = TABLE.find((each) => each.action === action);
    if (!row) throw new Error(action);
    const role: Role =
      row.who === "step3" || row.who === "finance"
        ? "FINANCE"
        : row.who === "edit"
          ? "MANAGER"
          : "HEAD";
    const target = [order(row.from)];
    expect(checkMoves(actor(role), target, action, { reason: "Late" })).toEqual({
      ok: false,
      refusal: { kind: "reason" },
    });
    expect(checkMoves(actor(role), target, action)).toEqual({
      ok: false,
      refusal: { kind: "reason" },
    });
    expect(checkMoves(actor(role), target, action, { reason: " Late. " }).ok).toBe(true);
  });

  it("is not asked of the other actions", () => {
    expect(checkMoves(actor("HEAD"), [order("PENDING_HEAD")], "APPROVE").ok).toBe(true);
  });
});

describe("Closing (08 Closing 1 and 3; 03 Manager rights; decisions 4, 6, 8)", () => {
  it("closes an exact match only when buying is finished and the owner closes alone", () => {
    const manager = actor("MANAGER");
    expect(checkMoves(manager, [order("PURCHASING")], "CLOSE_EXACT").ok).toBe(true);
    for (const facts of [
      { buyingFinished: false },
      { exactMatch: false },
      { ownerClosesAlone: false },
    ]) {
      expect(asExpected(checkMoves(manager, [order("PURCHASING", facts)], "CLOSE_EXACT"))).toEqual({
        ok: false,
        reason: "not_ready",
      });
    }
    expect(
      asExpected(checkMoves(actor("MANAGER", "CLOSE_ALONE"), [order("PURCHASING")], "CLOSE_EXACT")),
    ).toEqual({ ok: false, reason: "forbidden" });
  });

  it("refuses the Head the close of an order whose owner may not close alone; settlement stays open", () => {
    const blocked = order("PURCHASING", { ownerId: COLLEAGUE, ownerClosesAlone: false });
    expect(allowedActions(actor("HEAD"), [blocked])).toEqual(["SEND_TO_SETTLEMENT"]);
  });

  it("lets a Manager with CLOSE_ALONE or CREATE_REQUESTS off still send own finished orders to settlement", () => {
    for (const off of ["CLOSE_ALONE", "CREATE_REQUESTS"] as const) {
      const open = order("PURCHASING", { ownerClosesAlone: off !== "CLOSE_ALONE" });
      expect(checkMoves(actor("MANAGER", off), [open], "SEND_TO_SETTLEMENT").ok, off).toBe(true);
    }
    const unfinished = order("PURCHASING", { buyingFinished: false });
    expect(asExpected(checkMoves(actor("MANAGER"), [unfinished], "SEND_TO_SETTLEMENT"))).toEqual({
      ok: false,
      reason: "not_ready",
    });
  });

  it("offers Finance's Close in settlement and refuses it naming the orders not ready", () => {
    const ready = order("SETTLEMENT");
    const notReady = order("SETTLEMENT", { readyToClose: false });
    expect(allowedActions(actor("FINANCE"), [ready, notReady])).toEqual([
      "SEND_BACK_FOR_CORRECTION",
      "CLOSE",
    ]);
    expect(checkMoves(actor("FINANCE"), [ready, notReady], "CLOSE")).toEqual({
      ok: false,
      refusal: { kind: "orders", orders: [{ orderId: notReady.id, reason: "not_ready" }] },
    });
  });
});

describe("Cancel of a Draft with a number (06 Allowed moves, Cancel row; D55 item 9)", () => {
  it("the owner or the Head cancels a taken-back Draft, with a reason", () => {
    for (const who of [actor("MANAGER"), actor("HEAD")]) {
      const draft = order("DRAFT");
      expect(movesOf(checkMoves(who, [draft], "CANCEL", { reason: REASON }))).toEqual([
        {
          orderId: draft.id,
          from: "DRAFT",
          to: "CANCELLED",
          revisionUp: false,
          headStepAuto: false,
          skipsFinance: false,
        },
      ]);
    }
    expect(checkMoves(actor("MANAGER"), [order("DRAFT")], "CANCEL", { reason: "no" })).toEqual({
      ok: false,
      refusal: { kind: "reason" },
    });
  });

  it("a Draft without a number has no Cancel: it is deleted (plan of 2.3b, decided item 1)", () => {
    const draft = order("DRAFT", { numbered: false });
    for (const who of [actor("MANAGER"), actor("HEAD")]) {
      expect(asExpected(checkMoves(who, [draft], "CANCEL", { reason: REASON }))).toEqual({
        ok: false,
        reason: "wrong_status",
      });
      expect(allowedActions(who, [draft])).toEqual(["SUBMIT"]);
    }
  });

  it("offers Submit and Cancel on a taken-back Draft; another Manager sees nothing (draft wall)", () => {
    expect(allowedActions(actor("MANAGER"), [order("DRAFT")])).toEqual(["SUBMIT", "CANCEL"]);
    expect(allowedActions(actor("HEAD"), [order("DRAFT", { ownerId: COLLEAGUE })])).toEqual([
      "SUBMIT",
      "CANCEL",
    ]);
    expect(allowedActions(actor("MANAGER"), [order("DRAFT", { ownerId: COLLEAGUE })])).toEqual([]);
  });
});

describe("Ticked orders (06 rule 8; 03 rule 8)", () => {
  it("offers only the actions common to orders in two different statuses", () => {
    const manager = actor("MANAGER");
    expect(allowedActions(manager, [order("PENDING_HEAD")])).toEqual(["TAKE_BACK", "CANCEL"]);
    expect(allowedActions(manager, [order("RETURNED")])).toEqual(["SUBMIT_AGAIN", "CANCEL"]);
    expect(allowedActions(manager, [order("PENDING_HEAD"), order("RETURNED")])).toEqual(["CANCEL"]);
    expect(allowedActions(actor("HEAD"), [order("PENDING_HEAD"), order("CLOSED")])).toEqual([]);
  });

  it("moves each order by its own row when the action is common", () => {
    const check = checkMoves(
      actor("MANAGER"),
      [order("PENDING_HEAD"), order("RETURNED")],
      "CANCEL",
      { reason: REASON },
    );
    expect(movesOf(check).map((move) => [move.from, move.to])).toEqual([
      ["PENDING_HEAD", "CANCELLED"],
      ["RETURNED", "CANCELLED"],
    ]);
  });

  it("refuses the whole action and names exactly the orders that fail", () => {
    const fine = order("PENDING_HEAD");
    const elsewhere = order("PENDING_HEAD", { branchId: OTHER });
    const moved = order("PENDING_PRINCIPAL");
    const colleagues = order("PENDING_HEAD", { ownerId: COLLEAGUE });
    expect(checkMoves(actor("MANAGER"), [fine, elsewhere, moved, colleagues], "TAKE_BACK")).toEqual(
      {
        ok: false,
        refusal: {
          kind: "orders",
          orders: [
            { orderId: elsewhere.id, reason: "not_found" },
            { orderId: moved.id, reason: "wrong_status" },
            { orderId: colleagues.id, reason: "forbidden" },
          ],
        },
      },
    );
    expect(allowedActions(actor("MANAGER"), [fine, elsewhere])).toEqual([]);
  });

  it("takes 200 orders, refuses 201, none and the same order twice", () => {
    const many = Array.from({ length: ORDER_ACTION_MAX + 1 }, () => order("PENDING_HEAD"));
    const head = actor("HEAD");
    expect(checkMoves(head, many.slice(0, 200), "APPROVE").ok).toBe(true);
    expect(allowedActions(head, many.slice(0, 200))).toContain("APPROVE");
    expect(checkMoves(head, many, "APPROVE")).toEqual({ ok: false, refusal: { kind: "too_many" } });
    expect(allowedActions(head, many)).toEqual([]);
    expect(checkMoves(head, [], "APPROVE")).toEqual({ ok: false, refusal: { kind: "none" } });
    expect(allowedActions(head, [])).toEqual([]);
    const twice = order("PENDING_HEAD");
    expect(checkMoves(head, [twice, twice], "APPROVE")).toEqual({
      ok: false,
      refusal: { kind: "duplicate" },
    });
  });
});

describe("assertMove() for the server (developer-rules.md rule 2)", () => {
  it("returns the moves of checkMoves()", () => {
    const pending = order("PENDING_FINANCE");
    expect(assertMove(actor("FINANCE"), [pending], "APPROVE")).toEqual([
      {
        orderId: pending.id,
        from: "PENDING_FINANCE",
        to: "PURCHASING",
        revisionUp: false,
        headStepAuto: false,
        skipsFinance: false,
      },
    ]);
  });

  it("throws OrderMoveRefused carrying the refusal of checkMoves()", () => {
    const pending = order("PENDING_FINANCE");
    const refusal = checkMoves(actor("PRINCIPAL"), [pending], "APPROVE");
    expect(refusal.ok).toBe(false);
    let thrown: unknown;
    try {
      assertMove(actor("PRINCIPAL"), [pending], "APPROVE");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OrderMoveRefused);
    expect(!refusal.ok && (thrown as OrderMoveRefused).refusal).toEqual(
      !refusal.ok && refusal.refusal,
    );
  });
});

describe("behindDraftWall(): a draft is visible to its owner and the Head only (06 Statuses)", () => {
  const actor = (role: Role, userId = "u-1"): Actor => ({
    userId,
    role,
    branchIds: role === "HEAD" ? [] : ["b-1"],
    disabledRights: [],
  });

  it("hides another user's draft from every role but the Head; never a submitted order", () => {
    const draft = { status: "DRAFT" as const, ownerId: "u-2" };
    for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      expect(behindDraftWall(actor(role), draft), role).toBe(true);
    }
    expect(behindDraftWall(actor("HEAD"), draft)).toBe(false);
    expect(behindDraftWall(actor("MANAGER", "u-2"), draft)).toBe(false);
    expect(behindDraftWall(actor("MANAGER"), { status: "PENDING_HEAD", ownerId: "u-2" })).toBe(
      false,
    );
  });
});

describe("ownerMoveAllows (03-roles-and-permissions.md rule 7; plan of 4.10, decided item 1)", () => {
  const movable: RequestStatus[] = [
    "PENDING_HEAD",
    "PENDING_PRINCIPAL",
    "PENDING_FINANCE",
    "RETURNED",
    "PURCHASING",
    "SETTLEMENT",
  ];

  it.each(REQUEST_STATUSES.map((status) => [status, movable.includes(status)] as const))(
    "%s: %s",
    (status, allowed) => {
      expect(ownerMoveAllows(status)).toBe(allowed);
    },
  );
});

describe("The Finance step switched off (06-approval-workflow.md, Finance step switched off; Allowed moves; plan of 4.10c)", () => {
  it("rule 1: the Principal's Approve opens the order and marks it when the step is off; with it on it waits for Finance", () => {
    const waiting = order("PENDING_PRINCIPAL");
    const off = movesOf(
      checkMoves(actor("PRINCIPAL"), [waiting], "APPROVE", { financeStep: false }),
    );
    expect(off[0]).toMatchObject({
      from: "PENDING_PRINCIPAL",
      to: "PURCHASING",
      skipsFinance: true,
    });
    const on = movesOf(checkMoves(actor("PRINCIPAL"), [waiting], "APPROVE", { financeStep: true }));
    expect(on[0]).toMatchObject({ to: "PENDING_FINANCE", skipsFinance: false });
    // The step is on unless the caller read it off (14 Notes for the build: true by default).
    expect(movesOf(checkMoves(actor("PRINCIPAL"), [waiting], "APPROVE"))[0]?.to).toBe(
      "PENDING_FINANCE",
    );
  });

  it("the Head's and Finance's approvals do not read the step: Head, then Principal, are never skipped (D62)", () => {
    const head = movesOf(
      checkMoves(actor("HEAD"), [order("PENDING_HEAD")], "APPROVE", { financeStep: false }),
    );
    expect(head[0]).toMatchObject({ to: "PENDING_PRINCIPAL", skipsFinance: false });
    const finance = movesOf(
      checkMoves(actor("FINANCE"), [order("PENDING_FINANCE")], "APPROVE", { financeStep: false }),
    );
    expect(finance[0]).toMatchObject({ to: "PURCHASING", skipsFinance: false });
    // A Head-created order still waits for the Principal at its first Submit (03 rule 6).
    const submitted = movesOf(
      checkMoves(
        actor("HEAD"),
        [order("DRAFT", { createdByHead: true, numbered: false })],
        "SUBMIT",
        {
          financeStep: false,
        },
      ),
    );
    expect(submitted[0]?.to).toBe("PENDING_PRINCIPAL");
  });

  it("rule 3: the owner closes a finished skipped order whatever the difference; an unfinished one is not ready", () => {
    const finished = order("PURCHASING", { skippedFinance: true, exactMatch: false });
    expect(allowedActions(actor("MANAGER"), [finished])).toEqual(["CLOSE_SKIPPED"]);
    expect(movesOf(checkMoves(actor("MANAGER"), [finished], "CLOSE_SKIPPED"))[0]?.to).toBe(
      "CLOSED",
    );
    const buying = order("PURCHASING", { skippedFinance: true, buyingFinished: false });
    expect(checkMoves(actor("MANAGER"), [buying], "CLOSE_SKIPPED")).toEqual({
      ok: false,
      refusal: { kind: "orders", orders: [{ orderId: buying.id, reason: "not_ready" }] },
    });
  });

  it("rule 3 and 03 CLOSE_ALONE: with the owner's right off the Manager is refused and the Head closes", () => {
    const blocked = order("PURCHASING", {
      skippedFinance: true,
      exactMatch: false,
      ownerClosesAlone: false,
    });
    expect(checkMoves(actor("MANAGER", "CLOSE_ALONE"), [blocked], "CLOSE_SKIPPED")).toEqual({
      ok: false,
      refusal: { kind: "orders", orders: [{ orderId: blocked.id, reason: "forbidden" }] },
    });
    const colleagues = { ...blocked, ownerId: COLLEAGUE };
    expect(movesOf(checkMoves(actor("HEAD"), [colleagues], "CLOSE_SKIPPED"))[0]?.to).toBe("CLOSED");
    for (const role of ["PRINCIPAL", "FINANCE"] as const) {
      expect(allowedActions(actor(role), [blocked])).not.toContain("CLOSE_SKIPPED");
    }
  });

  it("rule 2: Send to settlement and Close (exact match) are refused on a skipped order; Close is refused on one that did not skip", () => {
    const skipped = order("PURCHASING", { skippedFinance: true });
    for (const action of ["SEND_TO_SETTLEMENT", "CLOSE_EXACT"] as const) {
      expect(checkMoves(actor("HEAD"), [skipped], action)).toEqual({
        ok: false,
        refusal: { kind: "orders", orders: [{ orderId: skipped.id, reason: "wrong_status" }] },
      });
    }
    const ordinary = order("PURCHASING");
    expect(checkMoves(actor("HEAD"), [ordinary], "CLOSE_SKIPPED")).toEqual({
      ok: false,
      refusal: { kind: "orders", orders: [{ orderId: ordinary.id, reason: "wrong_status" }] },
    });
    // Ticked together, neither close is common to both (06 rule 8).
    expect(allowedActions(actor("HEAD"), [skipped, ordinary])).toEqual([]);
  });

  it("rule 6: a reopened skipped order keeps the rules: the Head reopens it, and it closes again without settlement", () => {
    const closed = order("CLOSED", { skippedFinance: true });
    expect(movesOf(checkMoves(actor("HEAD"), [closed], "REOPEN", { reason: REASON }))[0]?.to).toBe(
      "PURCHASING",
    );
    const reopened = order("PURCHASING", { skippedFinance: true });
    expect(allowedActions(actor("MANAGER"), [reopened])).toEqual(["CLOSE_SKIPPED"]);
  });
});
