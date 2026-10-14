import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { SETTING_DEFAULTS } from "@/domain/settings";
import { db } from "@/server/db/client";
import { settings } from "@/server/db/schema";

import { readSettings } from "./settings";

// build-plan 1.1, Done when: "the defaults come back on an empty table"; 14-data-model.md, Notes
// for the build (the keys and their defaults); plan of 1.1, decision 6 (an unset key has no row).

const MOMENT = new Date("2026-10-14T09:00:00Z");

describe("readSettings (build-plan 1.1)", () => {
  beforeEach(async () => {
    await db.delete(settings);
  });

  it("an empty table gives every default, and null for the two keys without one", async () => {
    expect(await readSettings(db)).toEqual({
      default_payment_type: "CASH",
      price_hint_percent: 20,
      overspend_guard_percent: 10,
      reminder_hours: 24,
      escalation_hours: 48,
      receipt_required_for_cash: false,
      school_name: null,
      school_year_start: null,
    });
  });

  it("stored values come back typed; the keys without a row keep their defaults", async () => {
    await db.insert(settings).values([
      { key: "overspend_guard_percent", value: "off", createdAt: MOMENT },
      { key: "receipt_required_for_cash", value: true, createdAt: MOMENT },
      { key: "school_name", value: "Invented School", createdAt: MOMENT },
      { key: "school_year_start", value: { month: 9, day: 2 }, createdAt: MOMENT },
    ]);

    expect(await readSettings(db)).toEqual({
      ...SETTING_DEFAULTS,
      overspend_guard_percent: "off",
      receipt_required_for_cash: true,
      school_name: "Invented School",
      school_year_start: { month: 9, day: 2 },
    });
  });

  it("an unknown key is ignored", async () => {
    await db.insert(settings).values({ key: "invented_key", value: 7, createdAt: MOMENT });
    expect(await readSettings(db)).toEqual(SETTING_DEFAULTS);
  });

  it("reads with the caller's transaction: a value written there is seen there only", async () => {
    let inside: number | undefined;
    await db
      .transaction(async (tx) => {
        await tx.execute(
          sql`insert into settings (key, value, created_at) values ('reminder_hours', '12'::jsonb, ${MOMENT.toISOString()})`,
        );
        inside = (await readSettings(tx)).reminder_hours;
        tx.rollback();
      })
      .catch(() => undefined);

    expect(inside).toBe(12);
    expect((await readSettings(db)).reminder_hours).toBe(24);
  });
});
