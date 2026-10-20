import { describe, expect, it } from "vitest";

import { branchCookieValue } from "@/features/catalog/branch-cookie";

import {
  bought,
  moneyOn,
  refreshNow,
  spendingScene,
  stocked,
} from "../../../tests/helpers/analytics";
import { setClock } from "../../../tests/helpers/clock";
import { insertUser } from "../../../tests/helpers/users";
import { getMoneyWithManagersReport } from "./queries/money-with-managers-report";
import { getPurchaseRegister } from "./queries/purchase-register";
import { getSpendingReport } from "./queries/spending-report";
import { getStockReport } from "./queries/stock-report";
import { withSwitcherBranch } from "./report-branch";
import { parseReportParams } from "./report-params";

// "The branch filter starts at the branch picked in the branch switcher on top" (10-notifications-
// analytics-reports.md, Reports; D55 item 11; plan of 8.2b, decided item 12; build-plan 8.2b, Done
// when: "a report opened with CHL picked filters to CHL"). Two branches of one Head, a record in
// each with every other value the same (D40). 15 May 2031 in Tashkent.

const AT = "2031-05-15T05:00:00Z";
const TODAY = "2031-05-15";

async function scene() {
  setClock(AT);
  const chl = await spendingScene();
  const yun = await spendingScene();
  await bought(chl, { purchasedOn: "2031-05-02", unitPrice: "6000" });
  await bought(yun, { purchasedOn: "2031-05-02", unitPrice: "6000" });
  const finance = await insertUser("FINANCE", { branches: [chl.branch.id, yun.branch.id] });
  return { chl, yun, finance };
}

async function registerOf(userId: string, raw: Record<string, string>, cookie: string | undefined) {
  const parsed = parseReportParams({ report: "purchases", ...raw }, TODAY)!;
  const params = await withSwitcherBranch(userId, parsed, cookie);
  return { params, register: await getPurchaseRegister(userId, params, "all") };
}

describe("reports start at the switcher's branch (10 Reports; D55 item 11)", () => {
  it("with CHL picked and no branch in the address, the report filters to CHL (Done when)", async () => {
    const { chl, finance } = await scene();
    const { params, register } = await registerOf(
      finance.id,
      {},
      branchCookieValue(finance.id, chl.branch.id),
    );
    expect(params.filters.branch).toBe(chl.branch.id);
    expect([register.count, register.total]).toEqual([1, 6000n]);
  });

  it("branch=all in the address is every branch of the user, whatever the switcher shows", async () => {
    const { chl, finance } = await scene();
    const { params, register } = await registerOf(
      finance.id,
      { branch: "all" },
      branchCookieValue(finance.id, chl.branch.id),
    );
    expect(params.filters.branch).toBeNull();
    expect([register.count, register.total]).toEqual([2, 12000n]);
  });

  it("a cookie of a branch the user does not have, or of another user, is All my branches", async () => {
    const { chl, finance } = await scene();
    const elsewhere = await spendingScene();
    const colleague = await insertUser("FINANCE", { branches: [chl.branch.id] });
    for (const cookie of [
      branchCookieValue(finance.id, elsewhere.branch.id),
      branchCookieValue(colleague.id, chl.branch.id),
      undefined,
    ]) {
      const { params, register } = await registerOf(finance.id, {}, cookie);
      expect(params.filters.branch).toBeNull();
      expect([register.count, register.total]).toEqual([2, 12000n]);
    }
  });
});

// Every reader of the switcher's branch keeps its own wall (.claude/rules/tests.md: a value read
// in a new way is tested at every reader; permission review of 8.2b, Should fix 1).
describe("the switcher's branch at the other reports (03 rule 1; D55 item 11)", () => {
  async function paramsOf(userId: string, report: string, branchId: string) {
    const parsed = parseReportParams({ report }, TODAY)!;
    return withSwitcherBranch(userId, parsed, branchCookieValue(userId, branchId));
  }

  it("Spending holds CHL alone", async () => {
    const { chl, finance } = await scene();
    await refreshNow();
    const report = await getSpendingReport(
      finance.id,
      await paramsOf(finance.id, "spending", chl.branch.id),
    );
    expect(report.branches.map((line) => [line.id, line.amount])).toEqual([[chl.branch.id, 6000n]]);
    expect(report.total).toBe(6000n);
  });

  it("Stock on hand holds CHL's stock alone", async () => {
    const { chl, yun, finance } = await scene();
    await stocked(chl, { qty: "2", unitCost: 1_000n });
    await stocked(yun, { qty: "2", unitCost: 1_000n });
    const report = await getStockReport(
      finance.id,
      await paramsOf(finance.id, "stock", chl.branch.id),
      "all",
    );
    expect(report.branches.map((branch) => [branch.id, branch.value])).toEqual([
      [chl.branch.id, 2000n],
    ]);
  });

  it("Money with managers holds the cash of CHL alone, for Finance of both", async () => {
    const { chl, yun, finance } = await scene();
    // The same Manager's cash in each branch (D40).
    const yunAsChl = { ...yun, manager: chl.manager };
    const there = await bought(chl, { purchasedOn: "2031-05-03", unitPrice: "0" });
    await moneyOn(there, finance.id, { amount: 40_000n, occurredOn: "2031-05-03" });
    const elsewhere = await bought(yunAsChl, { purchasedOn: "2031-05-03", unitPrice: "0" });
    await moneyOn(elsewhere, finance.id, { amount: 70_000n, occurredOn: "2031-05-03" });
    await refreshNow();
    const report = await getMoneyWithManagersReport(
      finance.id,
      await paramsOf(finance.id, "cash", chl.branch.id),
      "all",
    );
    expect(report.held).toBe(40_000n);
  });
});
