import { describe, expect, it } from "vitest";

import { isInternalLink, orderActionNotices, unreadCountLabel } from "./notifications";

// Plan of 0.11: the link of a notification is an address inside the app (review of the plan,
// Should fix 6; the same cases as notifications_link_check in
// src/server/db/schema/notifications.db.test.ts); the bell's number (Screens).

describe("isInternalLink (plan of 0.11, Should fix 6)", () => {
  it.each(["/", "/orders/1", "/notifications?page=2", "/a/b"])("accepts %j", (link) => {
    expect(isInternalLink(link)).toBe(true);
  });

  it.each([
    "https://x.example",
    "//x.example",
    "x",
    "",
    "/\\x.example",
    "/\t/x.example",
    "/\n/x.example",
    "/\r/x.example",
    "/ /x.example",
    "/a\u007fb",
    "/a\u00a0b",
    "/a\u2028b",
    "/ünicode",
    "javascript:alert(1)",
  ])("refuses %j", (link) => {
    expect(isInternalLink(link)).toBe(false);
  });
});

describe("unreadCountLabel (plan of 0.11, Screens: the count as a plain number)", () => {
  it.each([
    [0, null],
    [1, "1"],
    [99, "99"],
    [100, "99+"],
    [120, "99+"],
  ])("%i unread shows %j", (count, label) => {
    expect(unreadCountLabel(count)).toBe(label);
  });
});

describe("orderActionNotices (03 rule 1; 10, Notifications; permission review of 2.1, Must fix 1)", () => {
  it("an action on orders of two branches gives one notice per branch, each with its own count and code", () => {
    const orders = [
      ...Array.from({ length: 10 }, () => ({ branchId: "b-yun", branchCode: "YUN" })),
      ...Array.from({ length: 5 }, () => ({ branchId: "b-chl", branchCode: "CHL" })),
    ];
    expect(orderActionNotices("Demo Finance", orders)).toEqual([
      { branchId: "b-chl", params: { actor: "Demo Finance", count: 5, branch: "CHL" } },
      { branchId: "b-yun", params: { actor: "Demo Finance", count: 10, branch: "YUN" } },
    ]);
  });

  it('one branch: one notice with the whole count ("Dilnoza submitted 15 orders in CHL")', () => {
    const orders = Array.from({ length: 15 }, () => ({ branchId: "b-chl", branchCode: "CHL" }));
    expect(orderActionNotices("Dilnoza", orders)).toEqual([
      { branchId: "b-chl", params: { actor: "Dilnoza", count: 15, branch: "CHL" } },
    ]);
  });

  it("no orders: no notice", () => {
    expect(orderActionNotices("Demo", [])).toEqual([]);
  });
});
