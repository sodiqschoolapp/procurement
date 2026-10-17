import { describe, expect, it } from "vitest";

import { orderDownloadRow } from "./order-download";
import type { OrderAction } from "./order-moves";
import type { StepEvent } from "./order-steps";
import { type OrderPlan, orderTotal } from "./order-totals";
import type { PurchaseRecord } from "./purchases";
import type { RequestStatus } from "./request-status";

// 05-order-request-form.md, Download 1 ("then who approved each step and when") and 3 ("the same
// calculation functions as the screen"); 15 S17 ("the Head's name and time are in the order's row
// and Principal and Finance are empty"); 06-approval-workflow.md rule 4; 03 rule 6; plan of 2.14,
// decided item 5 (Look first) and the review's worked example.

let minute = 0;
function event(
  type: OrderAction,
  from: RequestStatus,
  to: RequestStatus,
  actorName: string,
  headStepAuto = false,
): StepEvent {
  minute += 1;
  return {
    type,
    from,
    to,
    actorName,
    at: new Date(Date.UTC(2026, 9, 16, 9, minute)),
    headStepAuto,
  };
}

/** No purchase record. */
const NONE: readonly PurchaseRecord[] = [];

const plan: OrderPlan = {
  quantity: "10",
  price: 5_000n,
  extras: [1_500n, 500n],
  paymentType: "CASH",
};

describe("orderDownloadRow (05 Download 1 and 3)", () => {
  it("gives the planned total and the extra costs of order-totals (05 fields 12 and 16)", () => {
    const row = orderDownloadRow("PENDING_HEAD", plan, [
      event("SUBMIT", "DRAFT", "PENDING_HEAD", "Manager"),
    ], NONE);
    expect(row.extras).toBe(2_000n);
    expect(row.plannedTotal).toBe(52_000n);
    expect(row.plannedTotal).toBe(orderTotal(plan));
  });

  it("an order waiting for the Principal names the Head and leaves Principal and Finance empty (15 S17)", () => {
    const submit = event("SUBMIT", "DRAFT", "PENDING_HEAD", "Manager");
    const head = event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "Head Invented");
    const row = orderDownloadRow("PENDING_PRINCIPAL", plan, [submit, head], NONE);
    expect(row.approvals).toEqual({
      HEAD: { name: "Head Invented", at: head.at },
      PRINCIPAL: null,
      FINANCE: null,
    });
  });

  it("only the approvals after the newest submit count (06 rule 4)", () => {
    const events = [
      event("SUBMIT", "DRAFT", "PENDING_HEAD", "Manager"),
      event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "First Head"),
      event("SEND_BACK", "PENDING_PRINCIPAL", "RETURNED", "Principal"),
      event("SUBMIT_AGAIN", "RETURNED", "PENDING_HEAD", "Manager"),
    ];
    const second = event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "Second Head");
    const row = orderDownloadRow("PENDING_PRINCIPAL", plan, [...events, second], NONE);
    expect(row.approvals.HEAD).toEqual({ name: "Second Head", at: second.at });
    expect(row.approvals.PRINCIPAL).toBeNull();
    // Waiting for the Head again: the first approval no longer counts.
    expect(orderDownloadRow("PENDING_HEAD", plan, events, NONE).approvals.HEAD).toBeNull();
  });

  it("a Head-created order's Head step is the Head's submit (03 rule 6)", () => {
    const submit = event("SUBMIT", "DRAFT", "PENDING_PRINCIPAL", "Head Invented", true);
    const row = orderDownloadRow("PENDING_PRINCIPAL", plan, [submit], NONE);
    expect(row.approvals.HEAD).toEqual({ name: "Head Invented", at: submit.at });
  });

  it("a Rejected order keeps the steps it finished (05 Download 1)", () => {
    const head = event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "Head Invented");
    const principal = event("APPROVE", "PENDING_PRINCIPAL", "PENDING_FINANCE", "Principal One");
    const row = orderDownloadRow("REJECTED", plan, [
      event("SUBMIT", "DRAFT", "PENDING_HEAD", "Manager"),
      head,
      principal,
      event("REJECT", "PENDING_FINANCE", "REJECTED", "Finance One"),
    ], NONE);
    expect(row.approvals).toEqual({
      HEAD: { name: "Head Invented", at: head.at },
      PRINCIPAL: { name: "Principal One", at: principal.at },
      FINANCE: null,
    });
  });

  it("an Open order names all three steps", () => {
    const finance = event("APPROVE", "PENDING_FINANCE", "PURCHASING", "Finance One");
    const row = orderDownloadRow("PURCHASING", plan, [
      event("SUBMIT", "DRAFT", "PENDING_HEAD", "Manager"),
      event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "Head Invented"),
      event("APPROVE", "PENDING_PRINCIPAL", "PENDING_FINANCE", "Principal One"),
      finance,
    ], NONE);
    expect(row.approvals.FINANCE).toEqual({ name: "Finance One", at: finance.at });
  });
});

describe("orderDownloadRow: the actual columns (05 Download 1; 08 Numbers the system calculates)", () => {
  /** 08 Worked example: 100 notebooks × 5 000 in cash plus 20 000 delivery, 520 000. */
  const notebooks: OrderPlan = {
    quantity: "100",
    price: 5_000n,
    extras: [20_000n],
    paymentType: "CASH",
  };
  /** 15 S2 Cheaper: 4 500 each, the delivery 20 000. */
  const cheaper: PurchaseRecord[] = [
    { qty: "100", unitPrice: 4_500n, extras: [20_000n], isCancelled: false },
  ];

  it("before Open the five cells are empty, even with records given (decided item 6)", () => {
    for (const status of ["PENDING_FINANCE", "REJECTED", "CANCELLED"] as const) {
      expect(orderDownloadRow(status, notebooks, [], cheaper).actual).toBeNull();
    }
  });

  it("the Cheaper case from Open on: 100, 4 500, 20 000, 470 000 and 50 000 left (15 S2)", () => {
    for (const status of ["PURCHASING", "SETTLEMENT", "CLOSED"] as const) {
      expect(orderDownloadRow(status, notebooks, [], cheaper).actual).toEqual({
        qty: "100",
        unitPrice: 4_500n,
        extras: 20_000n,
        total: 470_000n,
        difference: 50_000n,
      });
    }
  });

  it("an Open order with nothing received: 0, no price, 0, 0 and the planned total left", () => {
    expect(orderDownloadRow("PURCHASING", notebooks, [], NONE).actual).toEqual({
      qty: "0",
      unitPrice: null,
      extras: 0n,
      total: 0n,
      difference: 520_000n,
    });
  });

  it("a dearer purchase is a negative difference; a cancelled record counts for nothing", () => {
    const dearer: PurchaseRecord[] = [
      { qty: "100", unitPrice: 5_200n, extras: [30_000n], isCancelled: false },
      { qty: "5", unitPrice: 5_200n, extras: [], isCancelled: true },
    ];
    // 15 S3: 520 000 + 30 000 delivery = 550 000, over by 30 000.
    expect(orderDownloadRow("PURCHASING", notebooks, [], dearer).actual?.difference).toBe(
      -30_000n,
    );
  });
});
