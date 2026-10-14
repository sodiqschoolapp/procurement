import { describe, expect, it } from "vitest";

import {
  BRANCH_ADDRESS_MAX,
  BRANCH_NAME_MAX,
  branchAddress,
  branchName,
  changedBranchFields,
  isBranchAddress,
  isBranchCode,
  isBranchName,
} from "./branches";

// 04-catalogs.md, Catalogs table, Branches ("The code is 2 to 4 Latin capital letters, unique")
// and rule 3 (names unique "ignoring capital letters and extra spaces"); plan of 1.2, decisions
// 8 and 9.

describe("isBranchCode (04, Branches)", () => {
  it.each(["AB", "ABC", "ABCD"])("takes %s", (code) => {
    expect(isBranchCode(code)).toBe(true);
  });

  it.each(["ab", "Ab", "chl", "A", "ABCDE", "AB1", "A B", "АБ", "", " AB", "AB "])(
    "refuses %j",
    (code) => {
      expect(isBranchCode(code)).toBe(false);
    },
  );

  it("refuses what is not a text", () => {
    expect(isBranchCode(12)).toBe(false);
    expect(isBranchCode(null)).toBe(false);
  });
});

describe("branchName and branchAddress (rule 3; decision 9)", () => {
  it("trims the name and collapses inner spaces", () => {
    expect(branchName("  Chilonzor   filiali \t 2 ")).toBe("Chilonzor filiali 2");
  });

  it("trims the address and keeps its inner spaces", () => {
    expect(branchAddress("  Sinov  ko'chasi 1 ")).toBe("Sinov  ko'chasi 1");
  });
});

describe("the limits (decision 9)", () => {
  it("a name: 1 to 120 code points, already trimmed and collapsed", () => {
    expect(isBranchName("")).toBe(false);
    expect(isBranchName("A".repeat(BRANCH_NAME_MAX))).toBe(true);
    expect(isBranchName("A".repeat(BRANCH_NAME_MAX + 1))).toBe(false);
    expect(isBranchName("Ғ".repeat(BRANCH_NAME_MAX))).toBe(true);
    expect(isBranchName(" Yunusobod")).toBe(false);
    expect(isBranchName("Yunusobod  filiali")).toBe(false);
  });

  it("an address: 1 to 300 code points, trimmed", () => {
    expect(isBranchAddress("")).toBe(false);
    expect(isBranchAddress("A".repeat(BRANCH_ADDRESS_MAX))).toBe(true);
    expect(isBranchAddress("A".repeat(BRANCH_ADDRESS_MAX + 1))).toBe(false);
    expect(isBranchAddress("Sinov  ko'chasi")).toBe(true);
    expect(isBranchAddress("Sinov ")).toBe(false);
  });
});

describe("changedBranchFields", () => {
  const current = { name: "Sinov filiali", code: "SIN", address: "Sinov ko'chasi 1" };

  it("lists only the fields sent with another value", () => {
    expect(changedBranchFields(current, {})).toEqual([]);
    expect(changedBranchFields(current, { name: "Sinov filiali", code: "SNV" })).toEqual(["code"]);
    expect(changedBranchFields(current, { address: "Boshqa", name: "Yangi" })).toEqual([
      "name",
      "address",
    ]);
  });
});
