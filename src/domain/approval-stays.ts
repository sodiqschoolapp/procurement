import type { OrderEventType } from "./order-moves";
import { STUCK_STATUSES } from "./order-steps";
import type { RequestStatus } from "./request-status";

// The stays of one order at the approval steps (10-notifications-analytics-reports.md, Analytics
// page per role, Head, Approval speed: "Average hours at each step"; 06-approval-workflow.md,
// Allowed moves; plan of 6.4b, decided items 6 to 8, Look first). Pure: the analytics refresh
// (src/server/jobs/analytics-refresh.ts) reads each order's history and writes what this returns.
//
// - A stay starts with the event that moves the order into Waiting for Head, Principal or Finance
//   and ends with the event that moves it out.
// - It counts as a decision when that step's approver ended it: Approve, Send back or Reject. A
//   Cancel or a Take back is not the step's decision, and its stay is left out (decided item 6).
// - An event with from = to (a MOVE_OWNER at a Waiting step) neither starts nor ends a stay, as the
//   order list's `stuck` filter reads it (review of the plan, Should fix 1).
// - A Head-created order's first Submit goes from Draft to Waiting for Principal (03 rule 6), so it
//   has no Head stay.
// - The stay still running at the end of the history is open: "waiting now" (decided item 8).

export type ApprovalStep = (typeof STUCK_STATUSES)[number];

/** The approvers' decisions that end a stay (06 Allowed moves, "Any Waiting for step"). */
export const STAY_DECISIONS = ["APPROVE", "SEND_BACK", "REJECT"] as const satisfies readonly OrderEventType[];
export type StayDecision = (typeof STAY_DECISIONS)[number];

/** One event of an order's history, as the stays read it. */
export type StayEvent = {
  type: OrderEventType;
  from: RequestStatus;
  to: RequestStatus;
  at: Date;
  /** The action's reason (06 rule 3), on a send back or a reject. */
  reason: string | null;
};

export type Stay =
  | {
      step: ApprovalStep;
      enteredAt: Date;
      leftAt: Date;
      /** Whole seconds between entering and leaving. */
      seconds: bigint;
      decision: StayDecision;
      reason: string | null;
    }
  | {
      step: ApprovalStep;
      enteredAt: Date;
      leftAt: null;
      seconds: null;
      decision: null;
      reason: null;
    };

const isStep = (status: RequestStatus): status is ApprovalStep =>
  (STUCK_STATUSES as readonly RequestStatus[]).includes(status);

const isDecision = (type: OrderEventType): type is StayDecision =>
  (STAY_DECISIONS as readonly OrderEventType[]).includes(type);

/**
 * The events in the order they happened: by time, and among events of the same moment the one
 * that leaves the status the order is in (two moves of one order can share a moment in a test with
 * a frozen clock).
 */
function inOrder(events: readonly StayEvent[]): StayEvent[] {
  const left = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  const ordered: StayEvent[] = [];
  // The history starts at the status no other move of its first moment led to.
  const firstMoment = left.filter((event) => event.at.getTime() === left[0]?.at.getTime());
  let status: RequestStatus | null =
    (
      firstMoment.find(
        (event) => !firstMoment.some((other) => other !== event && other.to === event.from),
      ) ?? left[0]
    )?.from ?? null;
  while (left.length > 0) {
    const first = left[0]!.at.getTime();
    let index = left.findIndex(
      (event) => event.at.getTime() === first && event.from !== event.to && event.from === status,
    );
    if (index === -1) index = 0;
    const [event] = left.splice(index, 1) as [StayEvent];
    ordered.push(event);
    if (event.from !== event.to) status = event.to;
  }
  return ordered;
}

/** The stays of one order, oldest first; the last may be open. */
export function approvalStays(events: readonly StayEvent[]): Stay[] {
  const stays: Stay[] = [];
  let open: { step: ApprovalStep; enteredAt: Date } | null = null;
  for (const event of inOrder(events)) {
    if (event.from === event.to) continue;
    if (open && event.from === open.step && isDecision(event.type)) {
      stays.push({
        step: open.step,
        enteredAt: open.enteredAt,
        leftAt: event.at,
        seconds: BigInt(Math.floor((event.at.getTime() - open.enteredAt.getTime()) / 1000)),
        decision: event.type,
        reason: event.type === "APPROVE" ? null : event.reason,
      });
    }
    open = isStep(event.to) ? { step: event.to, enteredAt: event.at } : null;
  }
  if (open) {
    stays.push({
      step: open.step,
      enteredAt: open.enteredAt,
      leftAt: null,
      seconds: null,
      decision: null,
      reason: null,
    });
  }
  return stays;
}
