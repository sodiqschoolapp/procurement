import { describe, expect, it } from "vitest";

import { sql } from "drizzle-orm";

import { averageHours } from "@/domain/analytics";
import { db } from "@/server/db/client";

import {
  type Move,
  type SpendingScene,
  bought,
  decided,
  movesOf,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { insertCompany } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { type AnalyticsFilters, NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";
import { PeriodRefusedError } from "../resolve-period";

import { getApprovalOrders } from "./approval-orders";
import { getApprovalSpeed } from "./approval-speed";

// The Head's Approval speed block and its drill-down (build-plan 6.4b; 10-notifications-
// analytics-reports.md, Analytics page per role, Head, Approval speed: "Average hours at each step
// per branch; orders waiting now, by age; share sent back or rejected, with the most common
// reasons", points 1 to 3; 06 Allowed moves and Statuses; plan of 6.4b, decided items 6 to 12;
// review of the plan, correction 2 and decision 6 worked through). 15 October 2031 in Tashkent:
// this month is October, the period before September. Each test reads its own scene's category.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const only = (scene: SpendingScene): AnalyticsFilters => ({
  ...NO_ANALYTICS_FILTERS,
  category: scene.category.id,
});

/** Submitted at `start`, then the Head decides `hours` later (UTC times of 2 October). */
function headStay(
  day: string,
  start: string,
  end: string,
  decision: Move["type"] = "APPROVE",
): Move[] {
  const to =
    decision === "APPROVE"
      ? "PENDING_PRINCIPAL"
      : decision === "SEND_BACK"
        ? "RETURNED"
        : "REJECTED";
  return [
    { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: `${day}T${start}:00Z` },
    {
      type: decision,
      from: "PENDING_HEAD",
      to,
      at: `${day}T${end}:00Z`,
      reason: decision === "APPROVE" ? undefined : "Narxni tekshiring",
    },
  ];
}

describe("average hours at each step per branch (decided items 6 and 7)", () => {
  it("the review's example: Principal (3 + 1.5) ÷ 2 = 2.3 h; a number equals the mean of its list", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const order = await decided(scene, "PENDING_FINANCE", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-02T04:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_HEAD",
        to: "PENDING_PRINCIPAL",
        at: "2031-10-02T05:00:00Z",
      },
      {
        type: "SEND_BACK",
        from: "PENDING_PRINCIPAL",
        to: "RETURNED",
        at: "2031-10-02T08:00:00Z",
        reason: "Miqdorni kamaytiring",
      },
      { type: "SUBMIT_AGAIN", from: "RETURNED", to: "PENDING_HEAD", at: "2031-10-02T09:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_HEAD",
        to: "PENDING_PRINCIPAL",
        at: "2031-10-02T09:30:00Z",
      },
      {
        type: "APPROVE",
        from: "PENDING_PRINCIPAL",
        to: "PENDING_FINANCE",
        at: "2031-10-02T11:00:00Z",
      },
    ]);
    // A cancelled stay is not a decision; it would make the Head's average 1.0 h if counted.
    await decided(scene, "CANCELLED", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-03T04:00:00Z" },
      {
        type: "CANCEL",
        from: "PENDING_HEAD",
        to: "CANCELLED",
        at: "2031-10-03T14:00:00Z",
        reason: "Endi kerak emas",
      },
    ]);
    await refreshNow();

    const speed = await getApprovalSpeed(head.id, THIS_MONTH, only(scene));
    const branch = speed.branches.find((row) => row.branchId === scene.branch.id)!;
    expect(branch.steps.PENDING_PRINCIPAL).toEqual({ hours: "2.3", count: 2, change: null });
    expect(branch.steps.PENDING_HEAD).toMatchObject({ hours: "0.8", count: 2 });
    expect(branch.steps.PENDING_FINANCE).toMatchObject({ hours: null, count: 0 });

    const list = await getApprovalOrders(
      head.id,
      THIS_MONTH,
      { ...only(scene), branch: scene.branch.id },
      { kind: "step", step: "PENDING_PRINCIPAL", decision: null },
      null,
      "all",
    );
    expect(list.count).toBe(2);
    expect(list.hours).toBe(branch.steps.PENDING_PRINCIPAL.hours);
    expect(list.rows.map((row) => [row.orderId, row.hours, row.decision])).toEqual([
      [order.id, "1.5", "APPROVE"],
      [order.id, "3.0", "SEND_BACK"],
    ]);
    // The Finance stay is open: waiting now, not an average.
    expect(speed.waiting.PENDING_FINANCE.all).toBe(1);
  });

  it("all branches is of every stay together, not a mean of the branch rows (review correction 2)", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const second = await spendingScene();
    const head = await insertUser("HEAD");
    await decided(scene, "PENDING_PRINCIPAL", headStay("2031-10-02", "04:00", "05:00"));
    await decided(scene, "PENDING_PRINCIPAL", headStay("2031-10-02", "04:00", "07:00"));
    await decided(second, "PENDING_PRINCIPAL", headStay("2031-10-02", "04:00", "12:00"), {
      categoryId: scene.category.id,
    });
    // September: the period before, 2.0 h in all.
    await decided(scene, "PENDING_PRINCIPAL", headStay("2031-09-10", "04:00", "06:00"));
    await refreshNow();

    const speed = await getApprovalSpeed(head.id, THIS_MONTH, only(scene));
    expect(
      speed.branches.find((row) => row.branchId === scene.branch.id)!.steps.PENDING_HEAD,
    ).toEqual({ hours: "2.0", count: 2, change: "0.0" });
    expect(
      speed.branches.find((row) => row.branchId === second.branch.id)!.steps.PENDING_HEAD,
    ).toEqual({ hours: "8.0", count: 1, change: null });
    expect(speed.all.PENDING_HEAD).toEqual({ hours: "4.0", count: 3, change: "2.0" });
    expect(averageHours(12n * 3600n, 3)).toBe(speed.all.PENDING_HEAD.hours);
  });

  it("a stay falls on the Tashkent date it ended: 19:30 UTC on 30 September is 1 October", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    await decided(scene, "PENDING_PRINCIPAL", headStay("2031-09-30", "17:30", "19:30"));
    await refreshNow();
    const speed = await getApprovalSpeed(head.id, THIS_MONTH, only(scene));
    expect(speed.all.PENDING_HEAD).toMatchObject({ hours: "2.0", count: 1 });
  });
});

describe("orders waiting now, by age (decided item 8)", () => {
  it("groups the open stays by waitingGroup() with the clock, edges strict; its list matches", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const submitted = (at: string): Move[] => [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at },
    ];
    // Exactly 48 hours, and 48 hours and one second.
    const edge = await decided(scene, "PENDING_HEAD", submitted("2031-10-13T05:00:00Z"));
    const past = await decided(scene, "PENDING_HEAD", submitted("2031-10-13T04:59:59Z"));
    await decided(scene, "PENDING_HEAD", submitted("2031-10-15T04:00:00Z"));
    await decided(scene, "PENDING_HEAD", submitted("2031-09-01T05:00:00Z"));
    // A MOVE_OWNER at the step neither starts nor ends the stay (Should fix 1).
    const moved = await decided(scene, "PENDING_HEAD", submitted("2031-10-01T05:00:00Z"));
    await movesOf(moved.id, moved.ownerId, [
      { type: "MOVE_OWNER", from: "PENDING_HEAD", to: "PENDING_HEAD", at: "2031-10-15T04:00:00Z" },
    ]);
    await refreshNow();

    const speed = await getApprovalSpeed(head.id, THIS_MONTH, only(scene));
    expect(speed.waiting.PENDING_HEAD).toEqual({ day: 1, twoDays: 1, week: 1, older: 2, all: 5 });
    expect(speed.waiting.all.all).toBe(5);

    const list = await getApprovalOrders(
      head.id,
      THIS_MONTH,
      only(scene),
      { kind: "waiting", step: "PENDING_HEAD", group: "twoDays" },
      null,
      "all",
    );
    expect(list.rows.map((row) => [row.orderId, row.hours])).toEqual([[edge.id, "48.0"]]);
    const week = await getApprovalOrders(
      head.id,
      THIS_MONTH,
      only(scene),
      { kind: "waiting", step: null, group: "week" },
      null,
      "all",
    );
    expect(week.rows.map((row) => row.orderId)).toEqual([past.id]);
  });
});

describe("share sent back or rejected, with the most common reasons (decided items 9 and 10)", () => {
  it("is of the approvers' decisions, with the change in points; reasons by reasonKey()", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    await decided(scene, "PENDING_PRINCIPAL", headStay("2031-10-02", "04:00", "05:00"));
    await decided(scene, "PENDING_PRINCIPAL", headStay("2031-10-02", "04:00", "05:00"));
    const back = await decided(scene, "RETURNED", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-02T04:00:00Z" },
      {
        type: "SEND_BACK",
        from: "PENDING_HEAD",
        to: "RETURNED",
        at: "2031-10-02T05:00:00Z",
        reason: "narxni  tekshiring",
      },
    ]);
    await decided(scene, "RETURNED", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-03T04:00:00Z" },
      {
        type: "SEND_BACK",
        from: "PENDING_HEAD",
        to: "RETURNED",
        at: "2031-10-03T05:00:00Z",
        reason: "Narxni tekshiring",
      },
    ]);
    await decided(scene, "REJECTED", headStay("2031-10-04", "04:00", "05:00", "REJECT"));
    // September: 1 decision, a send back of 100 %.
    await decided(scene, "RETURNED", headStay("2031-09-04", "04:00", "05:00", "SEND_BACK"));
    await refreshNow();

    const speed = await getApprovalSpeed(head.id, THIS_MONTH, only(scene));
    expect(speed.shares.PENDING_HEAD).toEqual({
      decisions: 5,
      sentBack: { count: 2, share: "40.0", change: "-60.0" },
      rejected: { count: 1, share: "20.0", change: "20.0" },
    });
    expect(speed.shares.all).toEqual(speed.shares.PENDING_HEAD);
    expect(speed.shares.PENDING_PRINCIPAL.decisions).toBe(0);
    expect(speed.reasons.SEND_BACK).toEqual([
      {
        key: "narxni tekshiring",
        text: "Narxni tekshiring",
        count: 2,
        change: { difference: 1n, percent: "100.0" },
      },
    ]);
    expect(speed.reasons.REJECT.map((reason) => reason.count)).toEqual([1]);

    // A reason's list: its decisions, the newest first.
    const list = await getApprovalOrders(
      head.id,
      THIS_MONTH,
      only(scene),
      { kind: "step", step: null, decision: "SEND_BACK" },
      "narxni tekshiring",
      "all",
    );
    expect(list.count).toBe(2);
    expect(list.rows.at(-1)!.orderId).toBe(back.id);
  });

  it("the supplier filter keeps an order with a live record from that supplier (decided item 11)", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const unused = await insertCompany();
    const order = await bought(scene, { purchasedOn: "2031-10-05" });
    await movesOf(order.orderId, order.ownerId, [...headStay("2031-10-02", "04:00", "05:00")]);
    await decided(scene, "PENDING_PRINCIPAL", headStay("2031-10-02", "04:00", "06:00"));
    await refreshNow();
    const kept = await getApprovalSpeed(head.id, THIS_MONTH, {
      ...only(scene),
      supplier: scene.supplier.id,
    });
    expect(kept.all.PENDING_HEAD).toMatchObject({ hours: "1.0", count: 1 });
    const none = await getApprovalSpeed(head.id, THIS_MONTH, {
      ...only(scene),
      supplier: unused.id,
    });
    expect(none.all.PENDING_HEAD.count).toBe(0);
  });
});

describe("the walls (03 rule 1; 06 Statuses; review of the plan, Must fix 4; D40)", () => {
  it("never counts another branch's stays beside the user's", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const second = await spendingScene();
    await decided(scene, "PENDING_PRINCIPAL", headStay("2031-10-02", "04:00", "05:00"));
    await decided(second, "PENDING_PRINCIPAL", headStay("2031-10-02", "04:00", "09:00"), {
      categoryId: scene.category.id,
    });
    await decided(
      second,
      "PENDING_HEAD",
      [{ type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-14T05:00:00Z" }],
      { categoryId: scene.category.id },
    );
    await refreshNow();
    const speed = await getApprovalSpeed(scene.manager.id, THIS_MONTH, only(scene));
    expect(speed.branches.map((row) => row.branchId)).toEqual([scene.branch.id]);
    expect(speed.all.PENDING_HEAD).toMatchObject({ hours: "1.0", count: 1 });
    // Only the user's own order waits (at Principal); the other branch's two never count.
    expect(speed.waiting.all.all).toBe(1);
    expect(speed.waiting.PENDING_PRINCIPAL.all).toBe(1);
    expect(speed.waiting.PENDING_HEAD.all).toBe(0);
  });

  it("a taken-back Draft's stays count for the Head and for its owner, not for another user of the branch", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const principal = await insertUser("PRINCIPAL", { branches: [scene.branch.id] });
    // Send back, submit again, take back: a Draft with its number and a decided stay.
    const draft = await decided(scene, "DRAFT", [
      ...headStay("2031-10-02", "04:00", "07:00", "SEND_BACK"),
      { type: "SUBMIT_AGAIN", from: "RETURNED", to: "PENDING_HEAD", at: "2031-10-02T08:00:00Z" },
      { type: "TAKE_BACK", from: "PENDING_HEAD", to: "DRAFT", at: "2031-10-02T09:00:00Z" },
    ]);
    // The same history on an order that is not a Draft: it stays in everyone's numbers.
    await decided(scene, "RETURNED", headStay("2031-10-02", "04:00", "05:00", "SEND_BACK"));
    await refreshNow();

    const key = { kind: "step", step: "PENDING_HEAD", decision: null } as const;
    const forHead = await getApprovalSpeed(head.id, THIS_MONTH, only(scene));
    expect(forHead.all.PENDING_HEAD).toMatchObject({ hours: "2.0", count: 2 });
    const headList = await getApprovalOrders(head.id, THIS_MONTH, only(scene), key, null, "all");
    expect(headList.rows.map((row) => row.orderId)).toContain(draft.id);

    const forOwner = await getApprovalSpeed(scene.manager.id, THIS_MONTH, only(scene));
    expect(forOwner.all.PENDING_HEAD.count).toBe(2);

    const forPrincipal = await getApprovalSpeed(principal.id, THIS_MONTH, only(scene));
    expect(forPrincipal.all.PENDING_HEAD).toMatchObject({ hours: "1.0", count: 1 });
    expect(forPrincipal.shares.all.sentBack.count).toBe(1);
    expect(forPrincipal.reasons.SEND_BACK.map((reason) => reason.count)).toEqual([1]);
    const principalList = await getApprovalOrders(
      principal.id,
      THIS_MONTH,
      only(scene),
      key,
      null,
      "all",
    );
    expect(principalList.count).toBe(1);
    expect(principalList.rows.map((row) => row.orderId)).not.toContain(draft.id);
  });

  it("an open stay of an order taken back to Draft since the last refresh counts for its owner and the Head only (permission review, Must fix 2)", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const principal = await insertUser("PRINCIPAL", { branches: [scene.branch.id] });
    const order = await decided(scene, "PENDING_HEAD", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-15T04:00:00Z" },
    ]);
    // The same open stay on an order still waiting: it stays in everyone's numbers.
    const kept = await decided(scene, "PENDING_HEAD", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-15T04:00:00Z" },
    ]);
    await refreshNow();
    // Taken back after the refresh: the summary still holds its open stay.
    await movesOf(order.id, order.ownerId, [
      { type: "TAKE_BACK", from: "PENDING_HEAD", to: "DRAFT", at: "2031-10-15T04:30:00Z" },
    ]);
    await db.execute(sql`update orders set status = 'DRAFT' where id = ${order.id}`);

    const key = { kind: "waiting", step: null, group: null } as const;
    for (const [user, expected] of [
      [head.id, [order.id, kept.id]],
      [scene.manager.id, [order.id, kept.id]],
      [principal.id, [kept.id]],
    ] as const) {
      const speed = await getApprovalSpeed(user, THIS_MONTH, only(scene));
      expect(speed.waiting.all.all).toBe(expected.length);
      const list = await getApprovalOrders(user, THIS_MONTH, only(scene), key, null, "all");
      expect(new Set(list.rows.map((row) => row.orderId))).toEqual(new Set(expected));
    }
  });

  it("a key of another block names no Approval speed list", async () => {
    const head = await insertUser("HEAD");
    await expect(
      getApprovalOrders(head.id, THIS_MONTH, NO_ANALYTICS_FILTERS, { kind: "period" }, null, 1),
    ).rejects.toBeInstanceOf(PeriodRefusedError);
    await expect(
      getApprovalOrders(
        head.id,
        THIS_MONTH,
        NO_ANALYTICS_FILTERS,
        { kind: "step", step: null, decision: "APPROVE" },
        "narxi qimmat",
        1,
      ),
    ).rejects.toBeInstanceOf(PeriodRefusedError);
  });
});
