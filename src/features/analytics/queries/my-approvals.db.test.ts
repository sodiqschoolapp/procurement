import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  type SpendingScene,
  decided,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { type AnalyticsFilters, NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getApprovalOrders } from "./approval-orders";
import { getMyApprovals } from "./my-approvals";

// The Principal's My approvals block and its list (build-plan 6.5a; 10-notifications-analytics-
// reports.md, Analytics page per role, Principal, My approvals: "Waiting now; my average time to
// decide", points 1 and 3; 03 rule 3: "past approvals keep the old name"; plan of 6.5a, decided
// items 3 and 5, review decision 3 worked through). 15 October 2031 in Tashkent: this month is
// October, the period before September.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const TODAY = "2031-10-15T05:00:00Z";

let scene: SpendingScene;
let principal: string;
let earlier: string;
let filters: AnalyticsFilters;
const mine: string[] = [];

/** An order that reached Waiting for Principal at `entered` and was decided by `by` at `left`. */
async function stay(entered: string, left: string | null, by: string) {
  const order = await decided(scene, left ? "PENDING_FINANCE" : "PENDING_PRINCIPAL", [
    { type: "SUBMIT", from: "DRAFT", to: "PENDING_PRINCIPAL", at: entered },
    ...(left
      ? [
          {
            type: "APPROVE" as const,
            from: "PENDING_PRINCIPAL" as const,
            to: "PENDING_FINANCE" as const,
            at: left,
            actorId: by,
          },
        ]
      : []),
  ]);
  return order.id;
}

beforeAll(async () => {
  setClock(TODAY);
  scene = await spendingScene();
  principal = (await insertUser("PRINCIPAL", { branches: [scene.branch.id] })).id;
  // The branch's earlier Principal, now of another branch: the decisions keep that name.
  earlier = (await insertUser("PRINCIPAL")).id;
  filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
  // Mine in October: 1 h and 4 h, one of them entered under the earlier Principal (decided item 3):
  // 5 h over 2 is 2.5 h, never a mean of means.
  mine.push(await stay("2031-10-02T05:00:00Z", "2031-10-02T06:00:00Z", principal));
  mine.push(await stay("2031-10-03T05:00:00Z", "2031-10-03T09:00:00Z", principal));
  // Mine in September: 2 h. The change is 2.5 − 2.0.
  await stay("2031-09-10T05:00:00Z", "2031-09-10T07:00:00Z", principal);
  // The earlier Principal's, in October, in this branch: not mine.
  await stay("2031-10-04T05:00:00Z", "2031-10-04T15:00:00Z", earlier);
  // Waiting now: 3 hours, 30 hours and 10 days.
  await stay("2031-10-15T02:00:00Z", null, principal);
  await stay("2031-10-13T23:00:00Z", null, principal);
  await stay("2031-10-05T05:00:00Z", null, principal);
  // Waiting at another step, and in another branch: not waiting for me.
  await decided(scene, "PENDING_HEAD", [
    { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-14T05:00:00Z" },
  ]);
  const other = await spendingScene();
  await decided(other, "PENDING_PRINCIPAL", [
    { type: "SUBMIT", from: "DRAFT", to: "PENDING_PRINCIPAL", at: "2031-10-14T05:00:00Z" },
  ]);
  await refreshNow();
});

beforeEach(() => setClock(TODAY));

describe("getMyApprovals (10 Principal, My approvals; plan of 6.5a, decided items 3 and 5)", () => {
  it("my average is Σ seconds over the count of the stays I decided in the period, its change in hours", async () => {
    const block = await getMyApprovals(principal, THIS_MONTH, filters);
    expect(block.mine).toEqual({ hours: "2.5", count: 2, change: "0.5" });
  });

  it("the earlier Principal, now of another branch, no longer sees this branch's decisions (03 rule 1)", async () => {
    const theirs = await getMyApprovals(earlier, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(theirs.mine).toEqual({ hours: null, count: 0, change: null });
  });

  it("waiting now is the orders at Waiting for Principal of my branch, by age, whatever the period", async () => {
    const expected = { day: 1, twoDays: 1, week: 0, older: 1, all: 3 };
    expect((await getMyApprovals(principal, THIS_MONTH, filters)).waiting).toEqual(expected);
    expect(
      (await getMyApprovals(principal, { choice: "last_month", from: null, to: null }, filters))
        .waiting,
    ).toEqual(expected);
    expect((await getMyApprovals(principal, THIS_MONTH, NO_ANALYTICS_FILTERS)).waiting).toEqual(
      expected,
    );
  });

  it("no decision in the period: no average and no change", async () => {
    const block = await getMyApprovals(
      principal,
      { choice: "custom", from: "2031-08-01", to: "2031-08-31" },
      filters,
    );
    expect(block.mine).toEqual({ hours: null, count: 0, change: null });
  });
});

describe("the list of my decisions, key `mine` (10 point 3)", () => {
  it("lists the stays I decided in the period, its count and hours the number clicked", async () => {
    const list = await getApprovalOrders(
      principal,
      THIS_MONTH,
      filters,
      { kind: "mine" },
      null,
      "all",
    );
    expect(list.count).toBe(2);
    expect(list.hours).toBe("2.5");
    expect(new Set(list.rows.map((row) => row.orderId))).toEqual(new Set(mine));
  });
});
