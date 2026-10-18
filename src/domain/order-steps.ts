// The stepper of the order page (11-screens-and-ux.md, Order page layout 2: "Draft, Head,
// Principal, Finance, Open, Closed, with the name and time of each finished step") and the line
// that says who the order is waiting for (Order page layout 4; 06-approval-workflow.md, Statuses,
// "Who acts next"). Pure: the caller reads the order's status and events (plan of 2.9).

import { type BusinessDate, nextBusinessDate } from "./business-date";
import type { OrderEventType } from "./order-moves";
import type { RequestStatus } from "./request-status";

/** The six steps, in the stepper's order. */
export const ORDER_STEPS = ["DRAFT", "HEAD", "PRINCIPAL", "FINANCE", "OPEN", "CLOSED"] as const;
export type OrderStep = (typeof ORDER_STEPS)[number];

/** One event of the order's history, as the stepper reads it. */
export type StepEvent = {
  type: OrderEventType;
  from: RequestStatus;
  to: RequestStatus;
  actorName: string;
  at: Date;
  /** The Submit of an order the Head created: the Head step is approved with it (03 rule 6). */
  headStepAuto: boolean;
};

export type StepState = "done" | "current" | "stopped" | "todo";

export type StepView = {
  step: OrderStep;
  state: StepState;
  /** Who finished the step and when; only on a finished step. */
  by: { name: string; at: Date } | null;
};

/** The step an order of this status stands at; null for Closed (every step finished). */
function stepOf(status: RequestStatus): OrderStep | null {
  switch (status) {
    case "DRAFT":
    case "RETURNED":
      return "DRAFT";
    case "PENDING_HEAD":
      return "HEAD";
    case "PENDING_PRINCIPAL":
      return "PRINCIPAL";
    case "PENDING_FINANCE":
      return "FINANCE";
    case "PURCHASING":
      return "OPEN";
    // Settlement is the work that closes the order (plan of 2.9, decided item 9).
    case "SETTLEMENT":
      return "CLOSED";
    case "CLOSED":
      return null;
    // A Rejected or Cancelled order stops where its last move came from: not used here.
    case "REJECTED":
    case "CANCELLED":
      return null;
  }
}

/** Whether the event finishes the step. */
function finishes(step: OrderStep, event: StepEvent): boolean {
  switch (step) {
    case "DRAFT":
      return event.type === "SUBMIT" || event.type === "SUBMIT_AGAIN";
    case "HEAD":
      return (
        (event.type === "APPROVE" && event.from === "PENDING_HEAD") ||
        (event.type === "SUBMIT" && event.headStepAuto)
      );
    case "PRINCIPAL":
      return event.type === "APPROVE" && event.from === "PENDING_PRINCIPAL";
    case "FINANCE":
      return event.type === "APPROVE" && event.from === "PENDING_FINANCE";
    case "OPEN":
      return event.type === "CLOSE_EXACT" || event.type === "SEND_TO_SETTLEMENT";
    case "CLOSED":
      return event.type === "CLOSE_EXACT" || event.type === "CLOSE";
  }
}

/**
 * The six steps of one order. `events` are the order's events, oldest first. Only the moves after
 * the newest Submit or Submit again count: earlier approvals stay in History but no longer count
 * (06 rule 4; decided item 2, Look first). Every step before the one the order stands at is
 * finished, by the newest event that finishes it; no later step is ever finished, so a reopened
 * order stands at Open with Closed empty. A Rejected or Cancelled order is "stopped" at the step
 * its last move came from.
 */
export function orderSteps(status: RequestStatus, events: readonly StepEvent[]): StepView[] {
  let start = -1;
  events.forEach((event, index) => {
    if (event.type === "SUBMIT" || event.type === "SUBMIT_AGAIN") start = index;
  });
  const counted = start < 0 ? [] : events.slice(start);

  let at: number;
  let atState: StepState = "current";
  if (status === "REJECTED" || status === "CANCELLED") {
    const last = events.at(-1);
    at = ORDER_STEPS.indexOf(stepOf(last?.from ?? "DRAFT") ?? "DRAFT");
    atState = "stopped";
  } else {
    const step = stepOf(status);
    at = step === null ? ORDER_STEPS.length : ORDER_STEPS.indexOf(step);
  }

  return ORDER_STEPS.map((step, index): StepView => {
    if (index > at) return { step, state: "todo", by: null };
    if (index === at) return { step, state: atState, by: null };
    const finisher = counted.findLast((event) => finishes(step, event));
    return {
      step,
      state: "done",
      by: finisher ? { name: finisher.actorName, at: finisher.at } : null,
    };
  });
}

/** Who acts next (06 Statuses): a role of the order's branch, the owner, or nobody. */
export type WaitingFor = "HEAD" | "PRINCIPAL" | "FINANCE" | "OWNER" | "NOBODY";

/** The "Who acts next" column of 06 Statuses (decided item 5, Look first). */
export function waitingFor(status: RequestStatus): WaitingFor {
  switch (status) {
    case "PENDING_HEAD":
      return "HEAD";
    case "PENDING_PRINCIPAL":
      return "PRINCIPAL";
    case "PENDING_FINANCE":
    case "SETTLEMENT":
      return "FINANCE";
    case "DRAFT":
    case "RETURNED":
    case "PURCHASING":
      return "OWNER";
    case "CLOSED":
    case "REJECTED":
    case "CANCELLED":
      return "NOBODY";
  }
}

/**
 * Whether an order shows "Overdue" (edge-cases/requests-and-approval.md, "The needed-by date passes
 * while the order waits": "The order shows 'Overdue'. Nothing is blocked"; plan of 2.13, decided
 * item 8). It waits while it stands at a Waiting step, is Sent back, or is Open with its buying not
 * finished; its needed-by date is before `today`, the Tashkent business date of the injected clock
 * (developer-rules.md rule 10). Today itself is not overdue. A label only: no move asks it.
 */
export function isOverdue(
  status: RequestStatus,
  progress: OrderProgress,
  neededBy: BusinessDate | null,
  today: BusinessDate,
): boolean {
  if (neededBy === null || neededBy >= today) return false;
  return stillDue(status, progress);
}

type OrderProgress = "OPEN" | "DONE" | "DONE_SHORT" | "NOT_BOUGHT";

/**
 * The statuses in which an order still waits for its needed-by date: a Waiting step, Sent back, or
 * Open while its buying is not finished (`progress` OPEN) (plan of 2.13, decided item 8). The SQL
 * of the order list's `due=soon` filter reads the same lists (plan of 6.1, decided item 2).
 */
export const STILL_DUE_STATUSES = [
  "PENDING_HEAD",
  "PENDING_PRINCIPAL",
  "PENDING_FINANCE",
  "RETURNED",
] as const satisfies readonly RequestStatus[];
/** Open counts only while its buying is not finished. */
export const STILL_DUE_OPEN = { status: "PURCHASING", progress: "OPEN" } as const;

function stillDue(status: RequestStatus, progress: OrderProgress): boolean {
  if ((STILL_DUE_STATUSES as readonly RequestStatus[]).includes(status)) return true;
  return status === STILL_DUE_OPEN.status && progress === STILL_DUE_OPEN.progress;
}

/** How many days ahead an order is "due soon" (plan of 6.1, decided item 2: no setting). */
export const DUE_SOON_DAYS = 7;

/** The last needed-by date that is "due soon" on `today`: today + 7 days. */
export function dueSoonUntil(today: BusinessDate): BusinessDate {
  let date = today;
  for (let day = 0; day < DUE_SOON_DAYS; day += 1) date = nextBusinessDate(date);
  return date;
}

/**
 * The Manager's home list "Orders due soon" (10-notifications-analytics-reports.md, Home page per
 * role; plan of 6.1, decided item 2): an order that still waits (as isOverdue() reads it) whose
 * needed-by is on or before today + 7 days. Overdue ones are in: they are the most due.
 */
export function isDueSoon(
  status: RequestStatus,
  progress: OrderProgress,
  neededBy: BusinessDate | null,
  today: BusinessDate,
): boolean {
  if (neededBy === null || neededBy > dueSoonUntil(today)) return false;
  return stillDue(status, progress);
}

/**
 * The statuses in which an order can be "stuck": the three Waiting steps, which wait for "the
 * approvers of their step" (06-approval-workflow.md rule 9; plan of 6.2, decided item 1, Look
 * first). Sent back, Open and Waiting for settlement are not approval steps.
 */
export const STUCK_STATUSES = [
  "PENDING_HEAD",
  "PENDING_PRINCIPAL",
  "PENDING_FINANCE",
] as const satisfies readonly RequestStatus[];

const HOUR_MS = 60 * 60 * 1000;

/**
 * The instant before which an order that entered its Waiting step is waiting "more than `hours`"
 * (06 rule 9; 10 Notifications, "Orders waiting more than 48 hours"; the setting
 * `escalation_hours`). Strict: an entry exactly `hours` ago is not before it. `now` is the injected
 * clock's (developer-rules.md rule 10). The Head home's "stuck" list and the order list's
 * `stuck=1` compare with it (plan of 6.2, decided item 2, Look first); 8.1 reads it too.
 */
export function stuckBefore(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * HOUR_MS);
}
