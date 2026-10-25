// One row of the order list's download (05-order-request-form.md, Download 1 and 3: "the same
// data and the same calculation functions as the screen"; plan of 2.14). Pure: the caller reads
// the order's plan and events; the planned total and the extra costs are ./order-totals.ts and
// who finished each approval step is orderSteps() of ./order-steps.ts, the stepper's own function
// (plan of 2.14, decided item 5, Look first), so the file, the list and the order page can never
// disagree.

import { type OrderPlan, extrasSum, orderTotal } from "./order-totals";
import {
  BUYING_STATUSES,
  type PurchaseRecord,
  actualExtra,
  actualQuantity,
  actualTotal,
  actualUnitPrice,
  difference,
} from "./purchases";
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
  /**
   * Who finished each step and when; null for a step not finished (15 S17); "skipped" for the
   * Finance step of an order that skipped Finance (06 Finance step switched off; plan of 4.10c).
   */
  approvals: Record<ApprovalStep, { name: string; at: Date } | "skipped" | null>;
  /**
   * From status Open on, the actual numbers over the records (05 Download 1; 08 Numbers the
   * system calculates); null before. `unitPrice` is null while nothing is received.
   */
  actual: {
    qty: string;
    unitPrice: bigint | null;
    extras: bigint;
    total: bigint;
    difference: bigint;
  } | null;
};

/**
 * The numbers and the approvals of one order of the download; `records` are its purchase records,
 * cancelled ones included (the domain leaves them out). `events` are the order's events,
 * oldest first: only the moves after the newest Submit count (06 rule 4), a Head-created order's
 * Head step is its Submit (03 rule 6), and a Rejected or Cancelled order keeps the steps it
 * finished. `skippedFinance` is the order's mark, read as the stepper reads it.
 */
export function orderDownloadRow(
  status: RequestStatus,
  plan: OrderPlan,
  events: readonly StepEvent[],
  records: readonly PurchaseRecord[],
  skippedFinance = false,
): DownloadRow {
  const steps = orderSteps(status, events, skippedFinance);
  const byOf = (step: ApprovalStep) => {
    const view = steps.find((each) => each.step === step);
    return view?.state === "skipped" ? "skipped" : (view?.by ?? null);
  };
  const plannedTotal = orderTotal(plan);
  const total = actualTotal(records);
  return {
    extras: extrasSum(plan.extras),
    plannedTotal,
    approvals: { HEAD: byOf("HEAD"), PRINCIPAL: byOf("PRINCIPAL"), FINANCE: byOf("FINANCE") },
    // Plan of 3.5, decided item 6, Look first: Open, Waiting for settlement and Closed.
    actual: BUYING_STATUSES.has(status)
      ? {
          qty: actualQuantity(records),
          unitPrice: actualUnitPrice(records),
          extras: actualExtra(records),
          total,
          difference: difference(plannedTotal, total),
        }
      : null,
  };
}
