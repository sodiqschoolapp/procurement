import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { spendingScene } from "../../../../tests/helpers/analytics";
import { insertCategory, insertCompany } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { analyticsRefresh } from "@/server/jobs/analytics-refresh";
import { runDueJobs } from "@/server/jobs/run-due";

import { getAnalyticsFilters } from "./filters";

// The period picker and the filter bar (build-plan 6.3, Done when: "the school-year choice is
// hidden while the setting is empty"; 10-notifications-analytics-reports.md, Analytics page per
// role, points 1 and 2: "Branch (within the user's branches), category, department, Manager,
// supplier"; plan of 6.3, decided items 6, 11 and 13).

describe("the school-year choice (Done when 3; 10 point 1)", () => {
  it("is hidden while school_year_start is empty and offered once it is set", async () => {
    const head = await insertUser("HEAD");
    expect((await getAnalyticsFilters(head.id)).periods).toEqual([
      "this_month",
      "last_month",
      "this_quarter",
      "custom",
    ]);
    await db.execute(sql`
      insert into settings (key, value, created_at)
      values ('school_year_start', '{"month": 9, "day": 2}'::jsonb, now())`);
    try {
      expect((await getAnalyticsFilters(head.id)).periods).toEqual([
        "this_month",
        "last_month",
        "this_quarter",
        "school_year",
        "custom",
      ]);
    } finally {
      await db.execute(sql`delete from settings where key = 'school_year_start'`);
    }
  });
});

describe("the filter lists keep to the user's branches (10 point 2; 03 rule 1)", () => {
  it("a Principal sees the own branch, its departments and Managers; catalogs whole, inactive marked", async () => {
    const mine = await spendingScene();
    const theirs = await spendingScene();
    const principal = await insertUser("PRINCIPAL", { branches: [mine.branch.id] });
    const oldCategory = await insertCategory({ isActive: false });
    const brandOnly = await insertCompany({ kind: "BRAND" });
    const options = await getAnalyticsFilters(principal.id);

    expect(options.branches.map((branch) => branch.id)).toEqual([mine.branch.id]);
    expect(options.departments.map((department) => department.id)).toEqual([mine.department.id]);
    expect(options.managers.map((manager) => manager.id)).toEqual([mine.manager.id]);
    expect(options.categories).toContainEqual(
      expect.objectContaining({ id: oldCategory.id, isActive: false }),
    );
    expect(options.categories.map((category) => category.id)).toContain(theirs.category.id);
    expect(options.suppliers.map((supplier) => supplier.id)).toContain(theirs.supplier.id);
    expect(options.suppliers.map((supplier) => supplier.id)).not.toContain(brandOnly.id);
  });

  it("the Head sees every branch", async () => {
    const one = await spendingScene();
    const two = await spendingScene();
    const head = await insertUser("HEAD");
    const ids = (await getAnalyticsFilters(head.id)).branches.map((branch) => branch.id);
    expect(ids).toEqual(expect.arrayContaining([one.branch.id, two.branch.id]));
  });
});

describe("the last refresh of the summary (decided item 13)", () => {
  it("is null before the first run, then the run's end", async () => {
    const head = await insertUser("HEAD");
    expect((await getAnalyticsFilters(head.id)).refreshedAt).toBeNull();
    const moment = setClock("2031-05-15T05:00:10Z");
    expect(await runDueJobs([analyticsRefresh])).toEqual({ analytics_refresh: "ran" });
    expect((await getAnalyticsFilters(head.id)).refreshedAt).toEqual(moment);
  });
});

describe("the Money with managers tab (03 matrix: Head and Finance; D55 item 22; plan of 2.3b)", () => {
  it("is the Head's and Finance's, not the Manager's or the Principal's, in the same branch", async () => {
    const scene = await spendingScene();
    const seen: Record<string, boolean> = {};
    for (const role of ["HEAD", "FINANCE", "MANAGER", "PRINCIPAL"] as const) {
      const user = await insertUser(role, { branches: role === "HEAD" ? [] : [scene.branch.id] });
      seen[role] = (await getAnalyticsFilters(user.id)).seesManagersCash;
    }
    expect(seen).toEqual({ HEAD: true, FINANCE: true, MANAGER: false, PRINCIPAL: false });
  });
});
