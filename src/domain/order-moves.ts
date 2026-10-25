// The one state machine of an order (developer-rules.md rule 2; 06-approval-workflow.md, Allowed
// moves). Every status move of one order is a row of ORDER_MOVES, with who may make it and what
// it needs; a move that is not a row does not exist. The screen asks allowedActions() which
// buttons to show; the server asks checkMoves() or assertMove() again before it writes (plan of
// 2.3). Pure: the caller reads every fact of OrderState from the database, and the version check
// is the action wrapper's (2.4).

import { type Actor, type Permission, decide, seesBranch } from "./permissions";
import type { RequestStatus } from "./request-status";

/**
 * The actions of the allowed-moves table, in its order (plan of 2.3, decisions 9 and 12). The
 * `order_actions.type` and `order_events.type` enums of 2.4 take these codes for the moves.
 */
export const ORDER_ACTIONS = [
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
] as const;
export type OrderAction = (typeof ORDER_ACTIONS)[number];

/**
 * Every write an order's history names: the moves above, then the writes on an Open order that
 * move no status (plan of 3.3, Database changes). The `order_actions.type` and `order_events.type`
 * enums read this list; `ORDER_MOVES` never names the writes. The buying actions of 3.5 are
 * BUYING_ACTIONS of ./purchases.ts; 3.7 adds its own here, 4.3 the money actions of the Money
 * tab, and 4.5 the settlement action and the confirmations of the settlement screen.
 */
export const ORDER_EVENT_TYPES = [
  ...ORDER_ACTIONS,
  "RECORD_PURCHASE",
  "FINISH_ORDER",
  "MARK_NOT_BOUGHT",
  "REOPEN_BUYING",
  "CANCEL_PURCHASE",
  "RECORD_MONEY",
  "CANCEL_MONEY",
  "SETTLE_CASH",
  "CONFIRM_SETTLEMENT",
  "ACKNOWLEDGE_OVERSPEND",
  "MOVE_OWNER",
] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

/**
 * Who acts, in the table's words. Only `owner` adds a check of its own (the actor is the order's
 * owner, the Head included only when he is the owner; plan of 2.3, decision 5); the others are
 * the permission's grant.
 */
export type MoveWho = "owner" | "owner_or_head" | "step_approver" | "finance" | "head";

/**
 * What a move needs (06 Allowed moves, "Needs"). `reason`, `buying_finished`, `exact_match` and
 * `ready_to_close` are checked here; `submit_checks` are the checks of 05 (2.5, 2.7) and
 * `cash_optional` is the cash of the Finance approval (2.10), both the caller's.
 */
export type MoveNeed =
  | "reason"
  | "submit_checks"
  | "buying_finished"
  | "exact_match"
  | "ready_to_close"
  | "cash_optional"
  /** A Draft has a number: it was submitted and taken back (06 Allowed moves, Cancel row). */
  | "numbered"
  /** "Open, skipped Finance" (06 Allowed moves; Finance step switched off 3). */
  | "skipped_finance"
  /** "the order did not skip Finance" (06 Allowed moves, Send to settlement row). */
  | "not_skipped";

export type OrderMove = {
  from: RequestStatus;
  action: OrderAction;
  to: RequestStatus;
  /** Submit of an order the Head created: the Head step is approved automatically (03 rule 6). */
  toWhenHeadCreated?: RequestStatus;
  /** The Principal's Approve while the Finance step is off: straight to Open (06 Allowed moves). */
  toWhenFinanceOff?: RequestStatus;
  who: MoveWho;
  permission: Permission;
  needs: readonly MoveNeed[];
  /** Submit again: the revision goes up by 1 (05 Order number 4). */
  revisionUp?: true;
};

const REASON = ["reason"] as const;

/** The allowed-moves table of 06, one entry per row and per "from" status: 23 entries. */
export const ORDER_MOVES: readonly OrderMove[] = [
  // Draft | Submit | Owner or Head | Waiting for Head (Waiting for Principal when the Head is the
  // creator) | The order passes all checks
  {
    from: "DRAFT",
    action: "SUBMIT",
    to: "PENDING_HEAD",
    toWhenHeadCreated: "PENDING_PRINCIPAL",
    who: "owner_or_head",
    permission: "request.edit",
    needs: ["submit_checks"],
  },
  // Waiting for Head / Principal / Finance | Approve | the approver of that step
  {
    from: "PENDING_HEAD",
    action: "APPROVE",
    to: "PENDING_PRINCIPAL",
    who: "step_approver",
    permission: "request.approve_step1",
    needs: [],
  },
  // (Open when the Finance step is off: 06 Finance step switched off 1; plan of 4.10c.)
  {
    from: "PENDING_PRINCIPAL",
    action: "APPROVE",
    to: "PENDING_FINANCE",
    toWhenFinanceOff: "PURCHASING",
    who: "step_approver",
    permission: "request.approve_step2",
    needs: [],
  },
  {
    from: "PENDING_FINANCE",
    action: "APPROVE",
    to: "PURCHASING",
    who: "step_approver",
    permission: "request.approve_step3",
    needs: ["cash_optional"],
  },
  // Any "Waiting for" step | Send back | The approver of that step | Sent back for editing | Reason
  {
    from: "PENDING_HEAD",
    action: "SEND_BACK",
    to: "RETURNED",
    who: "step_approver",
    permission: "request.approve_step1",
    needs: REASON,
  },
  {
    from: "PENDING_PRINCIPAL",
    action: "SEND_BACK",
    to: "RETURNED",
    who: "step_approver",
    permission: "request.approve_step2",
    needs: REASON,
  },
  {
    from: "PENDING_FINANCE",
    action: "SEND_BACK",
    to: "RETURNED",
    who: "step_approver",
    permission: "request.approve_step3",
    needs: REASON,
  },
  // Any "Waiting for" step | Reject | The approver of that step | Rejected | Reason
  {
    from: "PENDING_HEAD",
    action: "REJECT",
    to: "REJECTED",
    who: "step_approver",
    permission: "request.approve_step1",
    needs: REASON,
  },
  {
    from: "PENDING_PRINCIPAL",
    action: "REJECT",
    to: "REJECTED",
    who: "step_approver",
    permission: "request.approve_step2",
    needs: REASON,
  },
  {
    from: "PENDING_FINANCE",
    action: "REJECT",
    to: "REJECTED",
    who: "step_approver",
    permission: "request.approve_step3",
    needs: REASON,
  },
  // Waiting for Head | Take back | Owner | Draft | Only before the Head decides; the number is kept
  {
    from: "PENDING_HEAD",
    action: "TAKE_BACK",
    to: "DRAFT",
    who: "owner",
    permission: "request.edit",
    needs: [],
  },
  // Sent back for editing | Submit again | Owner or Head | Waiting for Head | Revision number goes
  // up by 1 (for an order the Head created too: plan of 2.3, decision 3, Look first; never the
  // shortcut of a first Submit: plan of 2.3b, decided item 2, Look first)
  {
    from: "RETURNED",
    action: "SUBMIT_AGAIN",
    to: "PENDING_HEAD",
    who: "owner_or_head",
    permission: "request.edit",
    needs: ["submit_checks"],
    revisionUp: true,
  },
  // Any "Waiting for" step, Sent back, Draft with a number (taken back) | Cancel | Owner or Head |
  // Cancelled | Reason. A Draft without a number is deleted, never cancelled (plan of 2.3b, decided
  // item 1, Look first).
  {
    from: "DRAFT",
    action: "CANCEL",
    to: "CANCELLED",
    who: "owner_or_head",
    permission: "request.edit",
    needs: ["reason", "numbered"],
  },
  {
    from: "PENDING_HEAD",
    action: "CANCEL",
    to: "CANCELLED",
    who: "owner_or_head",
    permission: "request.edit",
    needs: REASON,
  },
  {
    from: "PENDING_PRINCIPAL",
    action: "CANCEL",
    to: "CANCELLED",
    who: "owner_or_head",
    permission: "request.edit",
    needs: REASON,
  },
  {
    from: "PENDING_FINANCE",
    action: "CANCEL",
    to: "CANCELLED",
    who: "owner_or_head",
    permission: "request.edit",
    needs: REASON,
  },
  {
    from: "RETURNED",
    action: "CANCEL",
    to: "CANCELLED",
    who: "owner_or_head",
    permission: "request.edit",
    needs: REASON,
  },
  // Open | Close (exact match) | Owner or Head | Closed | Section 8 rules
  {
    from: "PURCHASING",
    action: "CLOSE_EXACT",
    to: "CLOSED",
    who: "owner_or_head",
    permission: "request.close_exact",
    needs: ["not_skipped", "buying_finished", "exact_match"],
  },
  // Open, skipped Finance | Close | Owner or Head | Closed | The order's buying is finished. Its
  // own action, so the one Close of such an order closes it whatever the difference (plan of
  // 4.10c, decided item 3, Look first); `request.close_skipped` lets the Head close the orders of
  // a Manager whose CLOSE_ALONE is off (06 Finance step switched off 3).
  {
    from: "PURCHASING",
    action: "CLOSE_SKIPPED",
    to: "CLOSED",
    who: "owner_or_head",
    permission: "request.close_skipped",
    needs: ["skipped_finance", "buying_finished"],
  },
  // Open | Send to settlement | Owner or Head | Waiting for settlement | Buying is finished; the
  // order did not skip Finance
  {
    from: "PURCHASING",
    action: "SEND_TO_SETTLEMENT",
    to: "SETTLEMENT",
    who: "owner_or_head",
    permission: "request.send_to_settlement",
    needs: ["not_skipped", "buying_finished"],
  },
  // Waiting for settlement | Send back for correction | Finance | Open | Reason
  {
    from: "SETTLEMENT",
    action: "SEND_BACK_FOR_CORRECTION",
    to: "PURCHASING",
    who: "finance",
    permission: "request.settle",
    needs: REASON,
  },
  // Waiting for settlement | Close | Finance | Closed | Section 8 rules
  {
    from: "SETTLEMENT",
    action: "CLOSE",
    to: "CLOSED",
    who: "finance",
    permission: "request.settle",
    needs: ["ready_to_close"],
  },
  // Closed | Reopen | Head | Open | Reason
  {
    from: "CLOSED",
    action: "REOPEN",
    to: "PURCHASING",
    who: "head",
    permission: "request.reopen",
    needs: REASON,
  },
];

/**
 * The statuses an order can be moved to another Manager in (03-roles-and-permissions.md rule 7;
 * plan of 4.10, decided item 1, Look first): from Waiting for Head to Waiting for settlement, Sent
 * back included. Not a Draft: a never-submitted one is its owner's (one per owner, and a
 * Head-created one skips the Head step at its first Submit, 03 rule 6). Not Closed, Rejected or
 * Cancelled: nobody works on them. A write that moves no status, so not a row of ORDER_MOVES.
 */
const OWNER_MOVE_STATUSES: readonly RequestStatus[] = [
  "PENDING_HEAD",
  "PENDING_PRINCIPAL",
  "PENDING_FINANCE",
  "RETURNED",
  "PURCHASING",
  "SETTLEMENT",
];

/** Whether an order of this status can be moved to another Manager (plan of 4.10). */
export function ownerMoveAllows(status: RequestStatus): boolean {
  return OWNER_MOVE_STATUSES.includes(status);
}

/** The facts the machine reads about one order, each read from the database by the caller. */
export type OrderState = {
  id: string;
  status: RequestStatus;
  branchId: string;
  ownerId: string;
  /** The Head created the order: its submit skips the Head step (03 rule 6). */
  createdByHead: boolean;
  /** The order has a number: a Draft with one was submitted and taken back (05 Order number). */
  numbered: boolean;
  /** Progress is Done, Done short or Not bought (07 Finishing). */
  buyingFinished: boolean;
  /** 08 Exact match. */
  exactMatch: boolean;
  /** The owner is the Head, or a Manager whose CLOSE_ALONE is on (plan of 2.3, decision 6). */
  ownerClosesAlone: boolean;
  /** Cash count 0, every block confirmed, any required Head acknowledgment given (08 Closing 3). */
  readyToClose: boolean;
  /** The Principal approved it while the Finance step was off (06 Finance step switched off 1). */
  skippedFinance: boolean;
};

/** At most 200 orders in one action (06 rule 8). */
export const ORDER_ACTION_MAX = 200;

/** A reason of send back, reject, cancel, reopen: 5 to 500 code points (06 rule 3; decision 13). */
export const MOVE_REASON_MIN = 5;
export const MOVE_REASON_MAX = 500;

/** A reason as it is stored: trimmed at both ends. */
export function moveReason(value: string): string {
  return value.trim();
}

/** Whether a typed reason is enough: 5 to 500 code points once trimmed. */
export function isMoveReason(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const length = Array.from(moveReason(value)).length;
  return length >= MOVE_REASON_MIN && length <= MOVE_REASON_MAX;
}

/** Why one order cannot make the move, in the order they are checked (decision 10). */
export type OrderRefusalReason = "not_found" | "wrong_status" | "forbidden" | "not_ready";

export type MoveRefusal =
  | { kind: "none" | "too_many" | "duplicate" | "reason" }
  | { kind: "orders"; orders: readonly { orderId: string; reason: OrderRefusalReason }[] };

/** One order's move, for the writer of 2.4: the history event and the revision come from it. */
export type PlannedMove = {
  orderId: string;
  from: RequestStatus;
  to: RequestStatus;
  revisionUp: boolean;
  /** Logged as "Created by Head" (03 rule 6). */
  headStepAuto: boolean;
  /** The Principal's Approve with the Finance step off: the order is marked (06 Finance step switched off 1). */
  skipsFinance: boolean;
};

export type MoveCheck =
  { ok: true; moves: readonly PlannedMove[] } | { ok: false; refusal: MoveRefusal };

/**
 * `financeStep` is the setting `finance_step` the caller read in the move's own transaction, under
 * the lock its switch takes (plan of 4.10c, decided item 1, Look first); on when not given.
 */
export type MoveInput = { reason?: string; financeStep?: boolean };

function moveOf(status: RequestStatus, action: OrderAction): OrderMove | undefined {
  return ORDER_MOVES.find((move) => move.from === status && move.action === action);
}

/** A draft is visible to its owner and the Head only (06 Statuses; 03 rule 1). */
export function behindDraftWall(
  actor: Actor,
  order: Pick<OrderState, "status" | "ownerId">,
): boolean {
  return order.status === "DRAFT" && actor.role !== "HEAD" && actor.userId !== order.ownerId;
}

/**
 * One order and one action. `ready_to_close` is left to the server (`withReadiness`): the screen
 * offers Close and the server names the orders that are not ready (08 Closing 3; decision 8).
 */
function judge(
  actor: Actor,
  order: OrderState,
  action: OrderAction,
  withReadiness: boolean,
): { move: OrderMove } | { reason: OrderRefusalReason } {
  // The branch wall, and the draft wall: a draft is visible to its owner and the Head only
  // (03 rule 1; 06 Statuses).
  if (!seesBranch(actor, order.branchId)) return { reason: "not_found" };
  if (behindDraftWall(actor, order)) return { reason: "not_found" };

  const move = moveOf(order.status, action);
  if (!move) return { reason: "wrong_status" };
  // A never-submitted Draft has no Cancel: it is deleted (plan of 2.3b, decided item 1).
  if (move.needs.includes("numbered") && !order.numbered) return { reason: "wrong_status" };
  // "Open, skipped Finance" is a "from" of its own (06 Allowed moves).
  if (move.needs.includes("skipped_finance") && !order.skippedFinance) {
    return { reason: "wrong_status" };
  }
  if (move.needs.includes("not_skipped") && order.skippedFinance) return { reason: "wrong_status" };

  const target = { branchId: order.branchId, ownerId: order.ownerId };
  if (decide(move.permission, actor, target) !== "allow") return { reason: "forbidden" };
  if (move.who === "owner" && actor.userId !== order.ownerId) return { reason: "forbidden" };

  for (const need of move.needs) {
    if (need === "buying_finished" && !order.buyingFinished) return { reason: "not_ready" };
    if (need === "exact_match" && !(order.exactMatch && order.ownerClosesAlone)) {
      return { reason: "not_ready" };
    }
    if (need === "ready_to_close" && withReadiness && !order.readyToClose) {
      return { reason: "not_ready" };
    }
  }
  return { move };
}

/**
 * The actions the screen offers for one order or a set of ticked orders: those every order allows
 * (06 rule 8; 03 rule 8), in the table's order. Nothing for no orders or more than 200.
 */
export function allowedActions(actor: Actor, orders: readonly OrderState[]): OrderAction[] {
  if (orders.length === 0 || orders.length > ORDER_ACTION_MAX) return [];
  return ORDER_ACTIONS.filter((action) =>
    orders.every((order) => "move" in judge(actor, order, action, false)),
  );
}

/**
 * The server's answer for one action on one or more orders, all or nothing (06 rule 8): every
 * order's move, or a refusal that names every order that fails and why.
 */
export function checkMoves(
  actor: Actor,
  orders: readonly OrderState[],
  action: OrderAction,
  input: MoveInput = {},
): MoveCheck {
  if (orders.length === 0) return { ok: false, refusal: { kind: "none" } };
  if (orders.length > ORDER_ACTION_MAX) return { ok: false, refusal: { kind: "too_many" } };
  if (new Set(orders.map((order) => order.id)).size !== orders.length) {
    return { ok: false, refusal: { kind: "duplicate" } };
  }
  const needsReason = ORDER_MOVES.some(
    (move) => move.action === action && move.needs.includes("reason"),
  );
  if (needsReason && !isMoveReason(input.reason)) {
    return { ok: false, refusal: { kind: "reason" } };
  }

  const moves: PlannedMove[] = [];
  const failed: { orderId: string; reason: OrderRefusalReason }[] = [];
  for (const order of orders) {
    const answer = judge(actor, order, action, true);
    if ("reason" in answer) {
      failed.push({ orderId: order.id, reason: answer.reason });
      continue;
    }
    const { move } = answer;
    const headStepAuto = move.toWhenHeadCreated !== undefined && order.createdByHead;
    const skipsFinance = move.toWhenFinanceOff !== undefined && input.financeStep === false;
    moves.push({
      orderId: order.id,
      from: move.from,
      to:
        headStepAuto && move.toWhenHeadCreated
          ? move.toWhenHeadCreated
          : skipsFinance && move.toWhenFinanceOff
            ? move.toWhenFinanceOff
            : move.to,
      revisionUp: move.revisionUp === true,
      headStepAuto,
      skipsFinance,
    });
  }
  if (failed.length > 0) return { ok: false, refusal: { kind: "orders", orders: failed } };
  return { ok: true, moves };
}

/** Thrown by assertMove(); the action wrapper maps the refusal to its codes (2.4). */
export class OrderMoveRefused extends Error {
  constructor(readonly refusal: MoveRefusal) {
    super(`The order move was refused: ${refusal.kind}.`);
    this.name = "OrderMoveRefused";
  }
}

/** checkMoves() for the server: the moves, or OrderMoveRefused with the same refusal. */
export function assertMove(
  actor: Actor,
  orders: readonly OrderState[],
  action: OrderAction,
  input: MoveInput = {},
): readonly PlannedMove[] {
  const check = checkMoves(actor, orders, action, input);
  if (!check.ok) throw new OrderMoveRefused(check.refusal);
  return check.moves;
}
