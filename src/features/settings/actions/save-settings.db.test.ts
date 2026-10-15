import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROLES } from "@/domain/permissions";
import { SETTING_DEFAULTS } from "@/domain/settings";
import { defineAction, runAction } from "@/server/action";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { auditLog, settings } from "@/server/db/schema";
import { readSettings } from "@/server/settings";

import { setClock } from "../../../../tests/helpers/clock";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { saveSettings } from "./save-settings";

// build-plan 1.1, Done when: "only the Head can write; a change writes an audit row";
// 03-roles-and-permissions.md, Permission matrix ("Manage catalogs, users, branches, settings":
// Head only); developer-rules.md rule 3 (one transaction) and rule 13 (changes to settings go to
// the audit log); plan of 1.1, decisions 7, 8 and 15, review correction 3.

/** The rows, each value parsed once from its JSON text (src/server/settings.ts). */
async function storedRows() {
  const rows = await db
    .select({ key: settings.key, json: sql<string>`${settings.value}::text` })
    .from(settings)
    .orderBy(settings.key);
  return rows.map(({ key, json }) => ({ key, value: JSON.parse(json) as unknown }));
}

async function auditRowsBy(actorId: string) {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.actorId, actorId), eq(auditLog.entity, "settings")));
}

describe("saveSettings (build-plan 1.1)", () => {
  beforeEach(async () => {
    // Settings rows are not append-only; each test starts from the empty table of a new school.
    await db.delete(settings);
  });

  it("only the Head writes: a Manager's attempt beside it is refused, then the Head's save lands (D40)", async () => {
    setClock("2026-10-14T09:00:00Z");
    const head = await insertUser("HEAD");
    const manager = await insertUser("MANAGER");
    setClock("2026-10-14T10:30:00Z");

    const input = { school_name: "Invented School", overspend_guard_percent: 15 };
    expect(await runAction(saveSettings, manager.id, input)).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(await storedRows()).toEqual([]);
    expect(await auditRowsBy(manager.id)).toEqual([]);

    expect(await runAction(saveSettings, head.id, input)).toMatchObject({ ok: true });
    expect(await storedRows()).toEqual([
      { key: "overspend_guard_percent", value: 15 },
      { key: "school_name", value: "Invented School" },
    ]);
  });

  it.each(ROLES.filter((role) => role !== "HEAD"))(
    "%s is refused; no settings row and no audit row (03, Permission matrix)",
    async (role) => {
      const user = await insertUser(role);
      expect(
        await runAction(saveSettings, user.id, {
          price_hint_percent: 30,
          receipt_required_for_cash: true,
          // A valid amount too (build-plan 2.1; permission review of 2.1, Should fix 1).
          overspend_guard_min_amount: "250 000",
        }),
      ).toMatchObject({ ok: false, error: { code: "forbidden" } });
      expect(await storedRows()).toEqual([]);
      expect(await auditRowsBy(user.id)).toEqual([]);
    },
  );

  it("a change writes one audit row with the changed keys only, before = value in force (rule 13; correction 3)", async () => {
    setClock("2026-10-14T10:00:00Z");
    const head = await insertUser("HEAD");
    expect(await runAction(saveSettings, head.id, { reminder_hours: 12 })).toMatchObject({
      ok: true,
    });
    setClock("2026-10-14T11:00:00Z");

    const result = await runAction(saveSettings, head.id, {
      reminder_hours: 12, // unchanged: not in the row
      price_hint_percent: 30, // default 20 before
      overspend_guard_percent: "off",
      school_year_start: { month: 9, day: 1 }, // never set before
    });

    expect(result).toMatchObject({ ok: true });
    const rows = await auditRowsBy(head.id);
    expect(rows).toHaveLength(2);
    const last = rows.find((row) => row.createdAt.getTime() === Date.parse("2026-10-14T11:00:00Z"));
    expect(last).toMatchObject({
      action: "settings.change",
      entity: "settings",
      entityId: "settings",
      actorId: head.id,
      before: { price_hint_percent: 20, overspend_guard_percent: 10, school_year_start: null },
      after: {
        price_hint_percent: 30,
        overspend_guard_percent: "off",
        school_year_start: { month: 9, day: 1 },
      },
    });
    expect(Object.keys(last!.before as object).sort()).toEqual(
      Object.keys(last!.after as object).sort(),
    );
    expect(await readSettings(db)).toEqual({
      ...SETTING_DEFAULTS,
      reminder_hours: 12,
      price_hint_percent: 30,
      overspend_guard_percent: "off",
      school_year_start: { month: 9, day: 1 },
    });
  });

  it("the same values again, and a default sent on an empty table, write nothing (decisions 7, 15)", async () => {
    const head = await insertUser("HEAD");
    expect(
      await runAction(saveSettings, head.id, {
        price_hint_percent: 20,
        default_payment_type: "CASH",
      }),
    ).toMatchObject({ ok: true, data: { changed: [] } });
    expect(await storedRows()).toEqual([]);
    expect(await auditRowsBy(head.id)).toEqual([]);

    await runAction(saveSettings, head.id, { school_name: "Invented School" });
    expect(
      await runAction(saveSettings, head.id, { school_name: "Invented School" }),
    ).toMatchObject({
      ok: true,
      data: { changed: [] },
    });
    expect(await auditRowsBy(head.id)).toHaveLength(1);
  });

  it("the overspend guard amount saves as decimal text with an audit row (build-plan 2.1, Done when; plan of 2.1, decision 1)", async () => {
    setClock("2026-10-15T09:00:00Z");
    const head = await insertUser("HEAD");
    const result = await runAction(saveSettings, head.id, {
      overspend_guard_min_amount: "250 000",
    });
    expect(result).toMatchObject({ ok: true, data: { changed: ["overspend_guard_min_amount"] } });
    expect(await storedRows()).toEqual([{ key: "overspend_guard_min_amount", value: "250000" }]);
    expect(await auditRowsBy(head.id)).toEqual([
      expect.objectContaining({
        action: "settings.change",
        before: { overspend_guard_min_amount: "100000" },
        after: { overspend_guard_min_amount: "250000" },
      }),
    ]);
    expect((await readSettings(db)).overspend_guard_min_amount).toBe(250_000n);

    // 0: only the percent counts (08, Overspend guard; decision 2).
    expect(
      await runAction(saveSettings, head.id, { overspend_guard_min_amount: "0" }),
    ).toMatchObject({ ok: true, data: { changed: ["overspend_guard_min_amount"] } });
    expect((await readSettings(db)).overspend_guard_min_amount).toBe(0n);
  });

  it("the amount already in force, the default and a stored one, writes no row and no audit row (review of the plan of 2.1, Must fix 1)", async () => {
    const head = await insertUser("HEAD");
    expect(
      await runAction(saveSettings, head.id, { overspend_guard_min_amount: "100 000" }),
    ).toMatchObject({ ok: true, data: { changed: [] } });
    expect(await storedRows()).toEqual([]);
    expect(await auditRowsBy(head.id)).toEqual([]);

    await runAction(saveSettings, head.id, { overspend_guard_min_amount: "250000" });
    expect(
      await runAction(saveSettings, head.id, { overspend_guard_min_amount: "250 000" }),
    ).toMatchObject({ ok: true, data: { changed: [] } });
    expect(await auditRowsBy(head.id)).toHaveLength(1);
  });

  it("trims the school name before it is checked and stored (decision 10)", async () => {
    const head = await insertUser("HEAD");
    expect(
      await runAction(saveSettings, head.id, { school_name: "  Invented School  " }),
    ).toMatchObject({ ok: true });
    expect((await readSettings(db)).school_name).toBe("Invented School");
  });

  it.each([
    ["an unknown key", { invented_key: 1 }],
    ["a percent above the range", { price_hint_percent: 1001 }],
    ["a fraction", { overspend_guard_percent: 2.5 }],
    ["hours of 0", { reminder_hours: 0 }],
    ["a payment type not in the list", { default_payment_type: "CHEQUE" }],
    ["an empty school name", { school_name: "   " }],
    ["a 121-character school name", { school_name: "x".repeat(121) }],
    ["29 February", { school_year_start: { month: 2, day: 29 } }],
    // build-plan 2.1, Done when: the new setting "refuses a negative amount".
    ["a negative amount", { overspend_guard_min_amount: "-5" }],
    ["an amount with a fraction", { overspend_guard_min_amount: "1.5" }],
    ["an amount as a number", { overspend_guard_min_amount: 100000 }],
    ["an amount above MONEY_MAX", { overspend_guard_min_amount: "1000000000000000" }],
    ["null for a value", { school_name: null }],
    ["one good key beside a bad one", { reminder_hours: 12, escalation_hours: 721 }],
  ])("refuses %s before any write (developer-rules.md rule 13: Zod first)", async (_, input) => {
    const head = await insertUser("HEAD");
    expect(await runAction(saveSettings, head.id, input)).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(await storedRows()).toEqual([]);
    expect(await auditRowsBy(head.id)).toEqual([]);
  });

  it("a step after the audit row that fails leaves neither the value nor the row (rule 3)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const head = await insertUser("HEAD");
    const failing = defineAction({
      ...saveSettings,
      async notify() {
        throw new Error("invented failure");
      },
    });

    expect(await runAction(failing, head.id, { school_name: "Invented School" })).toMatchObject({
      ok: false,
      error: { code: "unexpected" },
    });
    expect(await storedRows()).toEqual([]);
    expect(await auditRowsBy(head.id)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("two Heads saving the same key at once: each audit row's before is the value the other left (the settings lock)", async () => {
    const first = await insertUser("HEAD");
    const second = await insertUser("HEAD");

    const results = await Promise.all([
      runAction(saveSettings, first.id, { price_hint_percent: 30 }),
      runAction(saveSettings, second.id, { price_hint_percent: 40 }),
    ]);

    expect(results).toMatchObject([{ ok: true }, { ok: true }]);
    const rows = [...(await auditRowsBy(first.id)), ...(await auditRowsBy(second.id))];
    expect(rows).toHaveLength(2);
    const changes = rows.map((row) => ({
      before: (row.before as { price_hint_percent: number }).price_hint_percent,
      after: (row.after as { price_hint_percent: number }).price_hint_percent,
    }));
    // One saved over the default; the other saw the first one's value, never the default again.
    const earlier = changes.find((change) => change.before === 20)!;
    const later = changes.find((change) => change !== earlier)!;
    expect(earlier).toBeDefined();
    expect(later.before).toBe(earlier.after);
    expect((await readSettings(db)).price_hint_percent).toBe(later.after);
  });

  it("two Heads saving different keys at once both land (decision 7, the settings lock)", async () => {
    const first = await insertUser("HEAD");
    const second = await insertUser("HEAD");

    const results = await Promise.all([
      runAction(saveSettings, first.id, { school_name: "Invented School" }),
      runAction(saveSettings, second.id, { escalation_hours: 72 }),
    ]);

    expect(results).toMatchObject([{ ok: true }, { ok: true }]);
    expect(await storedRows()).toEqual([
      { key: "escalation_hours", value: 72 },
      { key: "school_name", value: "Invented School" },
    ]);
  });
});

describePermissionMatrix("saveSettings", {
  permission: "catalog.manage",
  async run({ user }) {
    const result = await runAction(saveSettings, user.id, { reminder_hours: 30 });
    if (result.ok) return;
    const { code } = result.error;
    if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
    throw new Error(`Unexpected answer: ${code}`);
  },
});
