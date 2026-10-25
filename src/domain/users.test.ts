import { describe, expect, it } from "vitest";

import {
  branchCountFits,
  changedUserFields,
  fullName,
  isFullName,
  isPhone,
  phone,
  staffedRoles,
  vacatedPlaces,
} from "./users";

// 04-catalogs.md, Catalogs table: Users; 03-roles-and-permissions.md, Roles table and rule 5;
// 10, Notifications: "Branch has no active user for a role"; plan of 1.3, decisions 7 and 11.

describe("user fields (04 Users; plan of 1.3, decision 11)", () => {
  it("stores a full name trimmed with inner spaces collapsed, 1 to 120 code points", () => {
    expect(fullName("  Aziza   Sinova ")).toBe("Aziza Sinova");
    expect(isFullName("Aziza Sinova")).toBe(true);
    expect(isFullName(" Aziza")).toBe(false);
    expect(isFullName("")).toBe(false);
    expect(isFullName("ж".repeat(120))).toBe(true);
    expect(isFullName("ж".repeat(121))).toBe(false);
  });

  it("stores a phone trimmed: 7 to 30 digits, spaces and + ( ) -", () => {
    expect(phone(" +998 90 000-00-01 ")).toBe("+998 90 000-00-01");
    expect(isPhone("+998 (90) 000-00-01")).toBe(true);
    expect(isPhone("123456")).toBe(false);
    expect(isPhone("1".repeat(31))).toBe(false);
    expect(isPhone("+998 90 abc")).toBe(false);
    expect(isPhone(" 1234567")).toBe(false);
  });
});

describe("branchCountFits (03, Roles table)", () => {
  it("a Head has none, a Principal exactly one, a Manager and Finance one or more", () => {
    expect([0, 1].map((count) => branchCountFits("HEAD", count))).toEqual([true, false]);
    expect([0, 1, 2].map((count) => branchCountFits("PRINCIPAL", count))).toEqual([
      false,
      true,
      false,
    ]);
    for (const role of ["MANAGER", "FINANCE"] as const) {
      expect([0, 1, 3].map((count) => branchCountFits(role, count))).toEqual([false, true, true]);
    }
  });
});

describe("changedUserFields", () => {
  const current = {
    fullName: "Aziza Sinova",
    username: "aziza",
    phone: "+998 90 000-00-01",
    locale: "uz" as const,
    branchIds: ["b1", "b2"],
  };

  it("lists only the fields sent with another value; branches compared as a set", () => {
    expect(changedUserFields(current, {})).toEqual([]);
    expect(
      changedUserFields(current, { branchIds: ["b2", "b1"], fullName: "Aziza Sinova" }),
    ).toEqual([]);
    expect(
      changedUserFields(current, { branchIds: ["b1"], locale: "ru", username: "aziza" }),
    ).toEqual(["locale", "branchIds"]);
  });
});

describe("vacatedPlaces (10, Notifications: Branch has no active user for a role)", () => {
  it("names each place held before and empty after, once; a place empty before is no news", () => {
    const before = [
      { branchId: "b1", role: "FINANCE" as const },
      { branchId: "b1", role: "FINANCE" as const },
      { branchId: "b1", role: "MANAGER" as const },
      { branchId: "b2", role: "FINANCE" as const },
    ];
    const after = [{ branchId: "b1", role: "MANAGER" as const }];
    expect(vacatedPlaces(before, after, true)).toEqual([
      { branchId: "b1", role: "FINANCE" },
      { branchId: "b2", role: "FINANCE" },
    ]);
    expect(vacatedPlaces([], after, true)).toEqual([]);
  });

  it("names no Finance place while the Finance step is off; a Manager or Principal place still (03 rule 5; 10 Notifications; plan of 4.10c)", () => {
    const before = [
      { branchId: "b1", role: "FINANCE" as const },
      { branchId: "b1", role: "MANAGER" as const },
      { branchId: "b1", role: "PRINCIPAL" as const },
    ];
    expect(vacatedPlaces(before, [], false)).toEqual([
      { branchId: "b1", role: "MANAGER" },
      { branchId: "b1", role: "PRINCIPAL" },
    ]);
  });
});

describe("staffedRoles (03 rule 5: 'while the Finance step is off, not for Finance'; plan of 4.10c)", () => {
  it("is Manager, Principal and Finance with the step on, and leaves Finance out with it off", () => {
    expect(staffedRoles(true)).toEqual(["MANAGER", "PRINCIPAL", "FINANCE"]);
    expect(staffedRoles(false)).toEqual(["MANAGER", "PRINCIPAL"]);
  });
});
