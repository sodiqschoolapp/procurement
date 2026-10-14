import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chooseOwnLanguage } from "@/features/catalog/actions/own-language";
import { defineAction, runAction } from "@/server/action";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";

import { insertBranch } from "../../tests/helpers/branches";
import { setClock } from "../../tests/helpers/clock";
import { insertUser } from "../../tests/helpers/users";
import { notify } from "./notify";

// build-plan 0.11, Done when: "a rolled-back action leaves no notification". developer-rules.md
// rule 3 (one transaction per action: "add notifications"; "if any step fails, nothing is
// saved"). The action is the person's own language choice of 0.10b with a `notify` step added, so
// the notification is written by a real action through the wrapper. Plan of 0.11, decision 5:
// the actor and repeats are left out, an inactive user gets no row; review of the plan,
// correction 1: a job with no acting user passes `null`.

afterEach(() => {
  vi.restoreAllMocks();
});

const PARAMS = { branch: "DEMO", role: "PRINCIPAL" } as const;

/** chooseOwnLanguage with a `notify` step that tells `to`, then optionally fails. */
function languageWithNotify(to: () => readonly string[], fail = false) {
  return defineAction({
    ...chooseOwnLanguage,
    async notify({ tx, userId }) {
      await notify(
        { tx, userId },
        {
          to: to(),
          type: "BRANCH_ROLE_VACANT",
          params: PARAMS,
          branchId: null,
          link: "/",
          at: now(),
        },
      );
      if (fail) throw new Error("invented failure after notify");
    },
  });
}

async function rowsFor(userIds: readonly string[]) {
  return db
    .select()
    .from(notifications)
    .where(inArray(notifications.userId, [...userIds]));
}

describe("notify() inside the action's transaction (developer-rules.md rule 3)", () => {
  it("a rolled-back action leaves no notification (build-plan 0.11, Done when)", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const actor = await insertUser("MANAGER");
    const head = await insertUser("HEAD");

    const result = await runAction(
      languageWithNotify(() => [head.id], true),
      actor.id,
      { locale: "ru" },
    );

    expect(result).toMatchObject({ ok: false, error: { code: "unexpected" } });
    // The failure is the invented one, thrown after notify() wrote its row (spec review of 0.11).
    expect(errorLog).toHaveBeenCalledWith(expect.stringMatching(/invented failure after notify/));
    expect(await rowsFor([head.id])).toEqual([]);
  });

  it("a committed action leaves one row per recipient with type, params, link and the clock's time", async () => {
    setClock("2026-10-14T11:00:00Z");
    const actor = await insertUser("MANAGER");
    const head = await insertUser("HEAD");
    const finance = await insertUser("FINANCE");
    // Someone not told, beside them (D40).
    const bystander = await insertUser("PRINCIPAL");

    const result = await runAction(
      languageWithNotify(() => [head.id, finance.id]),
      actor.id,
      { locale: "en" },
    );

    expect(result).toMatchObject({ ok: true });
    const rows = await rowsFor([head.id, finance.id, bystander.id]);
    expect(rows.map((row) => row.userId).sort()).toEqual([head.id, finance.id].sort());
    for (const row of rows) {
      expect(row).toMatchObject({
        type: "BRANCH_ROLE_VACANT",
        params: PARAMS,
        link: "/",
        readAt: null,
        createdAt: new Date("2026-10-14T11:00:00Z"),
      });
    }
  });

  it("leaves out the actor, writes one row for a repeated recipient, none for an inactive one (decision 5)", async () => {
    const actor = await insertUser("HEAD");
    const head = await insertUser("HEAD");
    const inactive = await insertUser("HEAD", { isActive: false });

    await runAction(
      languageWithNotify(() => [actor.id, head.id, head.id, inactive.id]),
      actor.id,
      { locale: "ru" },
    );

    const rows = await rowsFor([actor.id, head.id, inactive.id]);
    expect(rows.map((row) => row.userId)).toEqual([head.id]);
  });

  it("with no acting user (a job: 8.1) nobody is left out (review of the plan, correction 1)", async () => {
    const first = await insertUser("HEAD");
    const second = await insertUser("FINANCE");

    const written = await db.transaction((tx) =>
      notify(
        { tx, userId: null },
        {
          to: [first.id, second.id],
          type: "BRANCH_ROLE_VACANT",
          params: PARAMS,
          branchId: null,
          link: "/",
          at: now(),
        },
      ),
    );

    expect(written).toBe(2);
    expect((await rowsFor([first.id, second.id])).length).toBe(2);
  });

  it("an event of a branch reaches a Head and that branch's people, never another branch's (permission review of 0.11; 03 rule 1)", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const head = await insertUser("HEAD");
    const ownFinance = await insertUser("FINANCE", { branches: [own.id] });
    const otherFinance = await insertUser("FINANCE", { branches: [other.id] });
    const bothFinance = await insertUser("FINANCE", { branches: [own.id, other.id] });

    const written = await db.transaction((tx) =>
      notify(
        { tx, userId: null },
        {
          to: [head.id, ownFinance.id, otherFinance.id, bothFinance.id],
          type: "BRANCH_ROLE_VACANT",
          params: PARAMS,
          branchId: own.id,
          link: "/",
          at: now(),
        },
      ),
    );

    expect(written).toBe(3);
    const rows = await rowsFor([head.id, ownFinance.id, otherFinance.id, bothFinance.id]);
    expect(rows.map((row) => row.userId).sort()).toEqual(
      [head.id, ownFinance.id, bothFinance.id].sort(),
    );
  });

  it("no recipient writes nothing", async () => {
    const written = await db.transaction((tx) =>
      notify(
        { tx, userId: null },
        {
          to: [],
          type: "BRANCH_ROLE_VACANT",
          params: PARAMS,
          branchId: null,
          link: "/",
          at: now(),
        },
      ),
    );
    expect(written).toBe(0);
  });

  it.each(["https://x.example", "//x.example", "/\t/x.example"])(
    "refuses the link %j before the database does (review of the plan, Should fix 6)",
    async (link) => {
      const head = await insertUser("HEAD");
      await expect(
        db.transaction((tx) =>
          notify(
            { tx, userId: null },
            {
              to: [head.id],
              type: "BRANCH_ROLE_VACANT",
              params: PARAMS,
              branchId: null,
              link,
              at: now(),
            },
          ),
        ),
      ).rejects.toThrow(/inside the app/);
      expect(
        await db.select().from(notifications).where(eq(notifications.userId, head.id)),
      ).toEqual([]);
    },
  );
});
