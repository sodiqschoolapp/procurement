import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { NOTIFICATIONS_MAX_PAGE, NOTIFICATIONS_PAGE_SIZE } from "@/domain/notifications";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { markAllNotificationsRead } from "../actions/mark-all-read";
import { openNotification } from "../actions/open-notification";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertNotification } from "../../../../tests/helpers/notifications";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { countMyUnread, listMyNotifications } from "./my-notifications";

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
    for (const page of [0, -1, 1.5, NOTIFICATIONS_MAX_PAGE + 1, 1e18]) {
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

// 10 Notifications: "The bell shows only notifications of branches the reader has now" (D55 item
// 20, which replaces decision 4 of 0.11; build-plan 2.3b; plan of 2.3b, decided items 6 and 7,
// Look first). Every reader of the bell: the list, the count, opening, "Mark all as read".
describe("The bell shows only notices of branches the reader has now (build-plan 2.3b)", () => {
  it("Done when: Bekzod, moved from YUN to CHL, no longer sees a YUN notice; a CHL notice and one of no branch still show", async () => {
    setClock("2026-10-20T05:00:00Z");
    const yun = await insertBranch();
    const chl = await insertBranch();
    const bekzod = await insertUser("MANAGER", { branches: [yun.id] });
    const ofYun = await insertNotification(bekzod.id, { branchId: yun.id });
    const ofNone = await insertNotification(bekzod.id, { branchId: null });
    expect((await listMyNotifications(bekzod.id, {})).rows.map((row) => row.id).sort()).toEqual(
      [ofYun.id, ofNone.id].sort(),
    );

    // Bekzod moves from YUN to CHL, as the Head's user form writes it.
    await db.execute(
      sql`update user_branches set branch_id = ${chl.id} where user_id = ${bekzod.id}`,
    );
    const ofChl = await insertNotification(bekzod.id, { branchId: chl.id });

    expect((await listMyNotifications(bekzod.id, {})).rows.map((row) => row.id).sort()).toEqual(
      [ofChl.id, ofNone.id].sort(),
    );
    expect(await countMyUnread(bekzod.id)).toBe(2);
    expect(await runAction(openNotification, bekzod.id, { id: ofYun.id })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await runAction(markAllNotificationsRead, bekzod.id, {})).toEqual({
      ok: true,
      data: { count: 2 },
    });
    const [row] = (
      await db.execute<{ read_at: Date | null }>(
        sql`select read_at from notifications where id = ${ofYun.id}`,
      )
    ).rows;
    expect(row!.read_at).toBeNull();

    // Given YUN back, the notice shows again as it was, unread.
    await db.execute(
      sql`update user_branches set branch_id = ${yun.id} where user_id = ${bekzod.id}`,
    );
    expect((await listMyNotifications(bekzod.id, {})).rows.map((row) => row.id)).toContain(
      ofYun.id,
    );
    expect(await countMyUnread(bekzod.id)).toBe(1);
  });

  it("a Head sees every branch's notice; a row of no branch (from before migration 0051) shows to everyone it was written to", async () => {
    const yun = await insertBranch();
    const head = await insertUser("HEAD");
    const finance = await insertUser("FINANCE", { branches: [yun.id] });
    const other = await insertBranch();
    const headRow = await insertNotification(head.id, { branchId: other.id });
    const old = await insertNotification(finance.id, { branchId: null });
    // Beside it, a notice of a branch Finance does not hold (D40).
    const hidden = await insertNotification(finance.id, { branchId: other.id });

    expect((await listMyNotifications(head.id, {})).rows.map((row) => row.id)).toEqual([
      headRow.id,
    ]);
    expect((await listMyNotifications(finance.id, {})).rows.map((row) => row.id)).toEqual([old.id]);
    expect(await countMyUnread(finance.id)).toBe(1);
    expect(hidden.id).not.toBe(old.id);
  });
});
