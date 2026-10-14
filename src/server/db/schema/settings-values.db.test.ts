import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  HOURS_MAX,
  HOURS_MIN,
  PERCENT_MAX,
  PERCENT_MIN,
  SCHOOL_NAME_MAX,
  type SettingKey,
} from "@/domain/settings";
import { db } from "@/server/db/client";
import { settings } from "@/server/db/schema";

import { refusalOf } from "../../../../tests/helpers/database-error";

// The value CHECKs of migration 0007 (plan of 1.1, decision 3, Look first; CLAUDE.md rule 5:
// the database is the last defence). D39: every refused case reaches the database directly, by an
// insert and by an update, and is refused as a check violation (23514) by its named constraint,
// never as a cast error. D40: each refused value is tried beside an accepted value of the same key.
// The edges come from the constants of src/domain/settings.ts, so the SQL cannot drift from the
// domain (review of the plan, Should fix 1; correction 2: both ends of every range).

const MOMENT = new Date("2026-10-14T09:00:00Z");

type Case = { key: SettingKey; good: unknown[]; bad: unknown[] };

const CASES: Case[] = [
  {
    key: "price_hint_percent",
    good: [PERCENT_MIN, 20, PERCENT_MAX],
    bad: ["20", true, 1.5, PERCENT_MIN - 1, PERCENT_MAX + 1, { value: 20 }],
  },
  {
    key: "overspend_guard_percent",
    good: [PERCENT_MIN, 10, PERCENT_MAX, "off"],
    bad: ["OFF", "on", "", 1.5, PERCENT_MIN - 1, PERCENT_MAX + 1, false],
  },
  {
    key: "reminder_hours",
    good: [HOURS_MIN, 24, HOURS_MAX],
    bad: ["24", false, 2.5, HOURS_MIN - 1, HOURS_MAX + 1],
  },
  {
    key: "escalation_hours",
    good: [HOURS_MIN, 48, HOURS_MAX],
    bad: ["48", true, 2.5, HOURS_MIN - 1, HOURS_MAX + 1],
  },
  {
    key: "default_payment_type",
    good: ["CASH", "TRANSFER", "CARD"],
    bad: ["CHEQUE", "cash", 1, ["CASH"]],
  },
  {
    key: "receipt_required_for_cash",
    good: [true, false],
    bad: ["true", 1, 0],
  },
  {
    key: "school_name",
    good: ["A", "Invented School", "x".repeat(SCHOOL_NAME_MAX)],
    bad: [1, " A", "A ", "\tA", "", "x".repeat(SCHOOL_NAME_MAX + 1), { name: "A" }],
  },
  {
    key: "school_year_start",
    good: [
      { month: 9, day: 1 },
      { month: 1, day: 1 },
      { month: 2, day: 28 },
      { month: 12, day: 31 },
      { month: 4, day: 30 },
    ],
    bad: [
      "09-01",
      [9, 1],
      {},
      { day: 1 },
      { month: 9 },
      { month: 0, day: 1 },
      { month: 13, day: 1 },
      { month: 9, day: 0 },
      { month: 4, day: 31 },
      { month: 1, day: 32 },
      { month: 2, day: 29 },
      { month: 9.5, day: 1 },
      { month: 9, day: 1.5 },
      { month: "9", day: 1 },
      { month: 9, day: 1, year: 2026 },
    ],
  },
];

const json = (value: unknown) => JSON.stringify(value);

function insert(key: string, value: unknown) {
  return db.execute(
    sql`insert into settings (key, value, created_at) values (${key}, ${json(value)}::jsonb, ${MOMENT.toISOString()})`,
  );
}

function update(key: string, value: unknown) {
  return db.execute(sql`update settings set value = ${json(value)}::jsonb where key = ${key}`);
}

async function storedValue(key: string) {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key));
  return rows.map((row) => row.value);
}

describe("settings value CHECKs (plan of 1.1, decision 3; D39, D40)", () => {
  for (const { key, good, bad } of CASES) {
    describe(key, () => {
      it.each(good.map((value) => [json(value), value]))("accepts %s", async (_, value) => {
        await db.delete(settings).where(eq(settings.key, key));
        await insert(key, value);
        expect(await storedValue(key)).toEqual([value]);
      });

      it.each(bad.map((value) => [json(value), value]))(
        "refuses %s by insert and by update",
        async (_, value) => {
          await db.delete(settings).where(eq(settings.key, key));
          expect(await refusalOf(insert(key, value))).toMatchObject({
            code: "23514",
            constraint: `settings_${key}_check`,
          });
          expect(await storedValue(key)).toEqual([]);

          // An accepted value beside it (D40), then the update to the refused one.
          await insert(key, good[0]);
          expect(await refusalOf(update(key, value))).toMatchObject({
            code: "23514",
            constraint: `settings_${key}_check`,
          });
          expect(await storedValue(key)).toEqual([good[0]]);
        },
      );
    });
  }

  it("leaves an unknown key free: the key list is the accessor's (schema comment of 0.2)", async () => {
    await insert("invented_unknown_key", { anything: [1, "two"] });
    expect(await storedValue("invented_unknown_key")).toEqual([{ anything: [1, "two"] }]);
  });
});
