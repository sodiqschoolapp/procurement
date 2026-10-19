import { describe, expect, it } from "vitest";

import { type Approver, type WaitingOrder, nearNotices, waitingNotices } from "./reminders";

// The grouping of the daily reminders (build-plan 8.1; 06-approval-workflow.md rule 9;
// 10-notifications-analytics-reports.md, Notifications; plan of 8.1, decided items 2, 3, 6 to 9).

const HOURS = { reminder: 24, escalation: 48 };
const late = (status: WaitingOrder["status"], branchId: string, escalated = false) => ({
  status,
  branchId,
  pastReminder: true,
  pastEscalation: escalated,
});

describe("waitingNotices() (06 rule 9: the approvers of their step; 10: grouped)", () => {
  it("counts for each approver only the orders at the approver's step (decided item 2)", () => {
    const orders = [
      late("PENDING_HEAD", "a"),
      late("PENDING_PRINCIPAL", "a"),
      late("PENDING_FINANCE", "a"),
      late("PENDING_FINANCE", "a"),
    ];
    const approvers: Approver[] = [
      { id: "head", role: "HEAD", branchIds: [] },
      { id: "principal", role: "PRINCIPAL", branchIds: ["a"] },
      { id: "finance", role: "FINANCE", branchIds: ["a"] },
    ];
    expect(waitingNotices(orders, approvers, HOURS)).toEqual([
      {
        type: "REQUEST_WAITING_24H",
        to: ["head"],
        params: { count: 1, hours: 24 },
        link: "/orders?status=PENDING_HEAD",
      },
      {
        type: "REQUEST_WAITING_24H",
        to: ["principal"],
        params: { count: 1, hours: 24 },
        link: "/orders?status=PENDING_PRINCIPAL",
      },
      {
        type: "REQUEST_WAITING_24H",
        to: ["finance"],
        params: { count: 2, hours: 24 },
        link: "/orders?status=PENDING_FINANCE",
      },
    ]);
  });

  it("cuts a Principal's or Finance user's count to their branches; the Head counts every branch (03 rule 1; decided item 6)", () => {
    const orders = [
      late("PENDING_FINANCE", "a"),
      late("PENDING_FINANCE", "b"),
      late("PENDING_FINANCE", "c"),
      late("PENDING_HEAD", "a"),
      late("PENDING_HEAD", "c"),
    ];
    const notices = waitingNotices(
      orders,
      [
        { id: "both", role: "FINANCE", branchIds: ["a", "b"] },
        { id: "one", role: "FINANCE", branchIds: ["c"] },
        { id: "head", role: "HEAD", branchIds: [] },
      ],
      HOURS,
    );
    const countOf = (id: string) =>
      notices.find((notice) => notice.to.includes(id) && notice.type === "REQUEST_WAITING_24H")
        ?.params.count;
    expect(countOf("both")).toBe(2);
    expect(countOf("one")).toBe(1);
    expect(countOf("head")).toBe(2);
  });

  it("tells each Head of every order past escalation_hours at any Waiting step, with that setting's hours (decided item 3)", () => {
    const orders = [
      late("PENDING_HEAD", "a", true),
      late("PENDING_PRINCIPAL", "b", true),
      late("PENDING_FINANCE", "c", true),
      late("PENDING_FINANCE", "c"),
    ];
    const notices = waitingNotices(
      orders,
      [
        { id: "h1", role: "HEAD", branchIds: [] },
        { id: "h2", role: "HEAD", branchIds: [] },
        { id: "p", role: "PRINCIPAL", branchIds: ["b"] },
      ],
      { reminder: 24, escalation: 36 },
    );
    expect(notices.filter((notice) => notice.type === "REQUEST_WAITING_48H")).toEqual([
      {
        type: "REQUEST_WAITING_48H",
        to: ["h1", "h2"],
        params: { count: 3, hours: 36 },
        link: "/orders?stuck=1",
      },
    ]);
  });

  it("sends nothing for a count of 0: orders not past the reminder, or at another branch", () => {
    const orders: WaitingOrder[] = [
      { status: "PENDING_PRINCIPAL", branchId: "a", pastReminder: false, pastEscalation: false },
      late("PENDING_PRINCIPAL", "b"),
    ];
    expect(
      waitingNotices(orders, [{ id: "p", role: "PRINCIPAL", branchIds: ["a"] }], HOURS),
    ).toEqual([]);
    expect(waitingNotices([], [{ id: "h", role: "HEAD", branchIds: [] }], HOURS)).toEqual([]);
  });
});

describe("nearNotices() (10: 'Needed-by date is 2 days away … | Owner'; decided items 6 and 7)", () => {
  it("gives one notice per owner and branch, with the branch's code, its count and its id", () => {
    const notices = nearNotices([
      { ownerId: "m1", branchId: "a", branchCode: "AAA" },
      { ownerId: "m1", branchId: "a", branchCode: "AAA" },
      { ownerId: "m1", branchId: "b", branchCode: "BBB" },
      { ownerId: "m2", branchId: "a", branchCode: "AAA" },
    ]);
    expect(notices).toEqual([
      {
        to: ["m1"],
        params: { count: 2, branch: "AAA" },
        branchId: "a",
        link: "/orders?branch=a&owner=m1&due=soon",
      },
      {
        to: ["m1"],
        params: { count: 1, branch: "BBB" },
        branchId: "b",
        link: "/orders?branch=b&owner=m1&due=soon",
      },
      {
        to: ["m2"],
        params: { count: 1, branch: "AAA" },
        branchId: "a",
        link: "/orders?branch=a&owner=m2&due=soon",
      },
    ]);
  });
});
