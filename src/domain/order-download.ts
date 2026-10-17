// One row of the order list's download (05-order-request-form.md, Download 1 and 3: "the same
// data and the same calculation functions as the screen"; plan of 2.14). Pure: the caller reads
// the order's plan and events; the planned total and the extra costs are ./order-totals.ts and
// who finished each approval step is orderSteps() of ./order-steps.ts, the stepper's own function
// (plan of 2.14, decided item 5, Look first), so the file, the list and the order page can never
// disagree.

import { type OrderPlan, extrasSum, orderTotal } from "./order-totals";
import { type StepEvent, orderSteps } from "./order-steps";
import type { RequestStatus } from "./request-status";

/** The three approval steps a download names, in the approval order (06 Statuses). */
export const APPROVAL_STEPS = ["HEAD", "PRINCIPAL", "FINANCE"] as const;
export type ApprovalStep = (typeof APPROVAL_STEPS)[number];

export type DownloadRow = {
  /** The sum of the order's extra costs (05 field 12: "The cell shows the sum"). */
  extras: bigint;
  /** round(quantity × price) + extra costs (05 field 16; 08 Planned total). */
  plannedTotal: bigint;
  /** Who finished each step and when; null for a step not finished (15 S17). */
  approvals: Record<ApprovalStep, { name: string; at: Date } | null>;
};

/**
 * The numbers and the approvals of one order of the download. `events` are the order's events,
 * oldest first: only the moves after the newest Submit count (06 rule 4), a Head-created order's
 * Head step is its Submit (03 rule 6), and a Rejected or Cancelled order keeps the steps it
 * finished.
 */
export function orderDownloadRow(
  status: RequestStatus,
  plan: OrderPlan,
  events: readonly StepEvent[],
): DownloadRow {
  const steps = orderSteps(status, events);
  const byOf = (step: ApprovalStep) => steps.find((view) => view.step === step)?.by ?? null;
  return {
    extras: extrasSum(plan.extras),
    plannedTotal: orderTotal(plan),
    approvals: { HEAD: byOf("HEAD"), PRINCIPAL: byOf("PRINCIPAL"), FINANCE: byOf("FINANCE") },
  };
}
