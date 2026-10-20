import { describe, expect, it } from "vitest";

import { branchCookieValue } from "@/features/catalog/branch-cookie";

import { bought, spendingScene } from "../../../tests/helpers/analytics";
import { setClock } from "../../../tests/helpers/clock";
import { insertUser } from "../../../tests/helpers/users";
import { getPurchaseRegister } from "./queries/purchase-register";
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
