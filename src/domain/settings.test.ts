import { describe, expect, it } from "vitest";

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
  lastDayOf,
  settingsFrom,
} from "./settings";

// build-plan 1.1; 14-data-model.md, Notes for the build (the keys and defaults); plan of 1.1,
// decisions 1, 2, 6, 7, 9 and 10.

describe("the settings keys and defaults (14-data-model.md, Notes for the build)", () => {
  it("has exactly the eight keys of the spec and D10", () => {
    expect([...SETTING_KEYS].sort()).toEqual(
      [
        "default_payment_type",
        "escalation_hours",
        "overspend_guard_percent",
        "price_hint_percent",
        "receipt_required_for_cash",
        "reminder_hours",
        "school_name",
        "school_year_start",
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
      reminder_hours: 24,
      escalation_hours: 48,
      receipt_required_for_cash: false,
      school_name: null,
      school_year_start: null,
    });
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
