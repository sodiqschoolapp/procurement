import { describe, expect, it } from "vitest";

import { waitsOn } from "./waits-on";

// The "your turn" mark of the order list (redesign of 21.10.2026, decision 8): a mark only, by
// role and status; a Manager's sent-back row only in a branch where the Manager may send it again
// (03-roles-and-permissions.md, Manager rights; plan review of the redesign, correction 2).

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function group(status: string, branchId = EA, owners: string[] = [ME]) {
  return { status, branchId, orders: owners.map((ownerId) => ({ ownerId })) } as Parameters<
    typeof waitsOn
  >[0];
}

describe("the your-turn mark of a list row", () => {
  it("a Manager's own sent-back row, in a branch where the Manager may add and send orders", () => {
    expect(waitsOn(group("RETURNED"), "MANAGER", ME, [EA])).toBe(true);
  });

  it("not in a branch where that right is off, with every other value letting it in", () => {
    expect(waitsOn(group("RETURNED", EB), "MANAGER", ME, [EA])).toBe(false);
    expect(waitsOn(group("RETURNED"), "MANAGER", ME, [])).toBe(false);
  });

  it("not when one order of the row is another owner's, nor on another status", () => {
    expect(waitsOn(group("RETURNED", EA, [ME, OTHER]), "MANAGER", ME, [EA])).toBe(false);
    expect(waitsOn(group("PENDING_HEAD"), "MANAGER", ME, [EA])).toBe(false);
  });

  it("each approver's own waiting step, and Finance's settlements", () => {
    expect(waitsOn(group("PENDING_HEAD"), "HEAD", ME, null)).toBe(true);
    expect(waitsOn(group("PENDING_PRINCIPAL"), "HEAD", ME, null)).toBe(false);
    expect(waitsOn(group("PENDING_PRINCIPAL"), "PRINCIPAL", ME, null)).toBe(true);
    expect(waitsOn(group("PENDING_FINANCE"), "FINANCE", ME, null)).toBe(true);
    expect(waitsOn(group("SETTLEMENT"), "FINANCE", ME, null)).toBe(true);
    expect(waitsOn(group("PURCHASING"), "FINANCE", ME, null)).toBe(false);
  });
});
