// "Already approved by … at …" (06-approval-workflow.md rule 7: "the slower user sees 'Already
// approved by Dilnoza at 14:32'"; plan of 2.10, decided item 3, Look first), and since 2.11 "Already
// sent back / rejected / cancelled / taken back by …" (plan of 2.11, decided item 7, Look first). When an action on
// ticked orders is refused because an order moved since the user saw it, the order's newest
// event says who moved it. Pure: the caller reads the newest event under the branch and draft
// walls (src/features/orders/queries/newest-moves.ts); an order behind a wall has none.

import { ORDER_MOVES, type OrderAction } from "./order-moves";
import { PERMISSIONS, type Role } from "./permissions";
import type { RequestStatus } from "./request-status";

/** The newest event of an order, as the reader of the refusal may see it. */
export type NewestMove = {
  /** The order's version now. */
  version: number;
  type: OrderAction;
  /** The status the event moved the order from: the step that was approved. */
  from: RequestStatus;
  actorId: string;
  actorName: string;
  at: Date;
};

/** One refused order of the user's action. */
export type RefusedOrder = {
  code: string;
  /** The version the user sent: the one the screen showed. */
  sentVersion: number;
};

/** The moves another user can have made on an order the reader still sees (06 rule 7). */
export const DECIDED_VERBS = ["APPROVE", "SEND_BACK", "REJECT", "CANCEL", "TAKE_BACK"] as const;
export type DecidedVerb = (typeof DECIDED_VERBS)[number];

/** The approver's moves: named only to a role that decides that step. */
const STEP_VERBS: readonly OrderAction[] = ["APPROVE", "SEND_BACK", "REJECT"];

/**
 * Who moved the order meanwhile, and how, or null for the plain "changed, refreshed" line. Only
 * for an order refused as `stale_version` or `wrong_status`, whose version is above the one sent,
 * whose newest event is another user's Approve, Send back, Reject, Cancel or Take back (plan of
 * 2.11, decided item 7, Look first). The approver's verbs only for a user whose role approves
 * that step: a role that never decides it was not "slower" (permission review of 2.10, Should
 * fix 2; 03 matrix "Approve, send back or reject at step 1 / 2 / 3"). Cancel and Take back for
 * any reader who still sees the order; Submit and Submit again never (the owner's own moves).
 */
export function alreadyDecidedBy(
  refused: RefusedOrder,
  newest: NewestMove | null,
  actor: { id: string; role: Role },
): { verb: DecidedVerb; name: string; at: Date } | null {
  if (refused.code !== "stale_version" && refused.code !== "wrong_status") return null;
  if (!newest || newest.version <= refused.sentVersion) return null;
  if (newest.actorId === actor.id) return null;
  const verb = DECIDED_VERBS.find((one) => one === newest.type);
  if (!verb) return null;
  if (STEP_VERBS.includes(verb)) {
    const step = ORDER_MOVES.find((move) => move.from === newest.from && move.action === verb);
    if (!step || PERMISSIONS[step.permission].roles[actor.role] === "no") return null;
  }
  return { verb, name: newest.actorName, at: newest.at };
}
