import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";

import { setClock } from "../../../../tests/helpers/clock";
import { insertNotification } from "../../../../tests/helpers/notifications";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { markAllNotificationsRead } from "./mark-all-read";
import { openNotification } from "./open-notification";

// build-plan 0.11: "mark as read". Plan of 0.11: decision 2 (Look first: notification.own, one's
// own notifications only), decision 8 (opening marks read and returns the link; "Mark all as
// read"); 03-roles-and-permissions.md rule 1 (another person's record is "Not found").

async function readAtOf(ids: readonly string[]) {
  const rows = await db
    .select({ id: notifications.id, readAt: notifications.readAt })
    .from(notifications)
    .where(inArray(notifications.id, [...ids]));
  return Object.fromEntries(rows.map((row) => [row.id, row.readAt]));
}

describe("openNotification (build-plan 0.11: mark as read)", () => {
  it("marks the caller's notification read with the clock's time and returns its link", async () => {
    setClock("2026-10-14T09:00:00Z");
    const head = await insertUser("HEAD");
    const mine = await insertNotification(head.id, { link: "/orders" });
    setClock("2026-10-14T09:30:00Z");

    const result = await runAction(openNotification, head.id, { id: mine.id });

    expect(result).toEqual({ ok: true, data: { link: "/orders" } });
    expect(await readAtOf([mine.id])).toEqual({ [mine.id]: new Date("2026-10-14T09:30:00Z") });
  });

  it("opened again: the link again, the first read_at stays", async () => {
    setClock("2026-10-14T09:00:00Z");
    const manager = await insertUser("MANAGER");
    const mine = await insertNotification(manager.id);
    setClock("2026-10-14T09:10:00Z");
    await runAction(openNotification, manager.id, { id: mine.id });
    setClock("2026-10-14T12:00:00Z");

    expect(await runAction(openNotification, manager.id, { id: mine.id })).toEqual({
      ok: true,
      data: { link: "/" },
    });
    expect(await readAtOf([mine.id])).toEqual({ [mine.id]: new Date("2026-10-14T09:10:00Z") });
  });

  it("another person's notification is Not found and stays unread (03 rule 1; D40)", async () => {
    const finance = await insertUser("FINANCE");
    const other = await insertUser("FINANCE");
    const mine = await insertNotification(finance.id);
    const theirs = await insertNotification(other.id);

    expect(await runAction(openNotification, finance.id, { id: theirs.id })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await readAtOf([mine.id, theirs.id])).toEqual({ [mine.id]: null, [theirs.id]: null });
  });

  it("an unknown id is Not found; an id that is not a uuid is invalid input (developer-rules.md rule 13)", async () => {
    const principal = await insertUser("PRINCIPAL");

    expect(
      await runAction(openNotification, principal.id, {
        id: "00000000-0000-4000-8000-000000000000",
      }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    for (const id of ["1", "", null, "' or 1=1 --"]) {
      expect(await runAction(openNotification, principal.id, { id })).toMatchObject({
        ok: false,
        error: { code: "invalid_input" },
      });
    }
  });

  it("an inactive user is refused (decisions 0.8)", async () => {
    const inactive = await insertUser("MANAGER", { isActive: false });
    const mine = await insertNotification(inactive.id);

    expect(await runAction(openNotification, inactive.id, { id: mine.id })).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(await readAtOf([mine.id])).toEqual({ [mine.id]: null });
  });
});

describe("markAllNotificationsRead (plan of 0.11, decision 8)", () => {
  it("marks every unread notification of the caller, and none of another person's (D40)", async () => {
    setClock("2026-10-14T08:00:00Z");
    const head = await insertUser("HEAD");
    const other = await insertUser("HEAD");
    const first = await insertNotification(head.id);
    const second = await insertNotification(head.id);
    const earlier = await insertNotification(head.id, {
      readAt: new Date("2026-10-14T08:05:00Z"),
    });
    const theirs = await insertNotification(other.id);
    setClock("2026-10-14T10:00:00Z");

    const result = await runAction(markAllNotificationsRead, head.id, {});

    expect(result).toEqual({ ok: true, data: { count: 2 } });
    const moment = new Date("2026-10-14T10:00:00Z");
    expect(await readAtOf([first.id, second.id, earlier.id, theirs.id])).toEqual({
      [first.id]: moment,
      [second.id]: moment,
      [earlier.id]: new Date("2026-10-14T08:05:00Z"),
      [theirs.id]: null,
    });
  });

  it("with nothing unread changes nothing", async () => {
    const manager = await insertUser("MANAGER");
    expect(await runAction(markAllNotificationsRead, manager.id, {})).toEqual({
      ok: true,
      data: { count: 0 },
    });
    expect(
      await db.select().from(notifications).where(eq(notifications.userId, manager.id)),
    ).toEqual([]);
  });
});

/** The wrapper's answer as the matrix reads it. */
function answer(result: Awaited<ReturnType<typeof runAction>>) {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

describePermissionMatrix("openNotification", {
  permission: "notification.own",
  async run({ user }) {
    const mine = await insertNotification(user.id);
    answer(await runAction(openNotification, user.id, { id: mine.id }));
  },
});

describePermissionMatrix("markAllNotificationsRead", {
  permission: "notification.own",
  async run({ user }) {
    answer(await runAction(markAllNotificationsRead, user.id, {}));
  },
});
