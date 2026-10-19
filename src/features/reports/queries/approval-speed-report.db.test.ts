import { describe, expect, it } from "vitest";

import { averageHours } from "@/domain/analytics";
import { AuthorizationError } from "@/server/authorize";

import { type Move, decided, refreshNow, spendingScene } from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { setOrderStatus } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS } from "../../analytics/period-params";

import { getApprovalSpeedReport } from "./approval-speed-report";

// The Approval speed report (build-plan 6.9b, Done when: "the branch wall on each of the three
// reports"; 10-notifications-analytics-reports.md, Reports: "Average hours an order waits at each
// step"; 06-approval-workflow.md, Statuses; plan of 6.9b, decided items 4 and 11, Look first;
// review of the plan, decision 4 worked through and Should fix 2). 15 October 2031 in Tashkent;
// two branches share one category, read with it, so no other test's stays come in.

const OCTOBER = { first: "2031-10-01", last: "2031-10-15" };

async function twoBranches() {
  setClock("2031-10-15T05:00:00Z");
  const a = await spendingScene();
  const b = await spendingScene();
  const principal = await insertUser("PRINCIPAL", { branches: [a.branch.id] });
  const head = await insertUser("HEAD");
  const params = (branch: string | null = null) => ({
    range: OCTOBER,
    filters: { ...NO_ANALYTICS_FILTERS, branch, category: a.category.id },
  });
  return { a, b, principal, head, params };
}

/** Submitted and approved by the Head on `day`, then `hours` at the Principal step until approved. */
function principalStay(day: string, hours: number): Move[] {
  const arrived = new Date(`${day}T04:00:00Z`);
  const left = new Date(arrived.getTime() + hours * 3_600_000);
  return [
    { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: `${day}T03:00:00Z` },
    { type: "APPROVE", from: "PENDING_HEAD", to: "PENDING_PRINCIPAL", at: arrived.toISOString() },
    { type: "APPROVE", from: "PENDING_PRINCIPAL", to: "PENDING_FINANCE", at: left.toISOString() },
  ];
}

describe("Approval speed: the branch wall (03 rule 1; 10 Reports: respects the user's branches)", () => {
  it("averages each set of its own stays, the All row never a mean of the branch rows, and shows a Principal only their branch", async () => {
    const { a, b, principal, head, params } = await twoBranches();
    const category = a.category.id;
    const inA = await decided(a, "PENDING_FINANCE", principalStay("2031-10-02", 30));
    await decided(b, "PENDING_FINANCE", principalStay("2031-10-03", 2), { categoryId: category });
    await decided(b, "PENDING_FINANCE", principalStay("2031-10-04", 4), { categoryId: category });
    await refreshNow();

    // The worked numbers of the plan review: A 30.0, B 3.0, all (30 + 2 + 4) / 3 = 12.0, not 16.5.
    const report = await getApprovalSpeedReport(head.id, params(), "all");
    const step = (row: { steps: Record<string, { hours: string | null; count: number }> }) => [
      row.steps.PENDING_PRINCIPAL!.hours,
      row.steps.PENDING_PRINCIPAL!.count,
    ];
    expect(Object.fromEntries(report.branches.map((row) => [row.branchId, step(row)]))).toEqual({
      [a.branch.id]: ["30.0", 1],
      [b.branch.id]: ["3.0", 2],
    });
    expect(step({ steps: report.all })).toEqual([averageHours(36n * 3600n, 3), 3]);
    expect(report.all.PENDING_PRINCIPAL.hours).toBe("12.0");

    const own = await getApprovalSpeedReport(principal.id, params(), "all");
    expect(own.branches.map((row) => row.branchId)).toEqual([a.branch.id]);
    expect(own.all.PENDING_PRINCIPAL).toEqual({ hours: "30.0", count: 1 });
    // Every stay listed is of branch A's order: its Head step of 1 hour and its Principal step.
    expect(own.stays.filter((row) => row.step === "PENDING_PRINCIPAL")).toEqual([
      expect.objectContaining({ orderId: inA.id, hours: "30.0", decision: "APPROVE" }),
    ]);
    expect(own.stays.every((row) => row.orderId === inA.id)).toBe(true);

    await expect(
      getApprovalSpeedReport(principal.id, params(b.branch.id), "all"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("keeps a Draft taken back after its stays were summarised to its owner and the Head (06 Statuses; review, Should fix 2)", async () => {
    const { a, principal, head, params } = await twoBranches();
    const order = await decided(a, "PENDING_FINANCE", principalStay("2031-10-05", 6));
    await refreshNow();
    // Taken back to Draft after the refresh: the summary still holds its stays.
    await setOrderStatus(order.id, "DRAFT");
    const sees = async (userId: string) =>
      (await getApprovalSpeedReport(userId, params(), "all")).stays.some(
        (row) => row.orderId === order.id,
      );
    expect(await sees(head.id)).toBe(true);
    expect(await sees(order.ownerId)).toBe(true);
    expect(await sees(principal.id)).toBe(false);
    // A colleague Manager and Finance of the same branch: not the owner, so not seen
    // (permission review of 6.9b, Should fix 2).
    const colleague = await insertUser("MANAGER", { branches: [a.branch.id] });
    const finance = await insertUser("FINANCE", { branches: [a.branch.id] });
    expect(await sees(colleague.id)).toBe(false);
    expect(await sees(finance.id)).toBe(false);
  });
});

describe("Approval speed: the stays of the dates (decided item 4)", () => {
  it("counts only the stays decided in the dates, and none still waiting", async () => {
    const { a, principal, params } = await twoBranches();
    // Decided on 28 September: outside the dates.
    const before = await decided(a, "PENDING_FINANCE", principalStay("2031-09-28", 10));
    // Still waiting at the Principal step.
    const waiting = await decided(
      a,
      "PENDING_PRINCIPAL",
      principalStay("2031-10-06", 1).slice(0, 2),
    );
    const inside = await decided(a, "PENDING_FINANCE", principalStay("2031-10-07", 5));
    await refreshNow();
    const report = await getApprovalSpeedReport(principal.id, params(), "all");
    const ids = new Set(report.stays.map((row) => row.orderId));
    expect(ids.has(before.id)).toBe(false);
    expect(report.stays.filter((row) => row.orderId === waiting.id).map((row) => row.step)).toEqual(
      ["PENDING_HEAD"],
    );
    expect(report.all.PENDING_PRINCIPAL).toEqual({ hours: "5.0", count: 1 });
    expect(ids.has(inside.id)).toBe(true);
  });
});
