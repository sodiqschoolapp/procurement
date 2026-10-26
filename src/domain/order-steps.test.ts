import { describe, expect, it } from "vitest";

import type { OrderAction } from "./order-moves";
import {
  DUE_SOON_DAYS,
  STUCK_STATUSES,
  type StepEvent,
  type StepView,
  dueSoonUntil,
  isComingUp,
  isDueSoon,
  isOverdue,
  orderSteps,
  skippedFinanceBy,
  stuckBefore,
  waitingFor,
} from "./order-steps";
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

describe("orderSteps of an order that skipped Finance (11 Order page layout 2: 'the Finance step reads Skipped'; 06 Finance step switched off; plan of 4.10c)", () => {
  const principalOpens = () => event("APPROVE", "PENDING_PRINCIPAL", "PURCHASING", "Principal");
  const opened = () => [submit(), headOk(), principalOpens()];

  it("Open: Principal finished by the approval that opened it, Finance skipped, Open current", () => {
    expect(shape(orderSteps("PURCHASING", opened(), true))).toEqual({
      DRAFT: "done:Manager",
      HEAD: "done:Head",
      PRINCIPAL: "done:Principal",
      FINANCE: "skipped",
      OPEN: "current",
      CLOSED: "todo",
    });
  });

  it("a Close of a skipped order finishes Open and Closed with its name and time (06 Allowed moves, 'Open, skipped Finance | Close')", () => {
    const close = event("CLOSE_SKIPPED", "PURCHASING", "CLOSED", "Closer");
    const steps = orderSteps("CLOSED", [...opened(), close], true);
    expect(shape(steps)).toEqual({
      DRAFT: "done:Manager",
      HEAD: "done:Head",
      PRINCIPAL: "done:Principal",
      FINANCE: "skipped",
      OPEN: "done:Closer",
      CLOSED: "done:Closer",
    });
    expect(steps.find((view) => view.step === "CLOSED")?.by?.at).toEqual(close.at);
  });

  it("rule 6: reopened, Finance still reads Skipped and Closed is empty", () => {
    const reopened = [
      ...opened(),
      event("CLOSE_SKIPPED", "PURCHASING", "CLOSED", "Closer"),
      event("REOPEN", "CLOSED", "PURCHASING", "Head"),
    ];
    expect(shape(orderSteps("PURCHASING", reopened, true))).toMatchObject({
      FINANCE: "skipped",
      OPEN: "current",
      CLOSED: "todo",
    });
  });

  it("an order that did not skip shows its Finance step as before; before the Principal decides nothing is skipped", () => {
    expect(
      shape(orderSteps("PURCHASING", [...opened().slice(0, 2), principalOk(), financeOk()])),
    ).toMatchObject({
      FINANCE: "done:Finance",
    });
    expect(shape(orderSteps("PENDING_PRINCIPAL", [submit(), headOk()], false))).toMatchObject({
      PRINCIPAL: "current",
      FINANCE: "todo",
    });
  });
});

describe("skippedFinanceBy (06 rule 11; History tab 'Finance step skipped'; plan of 4.10c, decided item 13)", () => {
  it("is the Principal's approval straight to Open, and no other move", () => {
    expect(skippedFinanceBy(event("APPROVE", "PENDING_PRINCIPAL", "PURCHASING", "P"))).toBe(true);
    expect(skippedFinanceBy(principalOk())).toBe(false);
    expect(skippedFinanceBy(financeOk())).toBe(false);
    expect(skippedFinanceBy(event("REOPEN", "CLOSED", "PURCHASING", "H"))).toBe(false);
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

describe("waitingFor with the Open order's facts (06 Finance step switched off 3; plan of 2.9b, decided item 4, Look first)", () => {
  const finished = { skippedFinance: true, progress: "DONE", ownerClosesAlone: false } as const;

  it("a finished order that skipped Finance, whose owner may not close alone, waits for the Head", () => {
    expect(waitingFor("PURCHASING", finished)).toBe("HEAD");
    expect(waitingFor("PURCHASING", { ...finished, progress: "NOT_BOUGHT" })).toBe("HEAD");
    expect(waitingFor("PURCHASING", { ...finished, progress: "DONE_SHORT" })).toBe("HEAD");
  });

  it("otherwise an Open order waits for its owner, as 06 Statuses says", () => {
    expect(waitingFor("PURCHASING", { ...finished, ownerClosesAlone: true })).toBe("OWNER");
    expect(waitingFor("PURCHASING", { ...finished, progress: "OPEN" })).toBe("OWNER");
    // An exact match with CLOSE_ALONE off: the owner can still Send to settlement.
    expect(waitingFor("PURCHASING", { ...finished, skippedFinance: false })).toBe("OWNER");
  });

  it("the facts change no other status", () => {
    for (const status of REQUEST_STATUSES.filter((status) => status !== "PURCHASING")) {
      expect(waitingFor(status, finished)).toBe(waitingFor(status));
    }
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

describe("isDueSoon (10 Home page per role, Manager: 'orders due soon'; plan of 6.1, decided item 2)", () => {
  const today = "2026-10-16";

  it("the window is seven days: today + 7 is the last day in", () => {
    expect(DUE_SOON_DAYS).toBe(7);
    expect(dueSoonUntil(today)).toBe("2026-10-23");
    expect(dueSoonUntil("2026-12-28")).toBe("2027-01-04");
  });

  it("a waiting, sent back or open order needed by today + 7 is due soon, today + 8 is not", () => {
    for (const status of [
      "PENDING_HEAD",
      "PENDING_PRINCIPAL",
      "PENDING_FINANCE",
      "RETURNED",
      "PURCHASING",
    ] as const) {
      expect(isDueSoon(status, "OPEN", "2026-10-23", today), status).toBe(true);
      expect(isDueSoon(status, "OPEN", "2026-10-24", today), status).toBe(false);
    }
  });

  it("today and an overdue date are due soon", () => {
    expect(isDueSoon("PENDING_HEAD", "OPEN", today, today)).toBe(true);
    expect(isDueSoon("RETURNED", "OPEN", "2026-09-01", today)).toBe(true);
  });

  it("no other status is due soon, also with a date in the window", () => {
    for (const status of ["DRAFT", "SETTLEMENT", "CLOSED", "REJECTED", "CANCELLED"] as const) {
      expect(isDueSoon(status, "OPEN", "2026-10-17", today), status).toBe(false);
    }
  });

  it("an Open order whose buying is finished is not due soon", () => {
    for (const progress of ["DONE", "DONE_SHORT", "NOT_BOUGHT"] as const) {
      expect(isDueSoon("PURCHASING", progress, "2026-10-17", today), progress).toBe(false);
    }
  });

  it("an order without a needed-by date is not due soon", () => {
    expect(isDueSoon("PENDING_HEAD", "OPEN", null, today)).toBe(false);
  });
});

describe("isComingUp (10 Analytics page per role, Principal, Orders: 'needed-by dates coming up'; plan of 6.5a, decided item 4)", () => {
  const today = "2026-10-16";

  it("today and today + 7 are coming up, today + 8 is not", () => {
    for (const status of [
      "PENDING_HEAD",
      "PENDING_PRINCIPAL",
      "PENDING_FINANCE",
      "RETURNED",
      "PURCHASING",
    ] as const) {
      expect(isComingUp(status, "OPEN", today, today), status).toBe(true);
      expect(isComingUp(status, "OPEN", "2026-10-23", today), status).toBe(true);
      expect(isComingUp(status, "OPEN", "2026-10-24", today), status).toBe(false);
    }
  });

  it("an overdue order is not coming up: the block shows it as overdue", () => {
    expect(isComingUp("PENDING_HEAD", "OPEN", "2026-10-15", today)).toBe(false);
    expect(isOverdue("PENDING_HEAD", "OPEN", "2026-10-15", today)).toBe(true);
  });

  it("no other status, a finished buying and no date are coming up", () => {
    for (const status of ["DRAFT", "SETTLEMENT", "CLOSED", "REJECTED", "CANCELLED"] as const) {
      expect(isComingUp(status, "OPEN", "2026-10-17", today), status).toBe(false);
    }
    for (const progress of ["DONE", "DONE_SHORT", "NOT_BOUGHT"] as const) {
      expect(isComingUp("PURCHASING", progress, "2026-10-17", today), progress).toBe(false);
    }
    expect(isComingUp("PENDING_HEAD", "OPEN", null, today)).toBe(false);
  });
});

describe("stuckBefore and STUCK_STATUSES (06 rule 9; 10 Notifications 'Orders waiting more than 48 hours'; plan of 6.2, decided items 1 and 2)", () => {
  const now = new Date("2026-10-21T05:00:00Z");
  const entered = (hoursAgo: number, minutes = 0) =>
    new Date(now.getTime() - (hoursAgo * 60 + minutes) * 60 * 1000);

  it("is strict: exactly 48 hours is not before the instant, 48 hours and 1 minute is", () => {
    const edge = stuckBefore(now, 48);
    expect(edge.toISOString()).toBe("2026-10-19T05:00:00.000Z");
    expect(entered(48) < edge).toBe(false);
    expect(entered(48, 1) < edge).toBe(true);
  });

  it("moves with the setting: 24 hours puts an entry 25 hours old past it", () => {
    expect(entered(25) < stuckBefore(now, 24)).toBe(true);
    expect(entered(25) < stuckBefore(now, 48)).toBe(false);
  });

  it("holds the three Waiting steps only, not Sent back, Open or Waiting for settlement", () => {
    expect([...STUCK_STATUSES]).toEqual(["PENDING_HEAD", "PENDING_PRINCIPAL", "PENDING_FINANCE"]);
    for (const status of ["RETURNED", "PURCHASING", "SETTLEMENT"] as const) {
      expect((STUCK_STATUSES as readonly string[]).includes(status)).toBe(false);
    }
  });
});
