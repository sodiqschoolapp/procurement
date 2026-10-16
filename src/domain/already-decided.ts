// "Already approved by … at …" (06-approval-workflow.md rule 7: "the slower user sees 'Already
// approved by Dilnoza at 14:32'"; plan of 2.10, decided item 3, Look first). When an action on
// ticked orders is refused because an order moved since the user saw it, the order's newest
// event says who moved it. Pure: the caller reads the newest event under the branch and draft
// walls (src/features/orders/queries/newest-moves.ts); an order behind a wall has none.

import type { OrderAction } from "./order-moves";

/** The newest event of an order, as the reader of the refusal may see it. */
export type NewestMove = {
  /** The order's version now. */
  version: number;
  type: OrderAction;
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

/**
 * Who approved the order meanwhile, or null for the plain "changed, refreshed" line. Only for an
 * order refused as `stale_version` or `wrong_status`, whose version is above the one sent, whose
 * newest event is an Approve of another user (review of the plan of 2.10, decision 3: a newer
 * send back, reject, cancel or take back reads its own verb from 2.11).
 */
export function alreadyApprovedBy(
  refused: RefusedOrder,
  newest: NewestMove | null,
  actorId: string,
): { name: string; at: Date } | null {
  if (refused.code !== "stale_version" && refused.code !== "wrong_status") return null;
  if (!newest || newest.version <= refused.sentVersion) return null;
  if (newest.type !== "APPROVE" || newest.actorId === actorId) return null;
  return { name: newest.actorName, at: newest.at };
}
