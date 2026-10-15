import { describe, expect, it } from "vitest";

import { isInternalLink, unreadCountLabel } from "./notifications";

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
