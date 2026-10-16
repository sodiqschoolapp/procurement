import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { OrderAction } from "@/domain/order-moves";
import type { RequestStatus } from "@/domain/request-status";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { orderActions, orderEvents, priceHistory, productVariants } from "@/server/db/schema";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { insertProduct, priceSetter } from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertDepartment, insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
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

    const mine = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PENDING_HEAD" });
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
      number: `TB-26-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    });

    expect((await getOrderPage(manager.id, mine.id))?.id).toBe(mine.id);
    expect(await getOrderPage(manager.id, elsewhere.id)).toBeNull();
    expect(await getOrderPage(manager.id, colleaguesDraft.id)).toBeNull();
    expect(await getOrderPage(manager.id, takenBack.id)).toBeNull();
    expect(await getOrderPage(manager.id, randomUUID())).toBeNull();
    expect(await getOrderPage(manager.id, "not-an-id")).toBeNull();

    // The owner and the Head see the Draft.
    expect((await getOrderPage(colleague.id, colleaguesDraft.id))?.number).toBeNull();
    const head = await insertUser("HEAD");
    expect((await getOrderPage(head.id, colleaguesDraft.id))?.id).toBe(colleaguesDraft.id);
    expect((await getOrderPage(head.id, elsewhere.id))?.id).toBe(elsewhere.id);
  });

  it("a Principal or Finance user of another branch gets null; of the branch, the page", async () => {
    const { branch, manager } = await scene();
    const order = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PENDING_HEAD" });
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
    const order = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PENDING_PRINCIPAL" });
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
    const order = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "RETURNED" });
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
      number: `TB-26-${String(Math.floor(Math.random() * 9000) + 1000)}`,
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

describe("the action bar reads the state machine (11 Order page layout 4; decided item 4)", () => {
  it("Finance on a Waiting for Head order has no move; the Head has Approve", async () => {
    const { branch, manager } = await scene();
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    const head = await insertUser("HEAD");
    const order = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PENDING_HEAD" });
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
