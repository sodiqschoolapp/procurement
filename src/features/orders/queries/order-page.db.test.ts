import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { OrderAction } from "@/domain/order-moves";
import type { RequestStatus } from "@/domain/request-status";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import {
  departments,
  extraCostTypes,
  orderActions,
  orderEvents,
  orderRevisions,
  orders,
  priceHistory,
  productVariants,
} from "@/server/db/schema";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import {
  insertCompany,
  insertFileRow,
  insertProduct,
  insertSubtypes,
  priceSetter,
} from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import {
  insertDepartment,
  insertExtraCostType,
  insertOrder,
  insertOrderExtra,
  setOrderStatus,
  inventedNumber,
} from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { enteredCurrentStatusAt } from "../order-sql";
import { getOrderPage } from "./order-page";

// The order page (build plan 2.9): 11-screens-and-ux.md (Order page layout 1 to 4),
// 06-approval-workflow.md (Statuses: a Draft is "visible to the owner and the Head only"; rule 4;
// rule 11: "A move made in one action with other orders says so"), 03-roles-and-permissions.md
// (rules 1, 2, 3; Manager rights: "The Manager can only view orders"), 05 Price hint; plan of 2.9,
// decided items 1, 4, 5, 6, 8 and the review's correction 2. Each passing case stands beside the
// row its guard keeps out (D40).

let tick = 0;
/** A moment after every earlier one, so the history's order is fixed. */
function later(): Date {
  tick += 1;
  return new Date(Date.UTC(2026, 9, 16, 6, 0, tick));
}

/** One action of `actorId` that moves each order, with one event per order, written straight in. */
async function act(
  actorId: string,
  type: OrderAction,
  moves: readonly { id: string; from: RequestStatus; to: RequestStatus; note?: string }[],
  options: { reason?: string; headStepAuto?: boolean } = {},
) {
  const at = later();
  const [action] = await db
    .insert(orderActions)
    .values({
      clientKey: randomUUID(),
      type,
      actorId,
      reason: options.reason ?? null,
      orderCount: moves.length,
      createdAt: at,
    })
    .returning({ id: orderActions.id });
  for (const move of moves) {
    await db.insert(orderEvents).values({
      orderId: move.id,
      actionId: action!.id,
      type,
      fromStatus: move.from,
      toStatus: move.to,
      actorId,
      comment: options.reason ?? null,
      note: move.note ?? null,
      payload: options.headStepAuto ? { headStepAuto: true } : null,
      createdAt: at,
    });
  }
  return { at, actionId: action!.id };
}

async function scene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id);
  return { branch, manager, department };
}

describe("who sees the page (03 rule 1; 06 Statuses; decided item 6)", () => {
  it("another branch's order, another Manager's Draft, an unknown and a malformed id are all null", async () => {
    const { branch, manager } = await scene();
    const other = await insertBranch();
    const otherOwner = await insertUser("MANAGER", { branches: [other.id] });
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });

    const mine = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
    });
    const elsewhere = await insertOrder({
      branchId: other.id,
      ownerId: otherOwner.id,
      status: "PENDING_HEAD",
    });
    const colleaguesDraft = await insertOrder({ branchId: branch.id, ownerId: colleague.id });
    // A taken-back Draft keeps its number and is still behind the draft wall.
    const takenBack = await insertOrder({
      branchId: branch.id,
      ownerId: colleague.id,
      status: "DRAFT",
      number: inventedNumber(),
    });

    expect((await getOrderPage(manager.id, mine.id))?.id).toBe(mine.id);
    expect(await getOrderPage(manager.id, elsewhere.id)).toBeNull();
    expect(await getOrderPage(manager.id, colleaguesDraft.id)).toBeNull();
    expect(await getOrderPage(manager.id, takenBack.id)).toBeNull();
    expect(await getOrderPage(manager.id, randomUUID())).toBeNull();
    // The draft wall holds for every role but the Head (permission review, Should fix 2).
    for (const role of ["PRINCIPAL", "FINANCE"] as const) {
      const viewer = await insertUser(role, { branches: [branch.id] });
      expect((await getOrderPage(viewer.id, mine.id))?.id).toBe(mine.id);
      expect(await getOrderPage(viewer.id, colleaguesDraft.id)).toBeNull();
      expect(await getOrderPage(viewer.id, takenBack.id)).toBeNull();
    }
    expect(await getOrderPage(manager.id, "not-an-id")).toBeNull();

    // The owner and the Head see the Draft.
    expect((await getOrderPage(colleague.id, colleaguesDraft.id))?.number).toBeNull();
    const head = await insertUser("HEAD");
    expect((await getOrderPage(head.id, colleaguesDraft.id))?.id).toBe(colleaguesDraft.id);
    expect((await getOrderPage(head.id, elsewhere.id))?.id).toBe(elsewhere.id);
  });

  it("a Principal or Finance user of another branch gets null; of the branch, the page", async () => {
    const { branch, manager } = await scene();
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
    });
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    const otherFinance = await insertUser("FINANCE", { branches: [(await insertBranch()).id] });
    expect((await getOrderPage(finance.id, order.id))?.id).toBe(order.id);
    expect(await getOrderPage(otherFinance.id, order.id)).toBeNull();
  });
});

describe("History and stepper (06 rule 11; 11 Order page layout 2)", () => {
  it("lists every event with actor, time, reason and note, newest first; the stepper follows", async () => {
    const { branch, manager } = await scene();
    const head = await insertUser("HEAD", { fullName: "Dilnoza Rahimova" });
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_PRINCIPAL",
    });
    const submitted = await act(manager.id, "SUBMIT", [
      { id: order.id, from: "DRAFT", to: "PENDING_HEAD" },
    ]);
    const approved = await act(head.id, "APPROVE", [
      { id: order.id, from: "PENDING_HEAD", to: "PENDING_PRINCIPAL" },
    ]);

    const page = await getOrderPage(manager.id, order.id);
    expect(page!.events.map((event) => [event.type, event.actorName, event.at])).toEqual([
      ["APPROVE", "Dilnoza Rahimova", approved.at],
      ["SUBMIT", manager.fullName, submitted.at],
    ]);
    expect(page!.steps.map((step) => [step.step, step.state, step.by?.name ?? null])).toEqual([
      ["DRAFT", "done", manager.fullName],
      ["HEAD", "done", "Dilnoza Rahimova"],
      ["PRINCIPAL", "current", null],
      ["FINANCE", "todo", null],
      ["OPEN", "todo", null],
      ["CLOSED", "todo", null],
    ]);
  });

  it("a send-back shows its reason and per-order note", async () => {
    const { branch, manager } = await scene();
    const head = await insertUser("HEAD");
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "RETURNED",
    });
    await act(manager.id, "SUBMIT", [{ id: order.id, from: "DRAFT", to: "PENDING_HEAD" }]);
    await act(
      head.id,
      "SEND_BACK",
      [{ id: order.id, from: "PENDING_HEAD", to: "RETURNED", note: "Boshqa rang kerak" }],
      { reason: "Narx juda baland" },
    );
    const [newest] = (await getOrderPage(manager.id, order.id))!.events;
    expect(newest).toMatchObject({
      type: "SEND_BACK",
      comment: "Narx juda baland",
      note: "Boshqa rang kerak",
    });
  });

  it("a Head-created order's Submit carries headStepAuto and finishes Draft and Head (03 rule 6)", async () => {
    const branch = await insertBranch();
    const head = await insertUser("HEAD");
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: head.id,
      createdBy: head.id,
      status: "PENDING_PRINCIPAL",
    });
    await act(head.id, "SUBMIT", [{ id: order.id, from: "DRAFT", to: "PENDING_PRINCIPAL" }], {
      headStepAuto: true,
    });
    const page = await getOrderPage(head.id, order.id);
    expect(page!.events[0]!.headStepAuto).toBe(true);
    expect(page!.steps.slice(0, 3).map((step) => step.state)).toEqual(["done", "done", "current"]);
  });
});

describe('"with N other orders" counts only what the reader may see (decided item 1, Look first)', () => {
  it("an action over two branches: each reader counts the orders of his own branches; the Head all", async () => {
    const a = await insertBranch();
    const b = await insertBranch();
    const managerA = await insertUser("MANAGER", { branches: [a.id] });
    const colleagueA = await insertUser("MANAGER", { branches: [a.id] });
    const managerB = await insertUser("MANAGER", { branches: [b.id] });
    const head = await insertUser("HEAD");
    const waiting = { status: "PENDING_PRINCIPAL" as const };
    const inA = [
      await insertOrder({ branchId: a.id, ownerId: managerA.id, ...waiting }),
      await insertOrder({ branchId: a.id, ownerId: managerA.id, ...waiting }),
      await insertOrder({ branchId: a.id, ownerId: managerA.id, ...waiting }),
    ];
    // An order of the action taken back since by its owner: a Draft behind the wall for others.
    const takenBack = await insertOrder({
      branchId: a.id,
      ownerId: colleagueA.id,
      number: inventedNumber(),
    });
    const inB = [
      await insertOrder({ branchId: b.id, ownerId: managerB.id, ...waiting }),
      await insertOrder({ branchId: b.id, ownerId: managerB.id, ...waiting }),
    ];
    await act(
      head.id,
      "APPROVE",
      [...inA, takenBack, ...inB].map((order) => ({
        id: order.id,
        from: "PENDING_HEAD" as const,
        to: "PENDING_PRINCIPAL" as const,
      })),
    );

    const othersOf = async (userId: string, orderId: string) =>
      (await getOrderPage(userId, orderId))!.events[0]!.othersSeen;
    // Branch A: 3 + the taken-back Draft; the reader of A sees the 2 other waiting ones only.
    expect(await othersOf(managerA.id, inA[0]!.id)).toBe(2);
    // The Draft's owner sees his Draft as well.
    expect(await othersOf(colleagueA.id, inA[0]!.id)).toBe(3);
    expect(await othersOf(managerB.id, inB[0]!.id)).toBe(1);
    expect(await othersOf(head.id, inB[0]!.id)).toBe(5);

    // The Principal and Finance of A count A's waiting orders, never the Draft (permission review,
    // Should fix 3); a Manager of both branches counts both, without the Draft.
    const principalA = await insertUser("PRINCIPAL", { branches: [a.id] });
    const financeA = await insertUser("FINANCE", { branches: [a.id] });
    const managerAB = await insertUser("MANAGER", { branches: [a.id, b.id] });
    expect(await othersOf(principalA.id, inA[0]!.id)).toBe(2);
    expect(await othersOf(financeA.id, inA[0]!.id)).toBe(2);
    expect(await othersOf(managerAB.id, inA[0]!.id)).toBe(4);
  });

  it("none visible: the count is 0, so no such text is shown", async () => {
    const a = await insertBranch();
    const b = await insertBranch();
    const managerA = await insertUser("MANAGER", { branches: [a.id] });
    const managerB = await insertUser("MANAGER", { branches: [b.id] });
    const head = await insertUser("HEAD");
    const waiting = { status: "PENDING_PRINCIPAL" as const };
    const mine = await insertOrder({ branchId: b.id, ownerId: managerB.id, ...waiting });
    const theirs = [
      await insertOrder({ branchId: a.id, ownerId: managerA.id, ...waiting }),
      await insertOrder({ branchId: a.id, ownerId: managerA.id, ...waiting }),
    ];
    await act(
      head.id,
      "APPROVE",
      [mine, ...theirs].map((order) => ({
        id: order.id,
        from: "PENDING_HEAD" as const,
        to: "PENDING_PRINCIPAL" as const,
      })),
    );
    expect((await getOrderPage(managerB.id, mine.id))!.events[0]!.othersSeen).toBe(0);
    expect((await getOrderPage(head.id, mine.id))!.events[0]!.othersSeen).toBe(2);
  });
});

describe("price hint against today's reference price (05 Price hint; decided items 7, 8)", () => {
  it("uses the subtype's reference price now, not an older one", async () => {
    const { branch, manager, department } = await scene();
    // The older price 10 000 would give −30%; today's 5 000 gives +40%.
    const product = await insertProduct({ referencePrice: 10_000n });
    const setBy = await priceSetter();
    // The newest Head history row and the subtype's price change together (trigger
    // `price_recorded`).
    await db.transaction(async (tx) => {
      await tx.insert(priceHistory).values({
        variantId: product.defaultVariantId,
        price: 5_000n,
        source: "HEAD",
        setBy,
        createdAt: later(),
      });
      await tx
        .update(productVariants)
        .set({ referencePrice: 5_000n })
        .where(eq(productVariants.id, product.defaultVariantId));
    });
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      departmentId: department.id,
      variantId: product.defaultVariantId,
      status: "PENDING_HEAD",
      plannedPrice: 7_000n,
    });
    expect((await getOrderPage(manager.id, order.id))!.priceHint).toBe(40n);
  });

  it("no reference price, or no price on a draft: no hint", async () => {
    const { branch, manager, department } = await scene();
    const unpriced = await insertProduct();
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      departmentId: department.id,
      variantId: unpriced.defaultVariantId,
      status: "PENDING_HEAD",
      plannedPrice: 7_000n,
    });
    expect((await getOrderPage(manager.id, order.id))!.priceHint).toBeNull();

    // A draft without a price, of a product that has a reference price (spec review of the
    // build, Should fix 2).
    const priced = await insertProduct({ referencePrice: 5_000n });
    const draft = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      departmentId: department.id,
      variantId: priced.defaultVariantId,
    });
    await db
      .update(orders)
      .set({ plannedPrice: null, plannedTotal: null })
      .where(eq(orders.id, draft.id));
    const page = await getOrderPage(manager.id, draft.id);
    expect(page!.price).toBeNull();
    expect(page!.priceHint).toBeNull();
  });
});

describe("the waiting line's Principal (03 rules 2 and 3; decided items 5, 14)", () => {
  it("names the branch's active Principal, not another branch's or a deactivated former one", async () => {
    const { branch, manager } = await scene();
    await insertUser("PRINCIPAL", {
      branches: [branch.id],
      isActive: false,
      fullName: "Former Principal",
    });
    await insertUser("PRINCIPAL", { branches: [branch.id], fullName: "Acting Principal" });
    await insertUser("PRINCIPAL", {
      branches: [(await insertBranch()).id],
      fullName: "Other Principal",
    });
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_PRINCIPAL",
    });
    expect((await getOrderPage(manager.id, order.id))!.principalName).toBe("Acting Principal");
  });

  it("no active Principal: null", async () => {
    const { branch, manager } = await scene();
    await insertUser("PRINCIPAL", { branches: [branch.id], isActive: false });
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_PRINCIPAL",
    });
    expect((await getOrderPage(manager.id, order.id))!.principalName).toBeNull();
  });
});

describe("who acts next and since when (11 Order page layout 1; plan of 2.9b, decided items 2 and 4, Look first)", () => {
  /** The moment the stuck filter and the reminders read for the order: its SQL twin. */
  async function enteredAt(orderId: string): Promise<Date | null> {
    const [row] = await db
      .select({
        at: sql<Date | null>`${enteredCurrentStatusAt}`.mapWith(orderEvents.createdAt),
      })
      .from(orders)
      .where(eq(orders.id, orderId));
    return row!.at;
  }

  it("Waiting for Principal: since the Head's approval, the Principal named, the stuck filter's own moment", async () => {
    const { branch, manager } = await scene();
    const head = await insertUser("HEAD");
    await insertUser("PRINCIPAL", { branches: [branch.id], fullName: "Otabek Nazarov" });
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_PRINCIPAL",
    });
    await act(manager.id, "SUBMIT", [{ id: order.id, from: "DRAFT", to: "PENDING_HEAD" }]);
    const approved = await act(head.id, "APPROVE", [
      { id: order.id, from: "PENDING_HEAD", to: "PENDING_PRINCIPAL" },
    ]);
    const page = await getOrderPage(manager.id, order.id);
    expect(page!.waitingFor).toBe("PRINCIPAL");
    expect(page!.principalName).toBe("Otabek Nazarov");
    expect(page!.waitingSince).toEqual(approved.at);
    expect(await enteredAt(order.id)).toEqual(approved.at);
    // Another branch's reader still gets nothing (03 rule 1).
    const stranger = await insertUser("MANAGER", { branches: [(await insertBranch()).id] });
    expect(await getOrderPage(stranger.id, order.id)).toBeNull();
  });

  it("a purchase, a buying action, a money action and a move to another Manager do not reset it", async () => {
    const { branch, manager } = await scene();
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    const other = await insertUser("MANAGER", { branches: [branch.id] });
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    await act(manager.id, "SUBMIT", [{ id: order.id, from: "DRAFT", to: "PENDING_HEAD" }]);
    const opened = await act(finance.id, "APPROVE", [
      { id: order.id, from: "PENDING_FINANCE", to: "PURCHASING" },
    ]);
    for (const type of ["RECORD_PURCHASE", "FINISH_ORDER", "RECORD_MONEY", "MOVE_OWNER"] as const) {
      await act(type === "RECORD_MONEY" ? finance.id : manager.id, type as OrderAction, [
        { id: order.id, from: "PURCHASING", to: "PURCHASING" },
      ]);
    }
    const page = await getOrderPage(other.id, order.id);
    expect(page!.waitingFor).toBe("OWNER");
    expect(page!.waitingSince).toEqual(opened.at);
    expect(await enteredAt(order.id)).toEqual(opened.at);
  });

  it("a reopened order counts from the Reopen, a sent-back one from the Send back", async () => {
    const { branch, manager } = await scene();
    const head = await insertUser("HEAD");
    const reopened = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    await act(head.id, "APPROVE", [{ id: reopened.id, from: "PENDING_FINANCE", to: "PURCHASING" }]);
    await act(manager.id, "CLOSE_EXACT", [{ id: reopened.id, from: "PURCHASING", to: "CLOSED" }]);
    const reopen = await act(
      head.id,
      "REOPEN",
      [{ id: reopened.id, from: "CLOSED", to: "PURCHASING" }],
      {
        reason: "A wrong price",
      },
    );
    expect((await getOrderPage(manager.id, reopened.id))!.waitingSince).toEqual(reopen.at);

    const returned = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "RETURNED",
    });
    await act(manager.id, "SUBMIT", [{ id: returned.id, from: "DRAFT", to: "PENDING_HEAD" }]);
    const sentBack = await act(
      head.id,
      "SEND_BACK",
      [{ id: returned.id, from: "PENDING_HEAD", to: "RETURNED" }],
      {
        reason: "Fix the price",
      },
    );
    const page = await getOrderPage(manager.id, returned.id);
    expect(page!.waitingFor).toBe("OWNER");
    expect(page!.waitingSince).toEqual(sentBack.at);
  });

  it("a draft never submitted has no date", async () => {
    const { branch, manager } = await scene();
    const draft = await insertOrder({ branchId: branch.id, ownerId: manager.id });
    const page = await getOrderPage(manager.id, draft.id);
    expect(page!.waitingFor).toBe("OWNER");
    expect(page!.waitingSince).toBeNull();
  });

  it("a finished order that skipped Finance waits for the Head when its owner may not close alone (06 Finance step switched off 3)", async () => {
    const { branch, manager } = await scene();
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
      progress: "NOT_BOUGHT",
      finishReason: "Nothing in the shops",
    });
    await db.update(orders).set({ skippedFinance: true }).where(eq(orders.id, order.id));
    expect((await getOrderPage(manager.id, order.id))!.waitingFor).toBe("OWNER");
    await setManagerRight(manager.id, "CLOSE_ALONE", false);
    expect((await getOrderPage(manager.id, order.id))!.waitingFor).toBe("HEAD");
  });
});

describe("the action bar reads the state machine (11 Order page layout 4; decided item 4)", () => {
  it("Finance on a Waiting for Head order has no move; the Head has Approve", async () => {
    const { branch, manager } = await scene();
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    const head = await insertUser("HEAD");
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
    });
    expect((await getOrderPage(finance.id, order.id))!.actions).toEqual([]);
    expect((await getOrderPage(head.id, order.id))!.actions).toContain("APPROVE");
  });

  it("the owner of a Draft has Submit; with CREATE_REQUESTS off he still sees the page, without Submit (review correction 2)", async () => {
    const { branch, manager } = await scene();
    const draft = await insertOrder({ branchId: branch.id, ownerId: manager.id });
    expect((await getOrderPage(manager.id, draft.id))!.actions).toContain("SUBMIT");

    await setManagerRight(manager.id, "CREATE_REQUESTS", false);
    const page = await getOrderPage(manager.id, draft.id);
    expect(page?.id).toBe(draft.id);
    expect(page!.actions).not.toContain("SUBMIT");
  });
});

describePermissionMatrix("getOrderPage", {
  permission: "data.view",
  async run({ user, branchId }) {
    const owner = await insertUser("MANAGER", { branches: [branchId] });
    const order = await insertOrder({ branchId, ownerId: owner.id, status: "PENDING_HEAD" });
    const page = await getOrderPage(user.id, order.id);
    if (page === null) throw new AuthorizationError("not_found");
    expect(page.id).toBe(order.id);
  },
});

// What changed (build plan 2.11, the former 2.12): 06-approval-workflow.md rule 5; 15 S5; plan of
// 2.11, decided item 3 (Look first) and review correction 1 (the newest copy of a revision is its
// highest submission, never its latest time).
describe("What changed on a re-submitted order (06 rule 5)", () => {
  async function withCopies(revision: number) {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const head = await insertUser("HEAD");
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
      revision,
    });
    const copy = async (rev: number, submission: number, snapshot: object, at: string) =>
      db.insert(orderRevisions).values({
        orderId: order.id,
        revision: rev,
        submission,
        snapshot: {
          variantId: order.variantId,
          departmentId: order.departmentId,
          companyId: null,
          extras: [],
          ...snapshot,
        },
        createdAt: new Date(at),
      });
    return { branch, manager, head, order, copy };
  }

  it("S5: 100 → 80 against the newest copy of rev 1, by submission and not by time", async () => {
    const { head, order, copy } = await withCopies(2);
    // Submission 2 of rev 1 (after a Take back) carries 90 and an earlier time stamp than
    // submission 1: the frozen clock of a test can give two copies one time.
    await copy(1, 1, { quantity: "100.000", plannedTotal: "500000" }, "2026-10-16T09:00:00Z");
    await copy(1, 2, { quantity: "90.000", plannedTotal: "450000" }, "2026-10-16T08:00:00Z");
    await copy(2, 1, { quantity: "80.000", plannedTotal: "400000" }, "2026-10-16T10:00:00Z");
    const page = (await getOrderPage(head.id, order.id))!;
    expect(page.changes).toEqual({
      since: 1,
      list: [
        { kind: "field", field: "quantity", from: "90.000", to: "80.000" },
        { kind: "total", from: "450000", to: "400000" },
      ],
    });
  });

  it("names a changed department and extra cost by their names", async () => {
    const { branch, head, order, copy } = await withCopies(2);
    const moved = await insertDepartment(branch.id);
    const [named] = await db
      .select({ name: departments.name })
      .from(departments)
      .where(eq(departments.id, moved.id));
    const [type] = await db
      .insert(extraCostTypes)
      .values({ name: `Delivery ${randomUUID()}`, createdAt: new Date("2026-10-16T08:00:00Z") })
      .returning({ id: extraCostTypes.id, name: extraCostTypes.name });
    await copy(1, 1, {}, "2026-10-16T09:00:00Z");
    await copy(
      2,
      1,
      { departmentId: moved.id, extras: [{ extraCostTypeId: type!.id, amount: "20000" }] },
      "2026-10-16T10:00:00Z",
    );
    const page = (await getOrderPage(head.id, order.id))!;
    const fromName = (
      await db
        .select({ name: departments.name })
        .from(departments)
        .where(eq(departments.id, order.departmentId))
    )[0]!.name;
    expect(page.changes!.list).toEqual([
      { kind: "field", field: "departmentId", from: fromName, to: named!.name },
      { kind: "extra", typeName: type!.name, from: null, to: "20000" },
    ]);
  });

  it("revision 1 shows nothing, a taken-back resubmit included (decided item 3)", async () => {
    const { head, order, copy } = await withCopies(1);
    await copy(1, 1, { quantity: "100.000" }, "2026-10-16T09:00:00Z");
    await copy(1, 2, { quantity: "90.000" }, "2026-10-16T10:00:00Z");
    expect((await getOrderPage(head.id, order.id))!.changes).toBe(null);
  });
});

describe("the Purchases tab (11 Order page layout 3; 07 Purchase record and Order progress; plan of 3.5)", () => {
  /** A record in its own trip, written straight into the tables, at a moment after the last. */
  async function record(
    order: { id: string; branchId: string; variantId: string },
    userId: string,
    fields: { qty: string; unitPrice: string; supplierId?: string; cancelled?: boolean },
  ) {
    const at = later();
    const [trip] = (
      await db.execute<{ id: string }>(sql`
        insert into purchase_trips (client_key, branch_id, purchased_on, supplier_id, payment_type,
          created_by, created_at)
        values (${randomUUID()}, ${order.branchId}, '2026-10-15', ${fields.supplierId ?? null},
          'CARD', ${userId}, ${at})
        returning id`)
    ).rows;
    const [made] = (
      await db.execute<{ id: string }>(sql`
        insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price, comment,
          created_by, created_at)
        values (${trip!.id}, ${order.id}, ${order.branchId}, ${order.variantId}, ${fields.qty},
          ${fields.unitPrice}, 'Invented comment', ${userId}, ${at})
        returning id`)
    ).rows;
    if (fields.cancelled) {
      await db.execute(sql`
        update purchases set is_cancelled = true, cancel_reason = 'A typo', cancelled_by = ${userId},
          cancelled_at = ${at} where id = ${made!.id}`);
    }
    return { tripId: trip!.id, id: made!.id };
  }

  it("Substituted only while a record that is not cancelled bought another subtype (07 Substitution; plan of 3.6, decided item 3)", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const pens = await insertProduct();
    const [blue, black] = await insertSubtypes(pens.id, [{ name: "Ko'k" }, { name: "Qora" }]);
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
      variantId: blue!,
    });
    // A live record of the ordered subtype and a cancelled one of black: not substituted.
    await record({ ...order, branchId: branch.id }, manager.id, { qty: "4", unitPrice: "1" });
    const cancelled = await record(
      { ...order, branchId: branch.id, variantId: black! },
      manager.id,
      {
        qty: "6",
        unitPrice: "1",
        cancelled: true,
      },
    );
    let page = await getOrderPage(manager.id, order.id);
    expect(page).toMatchObject({ substituted: false });
    expect(page!.purchases.find((each) => each.id === cancelled.id)).toMatchObject({
      variantId: black,
      boughtSubtypeName: "Qora",
      isCancelled: true,
    });
    await record({ ...order, branchId: branch.id, variantId: black! }, manager.id, {
      qty: "6",
      unitPrice: "1",
    });
    page = await getOrderPage(manager.id, order.id);
    expect(page).toMatchObject({ substituted: true });
  });

  it("every record newest first, with its trip's date, supplier, payment type and receipts; a cancelled one marked and left out of the numbers", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
      plannedQty: "100",
      plannedPrice: 5_000n,
    });
    // Another order's record of the same branch beside it (D40).
    const other = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    await record({ ...other, branchId: branch.id }, manager.id, { qty: "7", unitPrice: "1" });

    const supplier = await insertCompany();
    const first = await record({ ...order, branchId: branch.id }, manager.id, {
      qty: "60",
      unitPrice: "4500",
      supplierId: supplier.id,
    });
    const file = await insertFileRow(manager.id, "application/pdf");
    await db.execute(sql`
      insert into trip_files (trip_id, file_id, created_at) values (${first.tripId}, ${file.id}, ${later()})`);
    const type = await insertExtraCostType();
    await db.execute(sql`
      insert into purchase_extras (purchase_id, extra_cost_type_id, amount, payment_type, created_at)
      values (${first.id}, ${type.id}, 20000, 'CASH', ${later()})`);
    const typo = await record({ ...order, branchId: branch.id }, manager.id, {
      qty: "40",
      unitPrice: "9999",
      cancelled: true,
    });
    const second = await record({ ...order, branchId: branch.id }, manager.id, {
      qty: "30",
      unitPrice: "5000",
    });

    const page = (await getOrderPage(manager.id, order.id))!;
    expect(page.purchases.map((each) => each.id)).toEqual([second.id, typo.id, first.id]);
    expect(page.purchases[2]).toMatchObject({
      purchasedOn: "2026-10-15",
      qty: "60",
      unitPrice: 4_500n,
      goods: 270_000n,
      paymentType: "CARD",
      supplierName: supplier.name,
      comment: "Invented comment",
      recordedBy: manager.fullName,
      receipts: [{ fileId: file.id, isImage: false }],
      extras: [{ typeName: expect.any(String), amount: 20_000n, paymentType: "CASH" }],
      isCancelled: false,
    });
    expect(page.purchases[1]).toMatchObject({ isCancelled: true, cancelReason: "A typo" });
    // 08: the cancelled 40 counts for nothing; 60 × 4 500 + 20 000 + 30 × 5 000.
    expect(page.received).toBe("90");
    expect(page.actual).toEqual({
      qty: "90",
      goods: 420_000n,
      extras: 20_000n,
      total: 440_000n,
      difference: 500_000n - 440_000n,
    });
    expect(page.overPlan).toBe(false);
    expect(page.progress).toBe("OPEN");
    expect(page.buying).toEqual(["FINISH_ORDER"]);
    // The Principal sees the tab and acts on none of it (03 Permission matrix, Record purchases).
    const seen = (await getOrderPage(principal.id, order.id))!;
    expect(seen.purchases).toHaveLength(3);
    expect(seen.buying).toEqual([]);
  });

  it("buying actions per reader: the owner and the Head; not a colleague, Finance, or the owner with RECORD_PURCHASES off (03 Record purchases)", async () => {
    const branch = await insertBranch();
    const owner = await insertUser("MANAGER", { branches: [branch.id] });
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    const head = await insertUser("HEAD");
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: owner.id,
      status: "PURCHASING",
    });
    const buying = async (userId: string) => (await getOrderPage(userId, order.id))!.buying;
    expect(await buying(owner.id)).toEqual(["MARK_NOT_BOUGHT"]);
    expect(await buying(head.id)).toEqual(["MARK_NOT_BOUGHT"]);
    expect(await buying(colleague.id)).toEqual([]);
    expect(await buying(finance.id)).toEqual([]);
    await setManagerRight(owner.id, "RECORD_PURCHASES", false);
    expect(await buying(owner.id)).toEqual([]);
  });

  it("Cancel record, Cancel trip and the cancelled count per reader (07 Fixing a mistake; plan of 3.7)", async () => {
    const branch = await insertBranch();
    const owner = await insertUser("MANAGER", { branches: [branch.id] });
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const head = await insertUser("HEAD");
    const open = () =>
      insertOrder({ branchId: branch.id, ownerId: owner.id, status: "PURCHASING" });
    const order = await open();
    const partner = await open();
    // One trip over both orders (07 One trip 1), and an earlier record of the order, cancelled.
    const shared = await record({ ...order, branchId: branch.id }, owner.id, {
      qty: "2",
      unitPrice: "1",
    });
    await db.execute(sql`
      insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price,
        created_by, created_at)
      values (${shared.tripId}, ${partner.id}, ${branch.id}, ${partner.variantId}, 3, 1,
        ${owner.id}, ${later()})`);
    const typo = await record({ ...order, branchId: branch.id }, owner.id, {
      qty: "5",
      unitPrice: "1",
      cancelled: true,
    });

    const page = (await getOrderPage(owner.id, order.id))!;
    expect(page.cancelledCount).toBe(1);
    const sharedLine = page.purchases.find((each) => each.id === shared.id)!;
    expect(sharedLine.canCancel).toBe(true);
    expect(sharedLine.trip).toEqual({
      id: shared.tripId,
      orders: expect.arrayContaining([
        { id: order.id, version: order.version, number: order.number },
        { id: partner.id, version: partner.version, number: partner.number },
      ]),
    });
    expect(sharedLine.trip!.orders).toHaveLength(2);
    expect(page.purchases.find((each) => each.id === typo.id)).toMatchObject({
      canCancel: false,
      trip: null,
    });

    // The Head may; a colleague, the Principal and the owner with CANCEL_PURCHASES off may not.
    const offered = async (userId: string) =>
      (await getOrderPage(userId, order.id))!.purchases.find((each) => each.id === shared.id)!;
    expect(await offered(head.id)).toMatchObject({ canCancel: true });
    expect(await offered(colleague.id)).toMatchObject({ canCancel: false, trip: null });
    expect(await offered(principal.id)).toMatchObject({ canCancel: false, trip: null });
    await setManagerRight(owner.id, "CANCEL_PURCHASES", false);
    expect(await offered(owner.id)).toMatchObject({ canCancel: false, trip: null });
    await setManagerRight(owner.id, "CANCEL_PURCHASES", true);

    // A trip order that is no longer Open: Cancel record stays, Cancel trip is not offered.
    await db.update(orders).set({ status: "SETTLEMENT" }).where(eq(orders.id, partner.id));
    expect(await offered(owner.id)).toMatchObject({ canCancel: true, trip: null });
    // From Waiting for settlement on, nothing is offered on the order itself.
    await db.update(orders).set({ status: "SETTLEMENT" }).where(eq(orders.id, order.id));
    expect(await offered(owner.id)).toMatchObject({ canCancel: false, trip: null });
  });

  it("before Open there is no tab data: no records, no actual numbers, no buying actions", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_FINANCE",
    });
    const page = (await getOrderPage(manager.id, order.id))!;
    expect(page).toMatchObject({
      purchases: [],
      actual: null,
      received: null,
      buying: [],
      colours: null,
    });
  });

  it("the three colours of the Cheaper case: Number green, Price orange, Total orange Left 50 000 (08 Worked example; plan of 3.8)", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    // 100 notebooks × 5 000 plus 20 000 delivery: the extra written while Sent back, where the
    // plan may change (`order_extras_plan_frozen`), then Open with its buying Done.
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "RETURNED",
      plannedQty: "100",
      plannedPrice: 5_000n,
    });
    await insertOrderExtra(order.id, 20_000n);
    await setOrderStatus(order.id, "PURCHASING");
    await db.update(orders).set({ progress: "DONE" }).where(eq(orders.id, order.id));
    const bought = await record({ ...order, branchId: branch.id }, manager.id, {
      qty: "100",
      unitPrice: "4500",
    });
    const type = await insertExtraCostType();
    await db.execute(sql`
      insert into purchase_extras (purchase_id, extra_cost_type_id, amount, payment_type, created_at)
      values (${bought.id}, ${type.id}, 20000, 'CASH', ${later()})`);

    const page = (await getOrderPage(manager.id, order.id))!;
    expect(page.colours).toEqual({
      number: { colour: "green", difference: "0" },
      price: { colour: "amber", difference: 50_000n },
      total: { colour: "amber", difference: 50_000n },
    });
  });
});
