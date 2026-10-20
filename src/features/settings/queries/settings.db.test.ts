import { describe, expect, it } from "vitest";

import { SETTING_DEFAULTS } from "@/domain/settings";
import { db } from "@/server/db/client";
import { settings } from "@/server/db/schema";

import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { getLastDatabaseCopy, getSchoolName, getSettingsForHead } from "./settings";

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

describePermissionMatrix("getSchoolName", {
  permission: "profile.edit",
  run: ({ user }) => getSchoolName(user.id),
});
