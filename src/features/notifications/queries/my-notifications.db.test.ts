import { describe, expect, it } from "vitest";

import { setClock } from "../../../../tests/helpers/clock";
import { insertNotification } from "../../../../tests/helpers/notifications";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { NOTIFICATIONS_PAGE_SIZE, countMyUnread, listMyNotifications } from "./my-notifications";

// 10-notifications-analytics-reports.md, Notifications ("an in-app bell with an unread count");
// 11-screens-and-ux.md rule 8 (25 rows a page); plan of 0.11, decision 2 (Look first: the
// caller's own rows only, filtered in the SQL).

describe("listMyNotifications", () => {
  it("lists only the caller's notifications, newest first, with another person's beside them (D40)", async () => {
    const head = await insertUser("HEAD");
    const other = await insertUser("HEAD");
    setClock("2026-10-14T08:00:00Z");
    const older = await insertNotification(head.id, { link: "/a" });
    await insertNotification(other.id);
    setClock("2026-10-14T09:00:00Z");
    const newer = await insertNotification(head.id, { link: "/b" });

    const page = await listMyNotifications(head.id, {});

    expect(page.rows.map((row) => row.id)).toEqual([newer.id, older.id]);
    expect(page.rows[0]).toMatchObject({
      type: "BRANCH_ROLE_VACANT",
      params: { branch: "DEMO", role: "PRINCIPAL" },
      link: "/b",
      readAt: null,
      createdAt: new Date("2026-10-14T09:00:00Z"),
    });
    expect(page).toMatchObject({ page: 1, hasMore: false });
  });

  it("25 a page (rule 8): the 26th is on page 2", async () => {
    const manager = await insertUser("MANAGER");
    const ids: string[] = [];
    for (let minute = 0; minute <= NOTIFICATIONS_PAGE_SIZE; minute += 1) {
      setClock(new Date(Date.UTC(2026, 9, 14, 9, minute)).toISOString());
      ids.push((await insertNotification(manager.id)).id);
    }

    const first = await listMyNotifications(manager.id, { page: 1 });
    const second = await listMyNotifications(manager.id, { page: 2 });

    expect(first.rows).toHaveLength(25);
    expect(first.hasMore).toBe(true);
    expect(second.rows.map((row) => row.id)).toEqual([ids[0]]);
    expect(second.hasMore).toBe(false);
  });

  it("refuses a page that is not a positive integer (developer-rules.md rule 13)", async () => {
    const finance = await insertUser("FINANCE");
    for (const page of [0, -1, 1.5]) {
      await expect(listMyNotifications(finance.id, { page })).rejects.toThrow();
    }
  });
});

describe("countMyUnread", () => {
  it("counts only the caller's unread notifications (D40)", async () => {
    setClock("2026-10-14T09:00:00Z");
    const principal = await insertUser("PRINCIPAL");
    const other = await insertUser("PRINCIPAL");
    await insertNotification(principal.id);
    await insertNotification(principal.id);
    await insertNotification(principal.id, { readAt: new Date("2026-10-14T09:01:00Z") });
    await insertNotification(other.id);

    expect(await countMyUnread(principal.id)).toBe(2);
  });
});

describePermissionMatrix("listMyNotifications", {
  permission: "notification.own",
  async run({ user }) {
    await listMyNotifications(user.id, {});
  },
});

describePermissionMatrix("countMyUnread", {
  permission: "notification.own",
  async run({ user }) {
    await countMyUnread(user.id);
  },
});
