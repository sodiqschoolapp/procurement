import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { orderActions, orderEvents, orders, settings } from "@/server/db/schema";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { insertCategory, insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { advanceClock, setClock } from "../../../../tests/helpers/clock";
import {
  type OrderRow,
  insertDepartment,
  insertOrder,
  insertOrderExtra,
  setOrderStatus,
} from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { type ListFilters, NO_FILTERS } from "../list-filters";
import {
  listOrderFilterChoices,
  listOrderGroups,
  orderDownload,
  orderTotalsOnFilter,
  selectAllOnFilter,
  tickedSummary,
} from "./order-list";

// The order list (build plan 2.8): 05-order-request-form.md (Group rows 1, 2, 6; Ticking and
// filters), 06-approval-workflow.md (Statuses: a Draft is "visible to the owner and the Head
// only"; rule 8: at most 200), 03-roles-and-permissions.md (matrix "See orders, stock and
// reports"; rules 1 and 8), 15-quality-and-acceptance.md S19, 11-screens-and-ux.md rule 8; plan of
// 2.8 and its review. Every database file has its own database, but the tests of this file share
// it: each reads its own branch, or filters by it. Each passing row stands beside the row the
// guard keeps out (D40).

const filtered = (over: Partial<ListFilters>): ListFilters => ({ ...NO_FILTERS, ...over });

async function scene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id);
  const product = await insertProduct({ referencePrice: 5_000n });
  const base = {
    branchId: branch.id,
    ownerId: manager.id,
    departmentId: department.id,
    variantId: product.defaultVariantId,
  };
  return { branch, manager, department, product, base };
}

const order = (row: OrderRow) => insertOrder(row);

/**
 * A submitted order with one extra cost: written while Sent back, where the plan may change
 * (`order_extras_plan_frozen`), then moved to its status.
 */
async function orderWithExtra(row: OrderRow, amount: bigint) {
  const made = await insertOrder({ ...row, status: "RETURNED" });
  await insertOrderExtra(made.id, amount);
  await setOrderStatus(made.id, row.status ?? "PENDING_HEAD");
  return made;
}

describe("Done when: three submitted orders of one subtype make one group row (05 Group rows 1; S19)", () => {
  it("one row with the summed quantity, total, count and earliest needed-by; another status or branch is its own row", async () => {
    const { branch, manager, base } = await scene();
    const head = await insertUser("HEAD");
    const a = await order({
      ...base,
      status: "PENDING_HEAD",
      plannedQty: "10.000",
      neededBy: "2031-06-01",
    });
    const b = await order({
      ...base,
      status: "PENDING_HEAD",
      plannedQty: "10.000",
      neededBy: "2031-05-10",
    });
    const c = await orderWithExtra(
      { ...base, status: "PENDING_HEAD", plannedQty: "10.500", neededBy: "2031-07-01" },
      2_000n,
    );
    await order({ ...base, status: "PENDING_PRINCIPAL" });
    const other = await insertBranch();
    const otherDepartment = await insertDepartment(other.id);
    await order({
      ...base,
      branchId: other.id,
      departmentId: otherDepartment.id,
      ownerId: head.id,
      status: "PENDING_HEAD",
    });

    const page = await listOrderGroups(manager.id, filtered({ branch: branch.id }));
    expect(page.total).toBe(2);
    const group = page.groups.find((each) => each.status === "PENDING_HEAD")!;
    expect(group.summary).toMatchObject({
      quantity: "30.5",
      count: 3,
      earliestNeededBy: "2031-05-10",
      urgent: false,
      priceHint: null,
    });
    // 10 × 5 000 + 10 × 5 000 + 10.5 × 5 000 + 2 000 (08: the sums of the order values).
    expect(group.summary.totals.goods).toBe(152_500n);
    expect(group.summary.totals.grand).toBe(154_500n);
    expect(group.orders.map((each) => each.id).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(group.orders[0]).toMatchObject({ quantity: "10", ownerName: manager.fullName });
    expect(group.subtypeName).toBeNull();
  });

  it("S19: a second subtype of the same product is a row of its own, with its name", async () => {
    const { branch, manager, base, product } = await scene();
    const [tata, blue] = await insertSubtypes(product.id, [{ name: "Tata" }, { name: "Ko'k" }]);
    await order({ ...base, variantId: tata!, status: "PENDING_HEAD" });
    await order({ ...base, variantId: tata!, status: "PENDING_HEAD" });
    await order({ ...base, variantId: blue!, status: "PENDING_HEAD" });
    const page = await listOrderGroups(manager.id, filtered({ branch: branch.id }));
    expect(page.groups.map((group) => [group.subtypeName, group.summary.count]).sort()).toEqual([
      ["Ko'k", 1],
      ["Tata", 2],
    ]);
  });

  it("Urgent and the price hint of the group (05 Group rows 1; decided item 5, Look first)", async () => {
    const { branch, manager, base } = await scene();
    await order({ ...base, status: "PENDING_HEAD", plannedPrice: 6_750n });
    await order({
      ...base,
      status: "PENDING_HEAD",
      plannedPrice: 5_100n,
      priority: "URGENT",
      urgentReason: "Dars uchun",
    });
    const [group] = (await listOrderGroups(manager.id, filtered({ branch: branch.id }))).groups;
    expect(group!.summary.urgent).toBe(true);
    // 6 750 against 5 000 is +35%; 5 100 is within the 20% of the setting.
    expect(group!.summary.priceHint).toBe(35n);
  });
});

describe("Done when: each role sees only its branches' orders and nobody else's drafts (03 matrix; 06 Statuses)", () => {
  it("Head, Manager, Principal and Finance each see the groups of their branches only", async () => {
    const own = await scene();
    const other = await scene();
    await order({ ...own.base, status: "PENDING_FINANCE" });
    await order({ ...other.base, status: "PENDING_FINANCE" });
    const head = await insertUser("HEAD");
    const people = [
      own.manager,
      await insertUser("PRINCIPAL", { branches: [own.branch.id] }),
      await insertUser("FINANCE", { branches: [own.branch.id] }),
    ];
    for (const person of people) {
      const page = await listOrderGroups(person.id);
      expect(
        page.groups.map((group) => group.branchId),
        person.role,
      ).toEqual([own.branch.id]);
      await expect(
        listOrderGroups(person.id, filtered({ branch: other.branch.id })),
        person.role,
      ).rejects.toMatchObject({ kind: "not_found" });
    }
    const both = (await listOrderGroups(head.id)).groups.map((group) => group.branchId);
    expect(both).toEqual(expect.arrayContaining([own.branch.id, other.branch.id]));
  });

  it("no Draft is listed, never submitted or taken back, for anyone; Sent back is (decided item 1, Look first)", async () => {
    const { branch, manager, base } = await scene();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const head = await insertUser("HEAD");
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    const fresh = await order({ ...base, status: "DRAFT" });
    const takenBack = await order({
      ...base,
      departmentId: (await insertDepartment(branch.id)).id,
      status: "DRAFT",
      number: "TBK-26-0001",
    });
    const returned = await order({ ...base, status: "RETURNED" });
    for (const person of [manager, colleague, head, principal, finance]) {
      const page = await listOrderGroups(person.id, filtered({ branch: branch.id }));
      const ids = page.groups.flatMap((group) => group.orders.map((each) => each.id));
      expect(ids, person.role).toEqual([returned.id]);
      const all = await selectAllOnFilter(person.id, filtered({ branch: branch.id }));
      expect(
        all.orders.map((each) => each.id),
        person.role,
      ).toEqual([returned.id]);
      const summary = await tickedSummary(person.id, [fresh.id, takenBack.id, returned.id]);
      expect(summary.count, person.role).toBe(1);
      expect(summary.missing.sort(), person.role).toEqual([fresh.id, takenBack.id].sort());
    }
  });

  it('a Manager with CREATE_REQUESTS off still sees the list (03: "can only view orders")', async () => {
    const { branch, manager, base } = await scene();
    await order({ ...base, status: "PENDING_HEAD" });
    await setManagerRight(manager.id, "CREATE_REQUESTS", false);
    expect((await listOrderGroups(manager.id, filtered({ branch: branch.id }))).total).toBe(1);
  });
});

describe("Ticking: select all on this filter, up to 200 (05 Ticking and filters; decided item 6)", () => {
  it("205 matching orders give the first 200 and say 205 match", async () => {
    const { branch, manager, base } = await scene();
    for (let index = 0; index < 205; index += 1) {
      await order({
        ...base,
        status: "PENDING_HEAD",
        number: `SAL-26-${String(index + 1).padStart(4, "0")}`,
      });
    }
    const all = await selectAllOnFilter(manager.id, filtered({ branch: branch.id }));
    expect(all.matching).toBe(205);
    expect(all.orders).toHaveLength(200);
  });

  it("takes the orders in the list's order: groups as listed, each oldest first", async () => {
    const { branch, manager, base } = await scene();
    setClock(new Date("2026-10-16T05:00:00Z"));
    const later = await insertProduct();
    const x1 = await order({
      ...base,
      status: "PENDING_HEAD",
      neededBy: "2031-05-01",
      number: "SOR-26-0002",
    });
    const x2 = await order({
      ...base,
      status: "PENDING_HEAD",
      neededBy: "2031-09-01",
      number: "SOR-26-0001",
    });
    const y = await order({
      ...base,
      variantId: later.defaultVariantId,
      status: "PENDING_HEAD",
      neededBy: "2031-06-01",
    });
    const all = await selectAllOnFilter(manager.id, filtered({ branch: branch.id }));
    // The group of x1 and x2 needs its first date earlier; inside it the lower number first, the
    // submit times being equal (05 Group rows 6).
    expect(all.orders.map((each) => each.id)).toEqual([x2.id, x1.id, y.id]);
  });
});

describe("tickedSummary: the action bar (11 Order list layout 4; 06 rule 8; decided items 7 and 16)", () => {
  it("count, totals and the actions allowed on all ticked orders", async () => {
    const { base } = await scene();
    const head = await insertUser("HEAD");
    const a = await order({ ...base, status: "PENDING_HEAD" });
    const b = await orderWithExtra(
      { ...base, status: "PENDING_HEAD", paymentType: "TRANSFER", plannedQty: "2.000" },
      3_000n,
    );
    const summary = await tickedSummary(head.id, [a.id, b.id]);
    expect(summary).toMatchObject({ count: 2, missing: [] });
    expect(summary.totals).toEqual({
      goods: 60_000n,
      extras: 3_000n,
      grand: 63_000n,
      byPaymentType: { CASH: 50_000n, TRANSFER: 13_000n, CARD: 0n },
    });
    expect(summary.actions).toEqual(["APPROVE", "SEND_BACK", "REJECT", "CANCEL"]);
    const c = await order({ ...base, status: "PENDING_PRINCIPAL" });
    // Send back and Reject at the second step are the Principal's (review of the plan, decision 5).
    expect((await tickedSummary(head.id, [a.id, b.id, c.id])).actions).toEqual(["CANCEL"]);
  });

  it("an order of another branch and an unknown id are missing alike for the Principal (03 rule 1)", async () => {
    const own = await scene();
    const other = await scene();
    const principal = await insertUser("PRINCIPAL", { branches: [own.branch.id] });
    const mine = await order({ ...own.base, status: "PENDING_PRINCIPAL" });
    const theirs = await order({ ...other.base, status: "PENDING_PRINCIPAL" });
    const unknown = randomUUID();
    const summary = await tickedSummary(principal.id, [mine.id, theirs.id, unknown]);
    expect(summary.count).toBe(1);
    expect(summary.missing).toEqual([theirs.id, unknown]);
    expect(summary.totals.grand).toBe(50_000n);
    expect(summary.actions).toEqual(["APPROVE", "SEND_BACK", "REJECT"]);
  });

  it("refuses 201 ids and an id ticked twice (06 rule 8)", async () => {
    const { manager } = await scene();
    const many = Array.from({ length: 201 }, () => randomUUID());
    await expect(tickedSummary(manager.id, many)).rejects.toThrow(
      expect.objectContaining({ name: "ZodError", message: expect.stringContaining("too_big") }),
    );
    const one = randomUUID();
    await expect(tickedSummary(manager.id, [one, one])).rejects.toThrow(
      expect.objectContaining({
        name: "ZodError",
        message: expect.stringContaining("An order is ticked twice"),
      }),
    );
    expect((await tickedSummary(manager.id, many.slice(0, 200))).missing).toHaveLength(200);
  });
});

describe("tickedSummary: Record purchase on ticked orders (07 One trip, many orders; plan of 3.4, decided item 11)", () => {
  it("offered on Open orders of one branch the user may record; not with a finished order, two branches, or for the Principal and Finance", async () => {
    const own = await scene();
    const other = await scene();
    const head = await insertUser("HEAD");
    const principal = await insertUser("PRINCIPAL", { branches: [own.branch.id] });
    const finance = await insertUser("FINANCE", { branches: [own.branch.id] });
    const a = await order({ ...own.base, status: "PURCHASING" });
    const b = await order({ ...own.base, status: "PURCHASING" });
    const done = await order({ ...own.base, status: "PURCHASING" });
    await db.update(orders).set({ progress: "DONE" }).where(eq(orders.id, done.id));
    const elsewhere = await order({ ...other.base, status: "PURCHASING" });

    expect((await tickedSummary(own.manager.id, [a.id, b.id])).recordTrip).toBe(true);
    expect((await tickedSummary(head.id, [a.id, b.id])).recordTrip).toBe(true);
    expect((await tickedSummary(head.id, [a.id, done.id])).recordTrip).toBe(false);
    expect((await tickedSummary(head.id, [a.id, elsewhere.id])).recordTrip).toBe(false);
    expect((await tickedSummary(principal.id, [a.id, b.id])).recordTrip).toBe(false);
    expect((await tickedSummary(finance.id, [a.id, b.id])).recordTrip).toBe(false);
    // An order still waiting for approval beside an Open one hides it too.
    const waiting = await order({ ...own.base, status: "PENDING_HEAD" });
    expect((await tickedSummary(head.id, [a.id, waiting.id])).recordTrip).toBe(false);
  });

  it("a Manager of two branches ticking own Open orders in both: not offered; in one of them: offered", async () => {
    const own = await scene();
    const other = await scene();
    const manager = await insertUser("MANAGER", { branches: [own.branch.id, other.branch.id] });
    const here = await order({ ...own.base, ownerId: manager.id, status: "PURCHASING" });
    const there = await order({ ...other.base, ownerId: manager.id, status: "PURCHASING" });
    const hereToo = await order({ ...own.base, ownerId: manager.id, status: "PURCHASING" });
    expect((await tickedSummary(manager.id, [here.id, there.id])).recordTrip).toBe(false);
    expect((await tickedSummary(manager.id, [here.id, hereToo.id])).recordTrip).toBe(true);
  });

  it("a Manager ticking only a colleague's Open orders: not offered; with one own order added: offered; with RECORD_PURCHASES off: not offered", async () => {
    const { branch, base } = await scene();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const theirs = await order({ ...base, status: "PURCHASING" });
    const theirsToo = await order({ ...base, status: "PURCHASING" });
    const mine = await order({ ...base, ownerId: manager.id, status: "PURCHASING" });
    expect((await tickedSummary(manager.id, [theirs.id, theirsToo.id])).recordTrip).toBe(false);
    expect((await tickedSummary(manager.id, [theirs.id, mine.id])).recordTrip).toBe(true);
    await setManagerRight(manager.id, "RECORD_PURCHASES", false);
    expect((await tickedSummary(manager.id, [theirs.id, mine.id])).recordTrip).toBe(false);
  });
});

describe("tickedSummary: Finish order, Not bought, Reopen buying (07 Order progress; plan of 3.5)", () => {
  /** A record of `qty` written straight into the table, for the received rule. */
  async function received(
    base: { branchId: string; ownerId: string },
    orderId: string,
    qty: string,
  ) {
    const [row] = await db
      .select({ variantId: orders.variantId })
      .from(orders)
      .where(eq(orders.id, orderId));
    const tripId = (await insertTrip(base.branchId, base.ownerId)).rows[0]!.id;
    await insertPurchaseRow({
      tripId,
      orderId,
      branchId: base.branchId,
      variantId: row!.variantId!,
      createdBy: base.ownerId,
      qty,
    });
  }

  it("the action every ticked order allows, from what each has received; nothing for Principal and Finance", async () => {
    const own = await scene();
    const head = await insertUser("HEAD");
    const principal = await insertUser("PRINCIPAL", { branches: [own.branch.id] });
    const finance = await insertUser("FINANCE", { branches: [own.branch.id] });
    const part = await order({ ...own.base, status: "PURCHASING" });
    const partToo = await order({ ...own.base, status: "PURCHASING" });
    const empty = await order({ ...own.base, status: "PURCHASING" });
    const short = await order({ ...own.base, status: "PURCHASING" });
    await received(own.base, part.id, "1");
    await received(own.base, partToo.id, "2");
    await received(own.base, short.id, "1");
    await db
      .update(orders)
      .set({ progress: "DONE_SHORT", finishReason: "Not in the shop" })
      .where(eq(orders.id, short.id));

    expect((await tickedSummary(own.manager.id, [part.id, partToo.id])).buying).toEqual([
      "FINISH_ORDER",
    ]);
    expect((await tickedSummary(head.id, [empty.id])).buying).toEqual(["MARK_NOT_BOUGHT"]);
    expect((await tickedSummary(head.id, [short.id])).buying).toEqual(["REOPEN_BUYING"]);
    expect((await tickedSummary(head.id, [part.id, empty.id])).buying).toEqual([]);
    expect((await tickedSummary(head.id, [part.id, short.id])).buying).toEqual([]);
    expect((await tickedSummary(principal.id, [part.id])).buying).toEqual([]);
    expect((await tickedSummary(finance.id, [part.id])).buying).toEqual([]);
  });

  it("a colleague's order or RECORD_PURCHASES off: nothing offered to the Manager", async () => {
    const { branch, base } = await scene();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const theirs = await order({ ...base, status: "PURCHASING" });
    const mine = await order({ ...base, ownerId: manager.id, status: "PURCHASING" });
    expect((await tickedSummary(manager.id, [mine.id])).buying).toEqual(["MARK_NOT_BOUGHT"]);
    expect((await tickedSummary(manager.id, [theirs.id, mine.id])).buying).toEqual([]);
    await setManagerRight(manager.id, "RECORD_PURCHASES", false);
    expect((await tickedSummary(manager.id, [mine.id])).buying).toEqual([]);
  });
});

describe("each filter of 05 Ticking and filters", () => {
  it("dates by kind, as Tashkent days (CLAUDE.md rule 10; decided item 11, Look first)", async () => {
    const { branch, manager, base } = await scene();
    // 16 October 23:30 in Tashkent is 18:30 UTC; 17 October 00:30 is 19:30 UTC on the 16th.
    const late = await order({
      ...base,
      status: "CLOSED",
      createdAt: new Date("2026-10-16T18:30:00Z"),
      submittedAt: new Date("2026-10-16T18:30:00Z"),
      approvedAt: new Date("2026-10-16T18:30:00Z"),
      closedAt: new Date("2026-10-16T18:30:00Z"),
    });
    const next = await order({
      ...base,
      status: "CLOSED",
      createdAt: new Date("2026-10-16T19:30:00Z"),
      submittedAt: new Date("2026-10-16T19:30:00Z"),
      approvedAt: new Date("2026-10-16T19:30:00Z"),
      closedAt: new Date("2026-10-16T19:30:00Z"),
    });
    const ids = async (over: Partial<ListFilters>) =>
      (await selectAllOnFilter(manager.id, filtered({ branch: branch.id, ...over }))).orders.map(
        (each) => each.id,
      );
    for (const dates of ["created", "submitted", "approved", "closed"] as const) {
      expect(await ids({ dates, from: "2026-10-16", to: "2026-10-16" }), dates).toEqual([late.id]);
      expect(await ids({ dates, from: "2026-10-17" }), dates).toEqual([next.id]);
      expect(await ids({ dates, to: "2026-10-15" }), dates).toEqual([]);
    }
    const waiting = await order({
      ...base,
      status: "PENDING_HEAD",
      createdAt: new Date("2026-10-16T18:30:00Z"),
    });
    // An order not yet approved has no approval date.
    expect(await ids({ dates: "approved", from: "2026-10-16", to: "2026-10-16" })).toEqual([
      late.id,
    ]);
    expect(await ids({ dates: "created", from: "2026-10-16", to: "2026-10-16" })).toEqual(
      expect.arrayContaining([late.id, waiting.id]),
    );
  });

  it("status, owner, department, category, payment type and Urgent", async () => {
    const { branch, manager, base } = await scene();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const department = await insertDepartment(branch.id);
    const category = await insertCategory();
    const inCategory = await insertProduct({ categoryId: category.id });
    const plain = await order({ ...base, status: "PENDING_HEAD" });
    const theirs = await order({ ...base, ownerId: colleague.id, status: "PENDING_PRINCIPAL" });
    const elsewhere = await order({ ...base, departmentId: department.id, status: "PENDING_HEAD" });
    const categorised = await order({
      ...base,
      variantId: inCategory.defaultVariantId,
      status: "PENDING_HEAD",
    });
    const card = await order({ ...base, paymentType: "CARD", status: "PENDING_HEAD" });
    const urgent = await order({
      ...base,
      priority: "URGENT",
      urgentReason: "Tez kerak",
      status: "PENDING_HEAD",
    });
    const ids = async (over: Partial<ListFilters>) =>
      (await selectAllOnFilter(manager.id, filtered({ branch: branch.id, ...over }))).orders
        .map((each) => each.id)
        .sort();
    expect(await ids({ status: "PENDING_PRINCIPAL" })).toEqual([theirs.id]);
    expect(await ids({ owner: colleague.id })).toEqual([theirs.id]);
    expect(await ids({ department: department.id })).toEqual([elsewhere.id]);
    expect(await ids({ category: category.id })).toEqual([categorised.id]);
    expect(await ids({ payment: "CARD" })).toEqual([card.id]);
    expect(await ids({ urgent: true })).toEqual([urgent.id]);
    expect(await ids({})).toEqual(
      [plain.id, theirs.id, elsewhere.id, categorised.id, card.id, urgent.id].sort(),
    );
  });

  it("due=soon: still waiting, needed by today + 7 or earlier, by the Tashkent date (plan of 6.1, decided item 2)", async () => {
    // 16 October 20:00 UTC is already 17 October in Tashkent: today + 7 is 24 October.
    setClock("2026-10-16T20:00:00Z");
    const { branch, manager, base } = await scene();
    const lastDay = await order({ ...base, status: "PENDING_HEAD", neededBy: "2026-10-24" });
    const overdue = await order({ ...base, status: "RETURNED", neededBy: "2026-10-01" });
    const buying = await order({ ...base, status: "PURCHASING", neededBy: "2026-10-20" });
    const pending = await order({ ...base, status: "PENDING_FINANCE", neededBy: "2026-10-17" });
    // Kept out, each with every other value that would let it in.
    await order({ ...base, status: "PENDING_HEAD", neededBy: "2026-10-25" });
    await order({
      ...base,
      status: "PURCHASING",
      progress: "DONE",
      neededBy: "2026-10-20",
      approvedAt: now(),
    });
    await order({ ...base, status: "SETTLEMENT", neededBy: "2026-10-20", approvedAt: now() });
    await order({ ...base, status: "CLOSED", neededBy: "2026-10-20", closedAt: now() });
    await order({ ...base, status: "REJECTED", neededBy: "2026-10-20" });
    await order({ ...base, status: "DRAFT", number: "QQ-26-0001", neededBy: "2026-10-20" });
    const other = await scene();
    await order({
      ...other.base,
      ownerId: manager.id,
      status: "PENDING_HEAD",
      neededBy: "2026-10-20",
    });
    const ids = async (over: Partial<ListFilters>) =>
      (await selectAllOnFilter(manager.id, filtered(over))).orders.map((each) => each.id).sort();
    expect(await ids({ branch: branch.id, dueSoon: true })).toEqual(
      [lastDay.id, overdue.id, buying.id, pending.id].sort(),
    );
    // Another branch's order of the same owner stays out: the branch wall, not the branch filter.
    expect(await ids({ owner: manager.id, dueSoon: true })).toEqual(
      [lastDay.id, overdue.id, buying.id, pending.id].sort(),
    );
  });

  it("a number range: one branch code and year, the counter as an integer (decided item 10)", async () => {
    const { branch, manager, base } = await scene();
    const numbered = async (number: string) =>
      (await order({ ...base, status: "PENDING_HEAD", number })).id;
    const n1 = await numbered("RNG-26-0001");
    const n2 = await numbered("RNG-26-0002");
    const n10 = await numbered("RNG-26-0010");
    const n9999 = await numbered("RNG-26-9999");
    const n10000 = await numbered("RNG-26-10000");
    await numbered("RNG-25-0005");
    const ids = async (over: Partial<ListFilters>) =>
      (await selectAllOnFilter(manager.id, filtered({ branch: branch.id, ...over }))).orders
        .map((each) => each.id)
        .sort();
    expect(await ids({ numberFrom: "RNG-26-0002", numberTo: "RNG-26-0010" })).toEqual(
      [n2, n10].sort(),
    );
    expect(await ids({ numberFrom: "RNG-26-9999" })).toEqual([n9999, n10000].sort());
    expect(await ids({ numberTo: "RNG-26-0001" })).toEqual([n1]);
  });

  it("stuck=1: at a Waiting step, entered more than escalation_hours ago by the injected clock (06 rule 9; plan of 6.2, decided items 1 and 2; review correction 2)", async () => {
    setClock("2026-10-10T05:00:00Z");
    const { branch, manager, base } = await scene();
    const enter = async (
      orderId: string,
      type: (typeof orderEvents.$inferInsert)["type"],
      fromStatus: (typeof orderEvents.$inferInsert)["fromStatus"],
      toStatus: (typeof orderEvents.$inferInsert)["toStatus"],
    ) => {
      const [action] = await db
        .insert(orderActions)
        .values({
          clientKey: randomUUID(),
          type,
          actorId: manager.id,
          orderCount: 1,
          createdAt: now(),
        })
        .returning({ id: orderActions.id });
      await db.insert(orderEvents).values({
        orderId,
        actionId: action!.id,
        type,
        fromStatus,
        toStatus,
        actorId: manager.id,
        createdAt: now(),
      });
    };
    // Entered 48 h + 1 min before the clock below: stuck at each Waiting step.
    const head = await order({ ...base, status: "PENDING_HEAD" });
    await enter(head.id, "SUBMIT", "DRAFT", "PENDING_HEAD");
    const finance = await order({ ...base, status: "PENDING_FINANCE" });
    await enter(finance.id, "APPROVE", "PENDING_PRINCIPAL", "PENDING_FINANCE");
    // A move that changes no status does not restart the count (decided item 1).
    advanceClock({ hours: 30 });
    await enter(finance.id, "MOVE_OWNER", "PENDING_FINANCE", "PENDING_FINANCE");
    // Sent back by the Principal and submitted again: counted from the newest Submit (correction 3),
    // although its first Waiting for Head entry is older.
    const resubmitted = await order({ ...base, status: "PENDING_HEAD" });
    setClock("2026-10-10T05:00:00Z");
    await enter(resubmitted.id, "SUBMIT", "DRAFT", "PENDING_HEAD");
    advanceClock({ hours: 40 });
    await enter(resubmitted.id, "SEND_BACK", "PENDING_PRINCIPAL", "RETURNED");
    await enter(resubmitted.id, "SUBMIT_AGAIN", "RETURNED", "PENDING_HEAD");
    // Entered exactly 48 h before: not stuck. Sent back, Open and Waiting for settlement entered
    // as long ago: not Waiting steps.
    setClock("2026-10-10T05:01:00Z");
    const edge = await order({ ...base, status: "PENDING_PRINCIPAL" });
    await enter(edge.id, "APPROVE", "PENDING_HEAD", "PENDING_PRINCIPAL");
    setClock("2026-10-10T05:00:00Z");
    const returned = await order({ ...base, status: "RETURNED" });
    await enter(returned.id, "SEND_BACK", "PENDING_HEAD", "RETURNED");
    const open = await order({ ...base, status: "PURCHASING", approvedAt: now() });
    await enter(open.id, "APPROVE", "PENDING_FINANCE", "PURCHASING");
    const settling = await order({ ...base, status: "SETTLEMENT", approvedAt: now() });
    await enter(settling.id, "SEND_TO_SETTLEMENT", "PURCHASING", "SETTLEMENT");
    // Another branch's stuck order of the same owner: only the branch wall keeps it out.
    const other = await scene();
    const elsewhere = await order({ ...other.base, ownerId: manager.id, status: "PENDING_HEAD" });
    await enter(elsewhere.id, "SUBMIT", "DRAFT", "PENDING_HEAD");

    setClock("2026-10-12T05:01:00Z");
    const ids = async (over: Partial<ListFilters>) =>
      (await selectAllOnFilter(manager.id, filtered(over))).orders.map((each) => each.id).sort();
    expect(await ids({ branch: branch.id, stuck: true })).toEqual([head.id, finance.id].sort());
    const groups = await listOrderGroups(manager.id, filtered({ branch: branch.id, stuck: true }));
    expect(groups.groups.flatMap((group) => group.orders.map((each) => each.id)).sort()).toEqual(
      [head.id, finance.id].sort(),
    );
    const finance1 = await insertUser("FINANCE", { branches: [branch.id] });
    expect(
      (await selectAllOnFilter(finance1.id, filtered({ stuck: true }))).orders
        .map((each) => each.id)
        .sort(),
    ).toEqual([head.id, finance.id].sort());

    // The setting moves the edge: at 24 hours the resubmitted order (8 h ago) is still out, the
    // exact-edge order is in.
    await db
      .insert(settings)
      .values({ key: "escalation_hours", value: 24, createdAt: now() })
      .onConflictDoUpdate({ target: settings.key, set: { value: 24 } });
    try {
      expect(await ids({ branch: branch.id, stuck: true })).toEqual(
        [head.id, finance.id, edge.id].sort(),
      );
    } finally {
      await db
        .insert(settings)
        .values({ key: "escalation_hours", value: 48, createdAt: now() })
        .onConflictDoUpdate({ target: settings.key, set: { value: 48 } });
    }
  });

  it('the orders of one action: the notification\'s link (progress 2.7, "For 2.8")', async () => {
    const { branch, manager, base } = await scene();
    const a = await order({ ...base, status: "PENDING_HEAD" });
    const b = await order({ ...base, status: "PENDING_HEAD" });
    await order({ ...base, status: "PENDING_HEAD" });
    const [action] = await db
      .insert(orderActions)
      .values({
        clientKey: randomUUID(),
        type: "SUBMIT",
        actorId: manager.id,
        orderCount: 2,
        createdAt: now(),
      })
      .returning({ id: orderActions.id });
    for (const each of [a, b]) {
      await db.insert(orderEvents).values({
        orderId: each.id,
        actionId: action!.id,
        type: "SUBMIT",
        fromStatus: "DRAFT",
        toStatus: "PENDING_HEAD",
        actorId: manager.id,
        createdAt: now(),
      });
    }
    const all = await selectAllOnFilter(
      manager.id,
      filtered({ branch: branch.id, action: action!.id }),
    );
    expect(all.orders.map((each) => each.id).sort()).toEqual([a.id, b.id].sort());
    // The same link opened by a user of another branch shows nothing of it.
    const stranger = await insertUser("MANAGER", { branches: [(await insertBranch()).id] });
    expect((await selectAllOnFilter(stranger.id, filtered({ action: action!.id }))).matching).toBe(
      0,
    );
  });
});

describe("the order of the list (05 Group rows 6; decided items 9 and 14)", () => {
  it("oldest first: a tie of submit times goes to the lower number, 9999 before 10000", async () => {
    const { branch, manager, base } = await scene();
    setClock(new Date("2026-10-16T05:00:00Z"));
    const big = await order({ ...base, status: "PENDING_HEAD", number: "ODR-26-10000" });
    const small = await order({ ...base, status: "PENDING_HEAD", number: "ODR-26-9999" });
    const [group] = (
      await listOrderGroups(manager.id, filtered({ branch: branch.id, sort: "submitted" }))
    ).groups;
    expect(group!.orders.map((each) => each.id)).toEqual([small.id, big.id]);
  });

  it("groups by earliest submit, then lower number, with sort=submitted", async () => {
    const { branch, manager, base } = await scene();
    const second = await insertProduct();
    await order({
      ...base,
      status: "PENDING_HEAD",
      number: "OSB-26-10000",
      submittedAt: new Date("2026-10-10T05:00:00Z"),
    });
    await order({
      ...base,
      variantId: second.defaultVariantId,
      status: "PENDING_HEAD",
      number: "OSB-26-9999",
      submittedAt: new Date("2026-10-10T05:00:00Z"),
    });
    const groups = (
      await listOrderGroups(manager.id, filtered({ branch: branch.id, sort: "submitted" }))
    ).groups;
    expect(groups.map((group) => group.variantId)).toEqual([
      second.defaultVariantId,
      base.variantId,
    ]);
  });

  it("Urgent groups first for the Head, the Principal and Finance, not for the Manager (05 field 14)", async () => {
    const { branch, manager, base } = await scene();
    const urgentProduct = await insertProduct();
    await order({ ...base, status: "PENDING_HEAD", neededBy: "2031-05-01" });
    await order({
      ...base,
      variantId: urgentProduct.defaultVariantId,
      status: "PENDING_HEAD",
      neededBy: "2031-09-01",
      priority: "URGENT",
      urgentReason: "Tez kerak",
    });
    const firstOf = async (userId: string) =>
      (await listOrderGroups(userId, filtered({ branch: branch.id }))).groups[0]!.variantId;
    expect(await firstOf(manager.id)).toBe(base.variantId);
    for (const role of ["HEAD", "PRINCIPAL", "FINANCE"] as const) {
      const person = await insertUser(role, { branches: role === "HEAD" ? [] : [branch.id] });
      expect(await firstOf(person.id), role).toBe(urgentProduct.defaultVariantId);
    }
  });
});

describe("paging: 25 group rows a page from the server (11 rule 8)", () => {
  it("26 groups give pages of 25 and 1; a page past the last gives the last", async () => {
    const { branch, manager, base } = await scene();
    for (let index = 0; index < 26; index += 1) {
      await order({
        ...base,
        variantId: (await insertProduct()).defaultVariantId,
        status: "PENDING_HEAD",
      });
    }
    const first = await listOrderGroups(manager.id, filtered({ branch: branch.id }), 1);
    expect(first).toMatchObject({ page: 1, pages: 2, total: 26 });
    expect(first.groups).toHaveLength(25);
    const last = await listOrderGroups(manager.id, filtered({ branch: branch.id }), 9);
    expect(last.page).toBe(2);
    expect(last.groups).toHaveLength(1);
    expect(first.groups.map((group) => group.key)).not.toContain(last.groups[0]!.key);
  });
});

describe("the filter choices: only of the branches the user sees (03 rule 1; decided item 12)", () => {
  it("owners of listed orders and departments of own branches; another branch's are left out", async () => {
    const own = await scene();
    const other = await scene();
    await order({ ...own.base, status: "PENDING_HEAD" });
    await order({ ...other.base, status: "PENDING_HEAD" });
    const choices = await listOrderFilterChoices(own.manager.id);
    expect(choices.owners.map((each) => each.id)).toEqual([own.manager.id]);
    const departments = choices.departments.map((each) => each.id);
    expect(departments).toContain(own.department.id);
    expect(departments).not.toContain(other.department.id);
  });
});

describe("the three colours of orders, group rows and ticked orders (08 The three colours; plan of 3.8)", () => {
  /** One record of `qty` at `unitPrice` for the order, in a trip of its own. */
  async function bought(
    made: { id: string; branchId: string; variantId: string; ownerId: string },
    qty: string,
    unitPrice: string,
  ) {
    const tripId = (await insertTrip(made.branchId, made.ownerId)).rows[0]!.id;
    await insertPurchaseRow({
      tripId,
      orderId: made.id,
      branchId: made.branchId,
      variantId: made.variantId,
      createdBy: made.ownerId,
      qty,
      unitPrice,
    });
  }

  const plan = { plannedQty: "100.000", plannedPrice: 5_000n } as const;

  it("red beats orange, orange beats green on a group row; the ticked orders give the same; Total from the summed difference", async () => {
    const { branch, manager, product, base } = await scene();
    const exact = await order({ ...base, ...plan, status: "PURCHASING", progress: "DONE" });
    await bought(exact, "100", "5000");
    const fewer = await order({
      ...base,
      ...plan,
      status: "PURCHASING",
      progress: "DONE_SHORT",
      finishReason: "The shop ran out",
    });
    await bought(fewer, "90", "5000");
    const over = await order({ ...base, ...plan, status: "PURCHASING", progress: "DONE" });
    await bought(over, "110", "5000");
    // A Sent back order of the same subtype: its own group, no colours, and left out of a ticked
    // set's sum (decided item 5).
    const sentBack = await order({ ...base, ...plan, status: "RETURNED" });
    // Another branch's Open order of the same product, bought dearer (D40): not in this list.
    const elsewhere = await scene();
    const theirs = await order({
      ...elsewhere.base,
      variantId: product.defaultVariantId,
      ...plan,
      status: "PURCHASING",
      progress: "DONE",
    });
    await bought(theirs, "100", "9000");

    const { groups } = await listOrderGroups(manager.id, filtered({ branch: branch.id }));
    const open = groups.find((group) => group.status === "PURCHASING")!;
    expect(open.orders.map((each) => each.id).sort()).toEqual([exact.id, fewer.id, over.id].sort());
    expect(open.colours).toEqual({
      number: { colour: "red", orders: 1 },
      price: { colour: "green", orders: 3 },
      total: { colour: "green", difference: 0n },
    });
    const byId = new Map(open.orders.map((each) => [each.id, each.colours]));
    expect(byId.get(exact.id)?.number).toEqual({ colour: "green", difference: "0" });
    expect(byId.get(fewer.id)).toEqual({
      number: { colour: "amber", difference: "10" },
      price: { colour: "green", difference: 0n },
      total: { colour: "amber", difference: 50_000n },
    });
    expect(byId.get(over.id)?.total).toEqual({ colour: "red", difference: -50_000n });
    // Without a filter the branch wall alone keeps the other branch's dearer order out (03 rule 1).
    const unfiltered = (await listOrderGroups(manager.id, NO_FILTERS)).groups.find(
      (group) => group.key === open.key,
    )!;
    expect(unfiltered.orders.map((each) => each.id).sort()).toEqual(
      [exact.id, fewer.id, over.id].sort(),
    );
    expect(unfiltered.colours).toEqual(open.colours);
    expect(
      (await listOrderGroups(manager.id, NO_FILTERS)).groups.flatMap((group) =>
        group.orders.map((each) => each.id),
      ),
    ).not.toContain(theirs.id);
    const returned = groups.find((group) => group.status === "RETURNED")!;
    expect(returned.colours).toBeNull();
    expect(returned.orders[0]!.colours).toBeNull();

    const ticked = await tickedSummary(manager.id, [exact.id, fewer.id, over.id, sentBack.id]);
    expect(ticked.colours).toEqual(open.colours);
    // Without the red order, orange wins over green.
    expect((await tickedSummary(manager.id, [exact.id, fewer.id])).colours).toEqual({
      number: { colour: "amber", orders: 1 },
      price: { colour: "green", orders: 2 },
      total: { colour: "amber", difference: 50_000n },
    });
    // Another branch's order is missing, never counted (03 rule 1).
    const withTheirs = await tickedSummary(manager.id, [exact.id, theirs.id]);
    expect(withTheirs.missing).toEqual([theirs.id]);
    expect(withTheirs.colours).toEqual({
      number: { colour: "green", orders: 1 },
      price: { colour: "green", orders: 1 },
      total: { colour: "green", difference: 0n },
    });
    // Only a Sent back order: no colours.
    expect((await tickedSummary(manager.id, [sentBack.id])).colours).toBeNull();
  });

  it("an order still buying makes the group's Total grey; Number and Price come from the orders that have one (decided item 4)", async () => {
    const { branch, manager, base } = await scene();
    const done = await order({ ...base, ...plan, status: "PURCHASING", progress: "DONE" });
    await bought(done, "100", "4500");
    const buying = await order({ ...base, ...plan, status: "PURCHASING" });
    await bought(buying, "40", "5200");

    const { groups } = await listOrderGroups(manager.id, filtered({ branch: branch.id }));
    expect(groups[0]!.colours).toEqual({
      number: { colour: "green", orders: 1 },
      price: { colour: "red", orders: 1 },
      total: { colour: "grey" },
    });
    const still = groups[0]!.orders.find((each) => each.id === buying.id)!;
    expect(still.colours).toEqual({
      number: { colour: "grey" },
      price: { colour: "red", difference: -8_000n },
      total: { colour: "grey" },
    });
  });
});

describe("orderTotalsOnFilter: the list's draft wall (06 Statuses; .claude/rules/tests.md, a numbered Draft; permission review of 6.1)", () => {
  it("counts every listed order with no status filter; a colleague's numbered Draft of the same branch stays out", async () => {
    const { branch, manager, base } = await scene();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    await order({ ...base, status: "PENDING_HEAD", plannedQty: "2.000" });
    await order({ ...base, status: "PENDING_PRINCIPAL", plannedQty: "3.000" });
    // Taken back: a Draft that keeps its number and its whole plan, in the same branch.
    await order({
      ...base,
      ownerId: colleague.id,
      status: "DRAFT",
      number: `${branch.code}-26-0997`,
      plannedQty: "5.000",
    });
    const found = await orderTotalsOnFilter(manager.id, filtered({ branch: branch.id }));
    expect(found.count).toBe(2);
    // 2 and 3 at 5 000 so'm (the helper's price): 25 000.
    expect(found.totals.grand).toBe(25_000n);
  });
});

describe("an order without a department or a needed-by date in the list (05 Fields the Head sets 3; plan of 2.5d)", () => {
  it("is in its group row, which takes the earliest date given; its department is empty; the download holds it", async () => {
    setClock("2031-05-01T05:00:00Z");
    const { branch, manager, base } = await scene();
    const dated = await order({ ...base, status: "PENDING_HEAD", neededBy: "2031-05-20" });
    const bare = await order({
      ...base,
      status: "PENDING_HEAD",
      departmentId: null,
      neededBy: null,
    });

    const [group] = (await listOrderGroups(manager.id, filtered({ branch: branch.id }))).groups;
    expect(group!.summary.count).toBe(2);
    expect(group!.summary.earliestNeededBy).toBe("2031-05-20");
    expect(group!.summary.totals.grand).toBe(100_000n);
    const shown = group!.orders.find((one) => one.id === bare.id)!;
    expect(shown).toMatchObject({ departmentName: null, neededBy: null, overdue: false });
    expect(group!.orders.map((one) => one.id).sort()).toEqual([dated.id, bare.id].sort());

    const download = await orderDownload(manager.id, filtered({ branch: branch.id }));
    expect(download.orders.map((one) => one.id).sort()).toEqual([dated.id, bare.id].sort());
    expect(download.orders.find((one) => one.id === bare.id)).toMatchObject({
      departmentName: null,
    });
  });

  it("an order without a needed-by date is not due soon; the same order with a date tomorrow is (05 rule 3; 10 Home page per role)", async () => {
    setClock("2031-05-01T05:00:00Z");
    const { branch, manager, base } = await scene();
    const bare = await order({ ...base, status: "PENDING_HEAD", neededBy: null });
    // The same order with a date tomorrow: given every other value, only the date differs.
    const dated = await order({ ...base, status: "PENDING_HEAD", neededBy: "2031-05-02" });
    const due = (await listOrderGroups(manager.id, filtered({ branch: branch.id, dueSoon: true })))
      .groups;
    expect(due.map((group) => group.orders.map((one) => one.id))).toEqual([[dated.id]]);
    expect(bare.id).not.toBe(dated.id);
  });
});

describe("the branch wall holds for an order without a department in the list (03 rule 1; permission review of 2.5d)", () => {
  it("a Manager of another branch, no branch filter, sees neither its group nor its download row", async () => {
    setClock("2031-05-01T05:00:00Z");
    const { base } = await scene();
    const bare = await order({
      ...base,
      status: "PENDING_HEAD",
      departmentId: null,
      neededBy: null,
    });
    const other = await scene();
    const page = await listOrderGroups(other.manager.id);
    expect(page.groups.flatMap((group) => group.orders.map((one) => one.id))).not.toContain(
      bare.id,
    );
    const download = await orderDownload(other.manager.id);
    expect(download.orders.map((one) => one.id)).not.toContain(bare.id);
  });
});
