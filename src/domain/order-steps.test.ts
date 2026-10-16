import { describe, expect, it } from "vitest";

import type { OrderAction } from "./order-moves";
import { type StepEvent, type StepView, isOverdue, orderSteps, waitingFor } from "./order-steps";
import { REQUEST_STATUSES, type RequestStatus } from "./request-status";

// 11-screens-and-ux.md, Order page layout 2 ("Draft, Head, Principal, Finance, Open, Closed, with
// the name and time of each finished step"); 06-approval-workflow.md, Statuses ("Who acts next"),
// Allowed moves, rule 4 ("Earlier approvals stay in the history but no longer count");
// 03-roles-and-permissions.md rule 6 ("Created by Head"); plan of 2.9, decided items 2, 3, 5 and 9
// and the review's correction 1.

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

const submit = (by = "Manager") => event("SUBMIT", "DRAFT", "PENDING_HEAD", by);
const headOk = () => event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "Head");
const principalOk = () => event("APPROVE", "PENDING_PRINCIPAL", "PENDING_FINANCE", "Principal");
const financeOk = () => event("APPROVE", "PENDING_FINANCE", "PURCHASING", "Finance");

/** Each step as `state` or `state:name`, for short assertions. */
function shape(steps: StepView[]): Record<string, string> {
  return Object.fromEntries(
    steps.map((view) => [view.step, view.by ? `${view.state}:${view.by.name}` : view.state]),
  );
}

describe("orderSteps (11 Order page layout 2; 06 rule 4)", () => {
  it("a never-submitted draft stands at Draft with no step finished", () => {
    expect(shape(orderSteps("DRAFT", []))).toEqual({
      DRAFT: "current",
      HEAD: "todo",
      PRINCIPAL: "todo",
      FINANCE: "todo",
      OPEN: "todo",
      CLOSED: "todo",
    });
  });

  it("a taken-back Draft stands at Draft with no step finished (decided item 2)", () => {
    const events = [submit(), event("TAKE_BACK", "PENDING_HEAD", "DRAFT", "Manager")];
    expect(shape(orderSteps("DRAFT", events))).toMatchObject({ DRAFT: "current", HEAD: "todo" });
  });

  it("a Sent back order stands at Draft with no step finished (decided item 2)", () => {
    const events = [submit(), headOk(), event("SEND_BACK", "PENDING_PRINCIPAL", "RETURNED", "P")];
    expect(shape(orderSteps("RETURNED", events))).toEqual({
      DRAFT: "current",
      HEAD: "todo",
      PRINCIPAL: "todo",
      FINANCE: "todo",
      OPEN: "todo",
      CLOSED: "todo",
    });
  });

  it("a submitted order stands at Head with Draft finished by the submitter, at its time", () => {
    const sent = submit("Aziza Karimova");
    const steps = orderSteps("PENDING_HEAD", [sent]);
    expect(shape(steps)).toEqual({
      DRAFT: "done:Aziza Karimova",
      HEAD: "current",
      PRINCIPAL: "todo",
      FINANCE: "todo",
      OPEN: "todo",
      CLOSED: "todo",
    });
    expect(steps[0]!.by!.at).toEqual(sent.at);
  });

  it("a Head-created order has Draft and Head finished by the Head's one Submit (03 rule 6)", () => {
    const events = [event("SUBMIT", "DRAFT", "PENDING_PRINCIPAL", "Head", true)];
    expect(shape(orderSteps("PENDING_PRINCIPAL", events))).toMatchObject({
      DRAFT: "done:Head",
      HEAD: "done:Head",
      PRINCIPAL: "current",
    });
  });

  it("a Head-created order sent back and submitted again stands at Head, the Head step empty (decisions 2.3 item 3)", () => {
    const events = [
      event("SUBMIT", "DRAFT", "PENDING_PRINCIPAL", "Head", true),
      event("SEND_BACK", "PENDING_PRINCIPAL", "RETURNED", "Principal"),
      event("SUBMIT_AGAIN", "RETURNED", "PENDING_HEAD", "Head"),
    ];
    expect(shape(orderSteps("PENDING_HEAD", events))).toMatchObject({
      DRAFT: "done:Head",
      HEAD: "current",
      PRINCIPAL: "todo",
    });
  });

  it("Waiting for Finance has Draft, Head and Principal finished", () => {
    expect(shape(orderSteps("PENDING_FINANCE", [submit(), headOk(), principalOk()]))).toEqual({
      DRAFT: "done:Manager",
      HEAD: "done:Head",
      PRINCIPAL: "done:Principal",
      FINANCE: "current",
      OPEN: "todo",
      CLOSED: "todo",
    });
  });

  it("after Finance's approval the order stands at Open", () => {
    expect(
      shape(orderSteps("PURCHASING", [submit(), headOk(), principalOk(), financeOk()])),
    ).toMatchObject({ FINANCE: "done:Finance", OPEN: "current", CLOSED: "todo" });
  });

  it("after a send-back and Submit again only the moves after the newest submit count (06 rule 4)", () => {
    const events = [
      submit(),
      event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "First Head"),
      event("SEND_BACK", "PENDING_PRINCIPAL", "RETURNED", "Principal"),
      event("SUBMIT_AGAIN", "RETURNED", "PENDING_HEAD", "Manager again"),
    ];
    expect(shape(orderSteps("PENDING_HEAD", events))).toEqual({
      DRAFT: "done:Manager again",
      HEAD: "current",
      PRINCIPAL: "todo",
      FINANCE: "todo",
      OPEN: "todo",
      CLOSED: "todo",
    });
    // An approval again after the re-submit is the one shown.
    const again = [...events, event("APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL", "Second Head")];
    expect(shape(orderSteps("PENDING_PRINCIPAL", again))).toMatchObject({
      HEAD: "done:Second Head",
      PRINCIPAL: "current",
    });
  });

  it("a Rejected order stops at the step whose approver rejected it", () => {
    const events = [submit(), headOk(), event("REJECT", "PENDING_PRINCIPAL", "REJECTED", "P")];
    expect(shape(orderSteps("REJECTED", events))).toEqual({
      DRAFT: "done:Manager",
      HEAD: "done:Head",
      PRINCIPAL: "stopped",
      FINANCE: "todo",
      OPEN: "todo",
      CLOSED: "todo",
    });
  });

  it("a Cancelled order stops at the step it was cancelled from", () => {
    const fromHead = [submit(), event("CANCEL", "PENDING_HEAD", "CANCELLED", "Manager")];
    expect(shape(orderSteps("CANCELLED", fromHead))).toMatchObject({
      DRAFT: "done:Manager",
      HEAD: "stopped",
      PRINCIPAL: "todo",
    });
    const fromReturned = [
      submit(),
      event("SEND_BACK", "PENDING_HEAD", "RETURNED", "Head"),
      event("CANCEL", "RETURNED", "CANCELLED", "Manager"),
    ];
    expect(shape(orderSteps("CANCELLED", fromReturned))).toMatchObject({
      DRAFT: "stopped",
      HEAD: "todo",
    });
  });

  const approved = () => [submit(), headOk(), principalOk(), financeOk()];

  it("a Closed order by exact match has Open and Closed finished by the one Close (review correction 1)", () => {
    const events = [...approved(), event("CLOSE_EXACT", "PURCHASING", "CLOSED", "Closer")];
    expect(shape(orderSteps("CLOSED", events))).toEqual({
      DRAFT: "done:Manager",
      HEAD: "done:Head",
      PRINCIPAL: "done:Principal",
      FINANCE: "done:Finance",
      OPEN: "done:Closer",
      CLOSED: "done:Closer",
    });
  });

  it("Waiting for settlement stands at Closed with Open finished by Send to settlement (decided item 9)", () => {
    const events = [
      ...approved(),
      event("SEND_TO_SETTLEMENT", "PURCHASING", "SETTLEMENT", "Sender"),
    ];
    expect(shape(orderSteps("SETTLEMENT", events))).toMatchObject({
      OPEN: "done:Sender",
      CLOSED: "current",
    });
  });

  it("a Closed order after settlement has Open by Send to settlement and Closed by Finance's Close", () => {
    const events = [
      ...approved(),
      event("SEND_TO_SETTLEMENT", "PURCHASING", "SETTLEMENT", "Sender"),
      event("CLOSE", "SETTLEMENT", "CLOSED", "Finance closer"),
    ];
    expect(shape(orderSteps("CLOSED", events))).toMatchObject({
      OPEN: "done:Sender",
      CLOSED: "done:Finance closer",
    });
  });

  it("settlement sent back for correction stands at Open with Closed empty (decided item 9)", () => {
    const events = [
      ...approved(),
      event("SEND_TO_SETTLEMENT", "PURCHASING", "SETTLEMENT", "Sender"),
      event("SEND_BACK_FOR_CORRECTION", "SETTLEMENT", "PURCHASING", "Finance"),
    ];
    expect(shape(orderSteps("PURCHASING", events))).toMatchObject({
      FINANCE: "done:Finance",
      OPEN: "current",
      CLOSED: "todo",
    });
  });

  it("a reopened order stands at Open, Closed empty; closed again it shows the newest Close", () => {
    const reopened = [
      ...approved(),
      event("CLOSE_EXACT", "PURCHASING", "CLOSED", "First closer"),
      event("REOPEN", "CLOSED", "PURCHASING", "Head"),
    ];
    expect(shape(orderSteps("PURCHASING", reopened))).toMatchObject({
      FINANCE: "done:Finance",
      OPEN: "current",
      CLOSED: "todo",
    });
    const closedAgain = [
      ...reopened,
      event("SEND_TO_SETTLEMENT", "PURCHASING", "SETTLEMENT", "Sender"),
      event("CLOSE", "SETTLEMENT", "CLOSED", "Second closer"),
    ];
    expect(shape(orderSteps("CLOSED", closedAgain))).toMatchObject({
      OPEN: "done:Sender",
      CLOSED: "done:Second closer",
    });
  });
});

describe("waitingFor (06 Statuses, Who acts next; decided item 5)", () => {
  it("answers each of the ten statuses", () => {
    const answers = Object.fromEntries(
      REQUEST_STATUSES.map((status) => [status, waitingFor(status)]),
    );
    expect(answers).toEqual({
      DRAFT: "OWNER",
      PENDING_HEAD: "HEAD",
      PENDING_PRINCIPAL: "PRINCIPAL",
      PENDING_FINANCE: "FINANCE",
      RETURNED: "OWNER",
      PURCHASING: "OWNER",
      SETTLEMENT: "FINANCE",
      CLOSED: "NOBODY",
      REJECTED: "NOBODY",
      CANCELLED: "NOBODY",
    });
  });
});

describe("isOverdue (edge case 'The needed-by date passes while the order waits'; plan of 2.13, decided item 8)", () => {
  const today = "2026-10-16";
  const yesterday = "2026-10-15";

  it("a waiting, sent back or open order past its needed-by date is overdue", () => {
    for (const status of [
      "PENDING_HEAD",
      "PENDING_PRINCIPAL",
      "PENDING_FINANCE",
      "RETURNED",
      "PURCHASING",
    ] as const) {
      expect(isOverdue(status, "OPEN", yesterday, today), status).toBe(true);
    }
  });

  it("no other status is overdue, also a day past", () => {
    for (const status of ["DRAFT", "SETTLEMENT", "CLOSED", "REJECTED", "CANCELLED"] as const) {
      expect(isOverdue(status, "OPEN", yesterday, today), status).toBe(false);
    }
  });

  it("an Open order whose buying is finished is not overdue", () => {
    for (const progress of ["DONE", "DONE_SHORT", "NOT_BOUGHT"] as const) {
      expect(isOverdue("PURCHASING", progress, yesterday, today), progress).toBe(false);
    }
  });

  it("needed by today or later, or no date, is not overdue", () => {
    expect(isOverdue("PENDING_HEAD", "OPEN", today, today)).toBe(false);
    expect(isOverdue("PENDING_HEAD", "OPEN", "2026-10-17", today)).toBe(false);
    expect(isOverdue("PENDING_HEAD", "OPEN", null, today)).toBe(false);
  });

  it("every status is answered", () => {
    for (const status of REQUEST_STATUSES) {
      expect(typeof isOverdue(status, "OPEN", yesterday, today)).toBe("boolean");
    }
  });
});
