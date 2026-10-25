import { describe, expect, it } from "vitest";

import { SETTING_DEFAULTS } from "@/domain/settings";
import { db } from "@/server/db/client";
import { settings } from "@/server/db/schema";

import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertBranch } from "../../../../tests/helpers/branches";
import { insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import {
  getFinanceStepWaiting,
  getLastDatabaseCopy,
  getSchoolName,
  getSettingsForHead,
} from "./settings";

// build-plan 1.1; developer-rules.md rule 4 (authorize() in every query); plan of 1.1, decision
// 4 (Look first): the form's values are the Head's, the school name every signed-in role's.

const MOMENT = new Date("2026-10-14T09:00:00Z");

describe("the settings queries (build-plan 1.1)", () => {
  it("getSettingsForHead gives the values in force; getSchoolName the name, or null until set", async () => {
    await db.delete(settings);
    const head = await insertUser("HEAD");
    const finance = await insertUser("FINANCE");

    expect(await getSettingsForHead(head.id)).toEqual(SETTING_DEFAULTS);
    expect(await getSchoolName(finance.id)).toBeNull();

    await db
      .insert(settings)
      .values({ key: "school_name", value: "Invented School", createdAt: MOMENT });
    expect(await getSchoolName(finance.id)).toBe("Invented School");
    expect((await getSettingsForHead(head.id)).school_name).toBe("Invented School");
  });

  it("an inactive user reads nothing (decisions 0.8)", async () => {
    const inactive = await insertUser("HEAD", { isActive: false });
    await expect(getSettingsForHead(inactive.id)).rejects.toThrow();
    await expect(getSchoolName(inactive.id)).rejects.toThrow();
  });
});

describePermissionMatrix("getSettingsForHead", {
  permission: "catalog.manage",
  run: ({ user }) => getSettingsForHead(user.id),
});

// The date of the last copy of the database: the Head's, as the Settings page (build-plan 8.2b).
describePermissionMatrix("getLastDatabaseCopy", {
  permission: "catalog.manage",
  run: ({ user }) => getLastDatabaseCopy(user.id),
});

// The orders that keep the Finance step from being switched off: the Head's, as the Settings
// page (06 Finance step switched off 5; plan of 4.10c, decided item 10).
describePermissionMatrix("getFinanceStepWaiting", {
  permission: "catalog.manage",
  run: ({ user }) => getFinanceStepWaiting(user.id),
});

describe("getFinanceStepWaiting (06 Finance step switched off 5; plan of 4.10c, decided item 10)", () => {
  it("lists the orders Waiting for Finance or for settlement of every branch, and no order one status away (D40)", async () => {
    const head = await insertUser("HEAD");
    const [first, second] = [await insertBranch(), await insertBranch()];
    const owner = await insertUser("MANAGER", { branches: [first.id, second.id] });
    const finance = await insertOrder({
      branchId: first.id,
      ownerId: owner.id,
      status: "PENDING_FINANCE",
    });
    const settlement = await insertOrder({
      branchId: second.id,
      ownerId: owner.id,
      status: "SETTLEMENT",
    });
    for (const status of ["PENDING_PRINCIPAL", "PURCHASING", "CLOSED"] as const) {
      await insertOrder({ branchId: first.id, ownerId: owner.id, status });
    }
    const listed = await getFinanceStepWaiting(head.id);
    expect(new Set(listed.map((order) => order.id))).toEqual(new Set([finance.id, settlement.id]));
    expect(listed.find((order) => order.id === settlement.id)).toEqual({
      id: settlement.id,
      number: settlement.number,
      branchCode: second.code,
      status: "SETTLEMENT",
    });
  });
});

describePermissionMatrix("getSchoolName", {
  permission: "profile.edit",
  run: ({ user }) => getSchoolName(user.id),
});
