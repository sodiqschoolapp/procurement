import { describe, expect, it } from "vitest";

import { MONEY_MAX } from "./money";
import { ORDER_FIELDS_DEFAULT } from "./order-fields";

import {
  GUARD_OFF,
  SETTING_CHECKS,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  changedSettings,
  isGuard,
  isHours,
  isMonthDay,
  isPaymentType,
  isPercent,
  isSchoolName,
  isStoredAmount,
  lastDayOf,
  settingsFrom,
  storedSettingValue,
} from "./settings";

// build-plan 1.1; 14-data-model.md, Notes for the build (the keys and defaults); plan of 1.1,
// decisions 1, 2, 6, 7, 9 and 10.

describe("the settings keys and defaults (14-data-model.md, Notes for the build)", () => {
  it("has exactly the eleven keys of the spec and D10, `finance_step` (06 Finance step switched off; D62) and `order_fields` (05 Fields the Head sets; D67) among them", () => {
    expect([...SETTING_KEYS].sort()).toEqual(
      [
        "default_payment_type",
        "escalation_hours",
        "overspend_guard_min_amount",
        "overspend_guard_percent",
        "price_hint_percent",
        "receipt_required_for_cash",
        "reminder_hours",
        "school_name",
        "school_year_start",
        "finance_step",
        "order_fields",
      ].sort(),
    );
    expect(Object.keys(SETTING_DEFAULTS).sort()).toEqual([...SETTING_KEYS].sort());
    expect(Object.keys(SETTING_CHECKS).sort()).toEqual([...SETTING_KEYS].sort());
  });

  it("gives the spec's defaults; school name and school year start have none", () => {
    expect(SETTING_DEFAULTS).toEqual({
      // 05-order-request-form.md field 12: "Default is Cash (a setting)".
      default_payment_type: "CASH",
      price_hint_percent: 20,
      overspend_guard_percent: 10,
      // 14, Notes for the build: `overspend_guard_min_amount` (100 000), whole so'm as a bigint.
      overspend_guard_min_amount: 100_000n,
      reminder_hours: 24,
      escalation_hours: 48,
      receipt_required_for_cash: false,
      school_name: null,
      school_year_start: null,
      // 06 Finance step switched off: "It is the setting `finance_step`, on by default."
      finance_step: true,
      // 05 Fields the Head sets, "Default" column.
      order_fields: ORDER_FIELDS_DEFAULT,
    });
  });

  it("takes only a boolean for `finance_step` (14 Notes for the build; migration 0054)", () => {
    for (const ok of [true, false]) expect(SETTING_CHECKS.finance_step(ok)).toBe(true);
    for (const bad of ["true", 1, 0, null, "off"]) {
      expect(SETTING_CHECKS.finance_step(bad)).toBe(false);
    }
    expect(settingsFrom([{ key: "finance_step", value: false }]).finance_step).toBe(false);
    expect(() => settingsFrom([{ key: "finance_step", value: "off" }])).toThrow();
  });

  it("every default with a value passes its own check", () => {
    for (const key of SETTING_KEYS) {
      const value = SETTING_DEFAULTS[key];
      if (value !== null) expect(SETTING_CHECKS[key](value)).toBe(true);
    }
  });
});

describe("value checks (plan of 1.1, decisions 1, 2, 9, 10)", () => {
  it("percent: whole, 0 to 1000", () => {
    for (const ok of [0, 1, 20, 1000]) expect(isPercent(ok)).toBe(true);
    for (const bad of [-1, 1001, 1.5, "20", null, true, Number.NaN]) {
      expect(isPercent(bad)).toBe(false);
    }
  });

  it("overspend guard: a percent, 0 included, or off (08-money-and-settlement.md, Overspend guard)", () => {
    for (const ok of [0, 10, 1000, GUARD_OFF]) expect(isGuard(ok)).toBe(true);
    for (const bad of ["OFF", "on", "", -1, 1001, 1.5, false, null]) {
      expect(isGuard(bad)).toBe(false);
    }
  });

  it("overspend guard amount: a bigint of whole so'm, 0 to MONEY_MAX (08, Overspend guard; plan of 2.1, decisions 1 and 2)", () => {
    const check = SETTING_CHECKS.overspend_guard_min_amount;
    for (const ok of [0n, 1n, 100_000n, MONEY_MAX]) expect(check(ok)).toBe(true);
    for (const bad of [-1n, MONEY_MAX + 1n, 100_000, "100000", null]) {
      expect(check(bad)).toBe(false);
    }
  });

  it("the amount's stored text: digits, 0 to 15 of them, no leading zero, no sign (decision 1)", () => {
    for (const ok of ["0", "1", "100000", "999999999999999"]) expect(isStoredAmount(ok)).toBe(true);
    for (const bad of ["-1", "1.5", "01", "1000000000000000", "", " 1", "1 000", 100000, null]) {
      expect(isStoredAmount(bad)).toBe(false);
    }
  });

  it("hours: whole, 1 to 720; 0 refused (06-approval-workflow.md rule 8)", () => {
    for (const ok of [1, 24, 48, 720]) expect(isHours(ok)).toBe(true);
    for (const bad of [0, -1, 721, 2.5, "24"]) expect(isHours(bad)).toBe(false);
  });

  it("payment type: one of the three codes (05 field 12)", () => {
    for (const ok of ["CASH", "TRANSFER", "CARD"]) expect(isPaymentType(ok)).toBe(true);
    for (const bad of ["cash", "CHEQUE", "", 1, null]) expect(isPaymentType(bad)).toBe(false);
  });

  it("school name: trimmed, 1 to 120 characters", () => {
    for (const ok of ["A", "Sodiq Invented School", "x".repeat(120)]) {
      expect(isSchoolName(ok)).toBe(true);
    }
    for (const bad of ["", " ", " A", "A ", "x".repeat(121), 1, null]) {
      expect(isSchoolName(bad)).toBe(false);
    }
  });

  it("school year start: a day of the month that exists every year; 29 February refused", () => {
    for (const ok of [
      { month: 9, day: 1 },
      { month: 2, day: 28 },
      { month: 12, day: 31 },
      { month: 4, day: 30 },
      { month: 1, day: 31 },
    ]) {
      expect(isMonthDay(ok)).toBe(true);
    }
    for (const bad of [
      "09-01",
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
      { month: 9, day: 1, year: 2026 },
      [9, 1],
      null,
    ]) {
      expect(isMonthDay(bad)).toBe(false);
    }
    expect(lastDayOf(2)).toBe(28);
    expect(lastDayOf(13)).toBe(0);
  });
});

describe("settingsFrom (build-plan 1.1: the defaults come back on an empty table)", () => {
  it("no rows: every default", () => {
    expect(settingsFrom([])).toEqual(SETTING_DEFAULTS);
  });

  it("a stored value wins; an unknown key is ignored", () => {
    expect(
      settingsFrom([
        { key: "overspend_guard_percent", value: GUARD_OFF },
        { key: "school_name", value: "Invented School" },
        { key: "invented_key", value: 5 },
      ]),
    ).toEqual({
      ...SETTING_DEFAULTS,
      overspend_guard_percent: "off",
      school_name: "Invented School",
    });
  });

  it("the amount's stored text reads as a bigint, never a number (CLAUDE.md rule 6; review of the plan, Must fix 1)", () => {
    const values = settingsFrom([{ key: "overspend_guard_min_amount", value: "250000" }]);
    expect(values.overspend_guard_min_amount).toBe(250_000n);
    expect(settingsFrom([{ key: "overspend_guard_min_amount", value: "0" }])).toEqual({
      ...SETTING_DEFAULTS,
      overspend_guard_min_amount: 0n,
    });
  });

  it("an amount stored as a JSON number or with a sign throws", () => {
    for (const value of [250000, "-1", "01", "1.5"]) {
      expect(() => settingsFrom([{ key: "overspend_guard_min_amount", value }])).toThrow(
        /overspend_guard_min_amount/,
      );
    }
  });

  it("a stored value of the wrong shape throws, never guesses (CLAUDE.md, what matters most 1)", () => {
    expect(() => settingsFrom([{ key: "price_hint_percent", value: "20" }])).toThrow(
      /price_hint_percent/,
    );
  });
});

describe("changedSettings (plan of 1.1, decision 7)", () => {
  it("lists only the keys whose sent value differs from the value in force", () => {
    const current = { ...SETTING_DEFAULTS, school_year_start: { month: 9, day: 1 } };
    expect(
      changedSettings(current, {
        price_hint_percent: 20,
        reminder_hours: 12,
        school_year_start: { day: 1, month: 9 },
        school_name: "Invented School",
      }),
    ).toEqual(["school_name", "reminder_hours"]);
  });

  it("the default sent on an empty table changes nothing", () => {
    expect(
      changedSettings(SETTING_DEFAULTS, { ...SETTING_DEFAULTS, school_name: undefined }),
    ).toEqual([]);
  });

  it("0 and off are different values of the guard (08, Overspend guard)", () => {
    const current = { ...SETTING_DEFAULTS, overspend_guard_percent: 0 };
    expect(changedSettings(current, { overspend_guard_percent: GUARD_OFF })).toEqual([
      "overspend_guard_percent",
    ]);
  });
});

describe("storedSettingValue (plan of 2.1, decision 1; review of the plan, Must fix 1)", () => {
  it("writes the amount as decimal text, the one form the CHECK of 0018 accepts", () => {
    expect(storedSettingValue("overspend_guard_min_amount", 250_000n)).toBe("250000");
    expect(storedSettingValue("overspend_guard_min_amount", 0n)).toBe("0");
    expect(storedSettingValue("overspend_guard_min_amount", MONEY_MAX)).toBe("999999999999999");
  });

  it("is the way back from settingsFrom for every key", () => {
    const values = { ...SETTING_DEFAULTS, school_name: "Invented School" };
    const rows = SETTING_KEYS.filter((key) => values[key] !== null).map((key) => ({
      key,
      value: storedSettingValue(key, values[key]),
    }));
    expect(settingsFrom(rows)).toEqual(values);
  });

  it("the same amount again is no change; another amount is (decision 7 of 1.1)", () => {
    expect(changedSettings(SETTING_DEFAULTS, { overspend_guard_min_amount: 100_000n })).toEqual([]);
    expect(changedSettings(SETTING_DEFAULTS, { overspend_guard_min_amount: 0n })).toEqual([
      "overspend_guard_min_amount",
    ]);
  });
});
