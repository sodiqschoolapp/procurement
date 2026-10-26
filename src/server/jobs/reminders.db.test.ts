import { randomUUID } from "node:crypto";

import { and, eq, notInArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import type { RequestStatus } from "@/domain/request-status";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { notifications, orderActions, orderEvents, orders, settings } from "@/server/db/schema";

import { insertBranch } from "../../../tests/helpers/branches";
import { advanceClock, setClock } from "../../../tests/helpers/clock";
import { insertOrder } from "../../../tests/helpers/orders";
import { insertUser } from "../../../tests/helpers/users";
import { JOBS } from "./registry";
import { reminders } from "./reminders";
import { runDueJobs } from "./run-due";

// The reminders job (build-plan 8.1, Done when: "at 24 hours and 1 minute the approvers have a
// reminder; at 48 hours and 1 minute the Head has one"; 06-approval-workflow.md rule 9; 10-
// notifications-analytics-reports.md, Notifications; 16-build-order.md, phase 8 check; plan of
// 8.1 and its review corrections 1 to 3).
//
// The tests of this file share one database, and the Head counts every branch: after each test its
// orders leave the counted statuses, so no test counts another's.

type EventType = (typeof orderEvents.$inferInsert)["type"];

afterEach(async () => {
  await db
    .update(orders)
    .set({ status: "CANCELLED", progress: "OPEN" })
    .where(notInArray(orders.status, ["DRAFT", "CLOSED", "REJECTED", "CANCELLED"]));
});

async function scene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  return { branch, manager };
}

/** An order of `status` that entered it by `type` from `from` at the clock's moment. */
async function entered(
  where: { branchId: string; ownerId: string },
  status: RequestStatus,
  type: EventType,
  from: RequestStatus,
  extra: { neededBy?: string; progress?: "OPEN" | "DONE" } = {},
) {
  const order = await insertOrder({ ...where, status, ...extra });
  await enter(order.id, where.ownerId, type, from, status);
  return order;
}

async function enter(
  orderId: string,
  actorId: string,
  type: EventType,
  fromStatus: RequestStatus,
  toStatus: RequestStatus,
) {
  const [action] = await db
    .insert(orderActions)
    .values({ clientKey: randomUUID(), type, actorId, orderCount: 1, createdAt: now() })
    .returning({ id: orderActions.id });
  await db.insert(orderEvents).values({
    orderId,
    actionId: action!.id,
    type,
    fromStatus,
    toStatus,
    actorId,
    createdAt: now(),
  });
  if (fromStatus !== toStatus) {
    await db.update(orders).set({ status: toStatus }).where(eq(orders.id, orderId));
  }
}

/** Runs the job at the clock's moment; the fixture asserts it ran (D38). */
async function run() {
  expect(await runDueJobs([reminders])).toEqual({ reminders: "ran" });
}

/** The notices of one type a user has, as `{ params, link }`. */
async function noticesOf(userId: string, type: (typeof notifications.$inferSelect)["type"]) {
  return db
    .select({ params: notifications.params, link: notifications.link })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));
}

async function setSetting(key: "reminder_hours" | "escalation_hours", value: number) {
  await db
    .insert(settings)
    .values({ key, value, createdAt: now() })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

describe("reminders (06 rule 9; 10 Notifications)", () => {
  it("is a job of the registry, once a day (plan of 8.1, decided item 5)", () => {
    expect(JOBS).toContain(reminders);
    expect(reminders.schedule).toEqual({ everyMinutes: 1440 });
  });

  it("Done when: at 24 hours and 1 minute the Principal of the branch has a reminder; at exactly 24 hours not; another branch's Principal none (16 phase 8 check; 03 rule 1)", async () => {
    setClock("2031-01-10T07:00:00Z");
    const { branch, manager } = await scene();
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const inactivePrincipal = await insertUser("PRINCIPAL", {
      branches: [branch.id],
      isActive: false,
    });
    const other = await scene();
    const otherPrincipal = await insertUser("PRINCIPAL", { branches: [other.branch.id] });

    setClock("2031-01-11T06:59:00Z");
    await entered(
      { branchId: branch.id, ownerId: manager.id },
      "PENDING_PRINCIPAL",
      "APPROVE",
      "PENDING_HEAD",
    );
    setClock("2031-01-11T07:00:00Z");
    await entered(
      { branchId: branch.id, ownerId: manager.id },
      "PENDING_PRINCIPAL",
      "APPROVE",
      "PENDING_HEAD",
    );
    // Another branch's order waiting as long: told only to its own Principal.
    setClock("2031-01-11T06:59:00Z");
    await entered(
      { branchId: other.branch.id, ownerId: other.manager.id },
      "PENDING_PRINCIPAL",
      "APPROVE",
      "PENDING_HEAD",
    );

    setClock("2031-01-12T07:00:00Z");
    await run();
    expect(await noticesOf(principal.id, "REQUEST_WAITING_24H")).toEqual([
      { params: { count: 1, hours: 24 }, link: "/orders?status=PENDING_PRINCIPAL" },
    ]);
    expect(await noticesOf(inactivePrincipal.id, "REQUEST_WAITING_24H")).toEqual([]);
    expect(await noticesOf(otherPrincipal.id, "REQUEST_WAITING_24H")).toEqual([
      { params: { count: 1, hours: 24 }, link: "/orders?status=PENDING_PRINCIPAL" },
    ]);
  });

  it("tells the active Finance users of the branch of Waiting for Finance only, not Waiting for settlement or Sent back; every active Head of Waiting for Head of every branch; nobody else (06 Statuses; review correction 1; permission review Should fix 1 to 3; D40)", async () => {
    setClock("2031-02-07T07:00:00Z");
    const { branch, manager } = await scene();
    const other = await scene();
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    const inactiveFinance = await insertUser("FINANCE", { branches: [branch.id], isActive: false });
    const otherFinance = await insertUser("FINANCE", { branches: [other.branch.id] });
    const head1 = await insertUser("HEAD");
    const head2 = await insertUser("HEAD");
    const inactiveHead = await insertUser("HEAD", { isActive: false });
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const where = { branchId: branch.id, ownerId: manager.id };

    // Three days ago: one Waiting for Finance; Waiting for settlement and Sent back, whose
    // waitingFor() is Finance and the owner, beside it.
    await entered(where, "PENDING_FINANCE", "APPROVE", "PENDING_PRINCIPAL");
    await entered(where, "SETTLEMENT", "SEND_TO_SETTLEMENT", "PURCHASING");
    await entered(where, "RETURNED", "SEND_BACK", "PENDING_FINANCE");
    // 24 h 1 min before the run: Waiting for Head.
    setClock("2031-02-09T06:59:00Z");
    await entered(where, "PENDING_HEAD", "SUBMIT", "DRAFT");
    await entered(
      { branchId: other.branch.id, ownerId: other.manager.id },
      "PENDING_HEAD",
      "SUBMIT",
      "DRAFT",
    );

    setClock("2031-02-10T07:00:00Z");
    await run();
    expect(await noticesOf(finance.id, "REQUEST_WAITING_24H")).toEqual([
      { params: { count: 1, hours: 24 }, link: "/orders?status=PENDING_FINANCE" },
    ]);
    expect(await noticesOf(inactiveFinance.id, "REQUEST_WAITING_24H")).toEqual([]);
    expect(await noticesOf(otherFinance.id, "REQUEST_WAITING_24H")).toEqual([]);
    for (const head of [head1, head2]) {
      expect(await noticesOf(head.id, "REQUEST_WAITING_24H")).toEqual([
        { params: { count: 2, hours: 24 }, link: "/orders?status=PENDING_HEAD" },
      ]);
    }
    expect(await noticesOf(inactiveHead.id, "REQUEST_WAITING_24H")).toEqual([]);
    // Not approvers of these steps: the owner, the Principal at Waiting for Finance; and the
    // Head's notice of all branches reaches no Finance user or Principal, although the Finance
    // order has waited three days (permission review of 8.1, Should fix 1).
    for (const user of [manager, principal, finance]) {
      expect(await noticesOf(user.id, "REQUEST_WAITING_48H"), user.role).toEqual([]);
    }
    for (const user of [manager, principal]) {
      expect(await noticesOf(user.id, "REQUEST_WAITING_24H"), user.role).toEqual([]);
    }
    expect(await noticesOf(inactiveHead.id, "REQUEST_WAITING_48H")).toEqual([]);
  });

  it("Done when: at 48 hours and 1 minute every active Head has the notice, of every Waiting step; at 47 h 59 min not; Sent back, Open and Waiting for settlement not (06 rule 9; plan of 6.2, decided item 1)", async () => {
    setClock("2031-03-07T07:00:00Z");
    const { branch, manager } = await scene();
    const other = await scene();
    const head = await insertUser("HEAD");
    const inactiveHead = await insertUser("HEAD", { isActive: false });
    const where = { branchId: branch.id, ownerId: manager.id };

    // Three days before the run: not Waiting steps.
    await entered(where, "RETURNED", "SEND_BACK", "PENDING_HEAD");
    await entered(where, "PURCHASING", "APPROVE", "PENDING_FINANCE");
    await entered(where, "SETTLEMENT", "SEND_TO_SETTLEMENT", "PURCHASING");
    // 48 h 1 min before: one at each Waiting step, one in another branch.
    setClock("2031-03-08T06:59:00Z");
    await entered(where, "PENDING_HEAD", "SUBMIT", "DRAFT");
    await entered(where, "PENDING_PRINCIPAL", "APPROVE", "PENDING_HEAD");
    await entered(
      { branchId: other.branch.id, ownerId: other.manager.id },
      "PENDING_FINANCE",
      "APPROVE",
      "PENDING_PRINCIPAL",
    );
    // 47 h 59 min before.
    setClock("2031-03-08T07:01:00Z");
    await entered(where, "PENDING_FINANCE", "APPROVE", "PENDING_PRINCIPAL");

    setClock("2031-03-10T07:00:00Z");
    await run();
    expect(await noticesOf(head.id, "REQUEST_WAITING_48H")).toEqual([
      { params: { count: 3, hours: 48 }, link: "/orders?stuck=1" },
    ]);
    expect(await noticesOf(inactiveHead.id, "REQUEST_WAITING_48H")).toEqual([]);
  });

  it("groups a Finance user's orders of two branches in one notice; a Finance user of one branch counts that branch only (10: grouped; 03 rule 1; decided item 6)", async () => {
    setClock("2031-04-07T07:00:00Z");
    const a = await scene();
    const b = await scene();
    const both = await insertUser("FINANCE", { branches: [a.branch.id, b.branch.id] });
    const onlyB = await insertUser("FINANCE", { branches: [b.branch.id] });
    for (const { branch, manager } of [a, a, b]) {
      await entered(
        { branchId: branch.id, ownerId: manager.id },
        "PENDING_FINANCE",
        "APPROVE",
        "PENDING_PRINCIPAL",
      );
    }

    setClock("2031-04-08T08:00:00Z");
    await run();
    expect(await noticesOf(both.id, "REQUEST_WAITING_24H")).toEqual([
      { params: { count: 3, hours: 24 }, link: "/orders?status=PENDING_FINANCE" },
    ]);
    expect(await noticesOf(onlyB.id, "REQUEST_WAITING_24H")).toEqual([
      { params: { count: 1, hours: 24 }, link: "/orders?status=PENDING_FINANCE" },
    ]);
  });

  it("reads the hours from the settings in force (14 settings keys; 06 rule 9: 'Both numbers are settings')", async () => {
    setClock("2031-05-07T07:00:00Z");
    const { branch, manager } = await scene();
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const head = await insertUser("HEAD");
    await entered(
      { branchId: branch.id, ownerId: manager.id },
      "PENDING_PRINCIPAL",
      "APPROVE",
      "PENDING_HEAD",
    );

    await setSetting("reminder_hours", 36);
    await setSetting("escalation_hours", 40);
    try {
      setClock("2031-05-08T07:01:00Z");
      await run();
      expect(await noticesOf(principal.id, "REQUEST_WAITING_24H")).toEqual([]);

      setClock("2031-05-09T07:01:00Z");
      await run();
      expect(await noticesOf(principal.id, "REQUEST_WAITING_24H")).toEqual([
        { params: { count: 1, hours: 36 }, link: "/orders?status=PENDING_PRINCIPAL" },
      ]);
      expect(await noticesOf(head.id, "REQUEST_WAITING_48H")).toEqual([
        { params: { count: 1, hours: 40 }, link: "/orders?stuck=1" },
      ]);
    } finally {
      await setSetting("reminder_hours", 24);
      await setSetting("escalation_hours", 48);
    }
  });

  it("measures the wait from the newest entry into the current status, for both notices; a move to another Manager does not restart it (progress of 2.11 and 6.2; decided item 4; review correction 3)", async () => {
    setClock("2031-06-01T07:00:00Z");
    const { branch, manager } = await scene();
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const head = await insertUser("HEAD");
    const where = { branchId: branch.id, ownerId: manager.id };

    // Submitted five days before the run, sent back, submitted again 2 h before it.
    const resubmitted = await entered(where, "PENDING_HEAD", "SUBMIT", "DRAFT");
    await enter(resubmitted.id, manager.id, "APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL");
    advanceClock({ hours: 30 });
    await enter(resubmitted.id, manager.id, "SEND_BACK", "PENDING_PRINCIPAL", "RETURNED");
    // Waiting for Principal three days; moved to another Manager 1 h before the run.
    setClock("2031-06-03T07:00:00Z");
    const moved = await entered(where, "PENDING_PRINCIPAL", "APPROVE", "PENDING_HEAD");
    setClock("2031-06-06T05:00:00Z");
    await enter(resubmitted.id, manager.id, "SUBMIT_AGAIN", "RETURNED", "PENDING_HEAD");
    setClock("2031-06-06T06:00:00Z");
    await enter(moved.id, manager.id, "MOVE_OWNER", "PENDING_PRINCIPAL", "PENDING_PRINCIPAL");

    setClock("2031-06-06T07:00:00Z");
    await run();
    expect(await noticesOf(head.id, "REQUEST_WAITING_24H")).toEqual([]);
    expect(await noticesOf(head.id, "REQUEST_WAITING_48H")).toEqual([
      { params: { count: 1, hours: 48 }, link: "/orders?stuck=1" },
    ]);
    expect(await noticesOf(principal.id, "REQUEST_WAITING_24H")).toEqual([
      { params: { count: 1, hours: 24 }, link: "/orders?status=PENDING_PRINCIPAL" },
    ]);
  });

  it("tells once per day, and again the next day while the orders wait (10: 'once a day'; open question 7, decided item 1, Look first)", async () => {
    setClock("2031-07-01T07:00:00Z");
    const { branch, manager } = await scene();
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    await entered(
      { branchId: branch.id, ownerId: manager.id },
      "PENDING_PRINCIPAL",
      "APPROVE",
      "PENDING_HEAD",
    );

    setClock("2031-07-02T08:00:00Z");
    await run();
    setClock("2031-07-02T15:00:00Z");
    expect(await runDueJobs([reminders])).toEqual({ reminders: "not_due" });
    expect(await noticesOf(principal.id, "REQUEST_WAITING_24H")).toHaveLength(1);

    // 00:30 Tashkent the next day: a new tick.
    setClock("2031-07-02T19:30:00Z");
    await run();
    expect(await noticesOf(principal.id, "REQUEST_WAITING_24H")).toHaveLength(2);
  });

  it("tells the owner of orders needed by today to today + 2 whose buying is not finished, one notice per branch; not a finished, closed, draft, later or overdue one; not an owner outside the order's branch (10 Notifications; decided item 7, Look first; review correction 2; D40)", async () => {
    // 12:00 in Tashkent on 10.08.2031.
    setClock("2031-08-10T07:00:00Z");
    const { branch, manager } = await scene();
    const other = await scene();
    await insertUser("FINANCE", { branches: [branch.id] });
    const where = { branchId: branch.id, ownerId: manager.id };
    const order = (status: RequestStatus, neededBy: string, progress: "OPEN" | "DONE" = "OPEN") =>
      insertOrder({ ...where, status, neededBy, progress });

    await order("PENDING_FINANCE", "2031-08-12");
    await order("RETURNED", "2031-08-11");
    await order("PURCHASING", "2031-08-10");
    // Kept out, each with every other value that would let it in.
    await order("PURCHASING", "2031-08-11", "DONE");
    await order("CLOSED", "2031-08-11");
    await order("DRAFT", "2031-08-11");
    await order("PENDING_HEAD", "2031-08-13");
    await order("PENDING_HEAD", "2031-08-09");
    // The same owner's order in another branch: its own notice with that branch's code.
    const memberOfBoth = await insertUser("MANAGER", { branches: [branch.id, other.branch.id] });
    await insertOrder({
      branchId: branch.id,
      ownerId: memberOfBoth.id,
      status: "PENDING_HEAD",
      neededBy: "2031-08-11",
    });
    await insertOrder({
      branchId: other.branch.id,
      ownerId: memberOfBoth.id,
      status: "PENDING_HEAD",
      neededBy: "2031-08-12",
    });
    // An owner no longer of the order's branch, and a deactivated owner: told nothing.
    const outsider = await insertUser("MANAGER", { branches: [other.branch.id] });
    await insertOrder({
      branchId: branch.id,
      ownerId: outsider.id,
      status: "PENDING_HEAD",
      neededBy: "2031-08-11",
    });
    const gone = await insertUser("MANAGER", { branches: [branch.id], isActive: false });
    await insertOrder({
      branchId: branch.id,
      ownerId: gone.id,
      status: "PENDING_HEAD",
      neededBy: "2031-08-11",
    });

    await run();
    expect(await noticesOf(manager.id, "NEEDED_BY_NEAR")).toEqual([
      {
        params: { count: 3, branch: branch.code },
        link: `/orders?branch=${branch.id}&owner=${manager.id}&due=soon`,
      },
    ]);
    const both = await noticesOf(memberOfBoth.id, "NEEDED_BY_NEAR");
    expect(both).toHaveLength(2);
    expect(both.map((notice) => notice.params)).toEqual(
      expect.arrayContaining([
        { count: 1, branch: branch.code },
        { count: 1, branch: other.branch.code },
      ]),
    );
    expect(await noticesOf(outsider.id, "NEEDED_BY_NEAR")).toEqual([]);
    expect(await noticesOf(gone.id, "NEEDED_BY_NEAR")).toEqual([]);
  });

  it("writes no notification when nothing waits (decided item 9)", async () => {
    setClock("2031-09-10T07:00:00Z");
    const { branch, manager } = await scene();
    await insertUser("HEAD");
    // Waiting 23 h, needed by in 3 days.
    setClock("2031-09-09T08:00:00Z");
    await entered(
      { branchId: branch.id, ownerId: manager.id },
      "PENDING_PRINCIPAL",
      "APPROVE",
      "PENDING_HEAD",
      {
        neededBy: "2031-09-13",
      },
    );
    const before = await db.$count(notifications);
    setClock("2031-09-10T07:00:00Z");
    await run();
    expect(await db.$count(notifications)).toBe(before);
  });
});

// Last in the file: the job runs once per slot, so a later clock goes after every earlier test.
describe("due-soon reminders and the needed-by date the Head may hide (10 Notifications)", () => {
  it("an order without a needed-by date sends no due-soon reminder; the same order needed tomorrow does (05 Fields the Head sets 3; plan of 2.5d)", async () => {
    setClock("2031-10-10T07:00:00Z");
    const { branch, manager } = await scene();
    const where = { branchId: branch.id, ownerId: manager.id, status: "PENDING_HEAD" as const };
    await insertOrder({ ...where, neededBy: null, departmentId: null });
    await insertOrder({ ...where, neededBy: "2031-10-11" });
    await run();
    // One order counted: the dated one.
    expect(await noticesOf(manager.id, "NEEDED_BY_NEAR")).toEqual([
      expect.objectContaining({ params: { count: 1, branch: branch.code } }),
    ]);
  });
});
