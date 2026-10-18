import { randomUUID } from "node:crypto";

import Decimal from "decimal.js";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { ITEM_CARD_PAGE_SIZE } from "@/domain/stock";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { createDocument } from "@/server/stock-documents";
import { postMovement } from "@/server/stock-ledger";

import { runAction } from "@/server/action";

import { reverseStockDocument } from "../actions/reverse";
import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes, insertUnit } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertOrder } from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { postDocument, receive } from "../../../../tests/helpers/stock-documents";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { getItemCard } from "./item-card";

// The item card (build plan 5.3, Done when: "A database test checks the order and the running
// balance"; 09-warehouse.md, Stock screens: Item card, "every movement of one subtype in one
// branch, newest first, with the running balance and a link to the source document or order";
// 09 first paragraph: stock is the sum of every movement; 03 rule 1 and matrix "See orders,
// stock and reports"; plan of 5.3, decided items 1 to 9). Every fixture is asserted (D38).

const AT = "2031-05-03T06:00:00Z";

let head: InsertedUser;

beforeAll(async () => {
  head = await insertUser("HEAD");
});

async function goods(): Promise<string> {
  const unit = await insertUnit({ allowDecimal: false });
  return (await insertProduct({ unitId: unit.id })).defaultVariantId;
}

/** An order of the subtype with one purchase record of 10, received into stock at 5 000 so'm. */
async function received(branchId: string, ownerId: string, variantId: string, qty = "10") {
  const order = await insertOrder({ branchId, ownerId, status: "PURCHASING", variantId });
  const tripId = (await insertTrip(branchId, ownerId)).rows[0]!.id;
  const purchaseId = (
    await insertPurchaseRow({
      tripId,
      orderId: order.id,
      branchId,
      variantId,
      createdBy: ownerId,
      qty,
    })
  ).rows[0]!.id;
  const movement = await db.transaction((tx) =>
    postMovement(tx, {
      branchId,
      variantId,
      type: "RECEIPT",
      qtyDelta: qty,
      unitCost: 5000n,
      createdBy: ownerId,
      purchaseId,
    }),
  );
  expect(new Decimal(movement.qty).equals(qty)).toBe(true);
  return { order, purchaseId, movementId: movement.movementId };
}

async function issued(branchId: string, variantId: string, qty: string) {
  const department = await insertDepartment(branchId);
  const made = await db.transaction((tx) =>
    createDocument(tx, {
      type: "ISSUE",
      branchId,
      departmentId: department.id,
      receivedByName: "Sinov Qabulqiluvchi",
      docDate: "2031-05-03",
      status: "POSTED",
      clientKey: randomUUID(),
      createdBy: head.id,
      lines: [{ variantId, qty }],
    }),
  );
  expect(made.posted).toHaveLength(1);
  return made;
}

describe("getItemCard: order and running balance (Done when; 09 Stock screens: Item card)", () => {
  it("lists every movement newest first by seq, each balance the sum of all earlier changes", async () => {
    setClock(AT);
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const variantId = await goods();
    // Every movement at the same clock instant: only `seq` orders them (decided item 2).
    const receipt = await received(branch.id, manager.id, variantId);
    const issue = await issued(branch.id, variantId, "3");
    const reversal = await db.transaction((tx) =>
      postMovement(tx, {
        branchId: branch.id,
        variantId,
        type: "REVERSAL",
        qtyDelta: "-7",
        unitCost: 5000n,
        createdBy: manager.id,
        purchaseId: receipt.purchaseId,
        reversesMovementId: receipt.movementId,
      }),
    );
    expect(new Decimal(reversal.qty).isZero()).toBe(true);

    const card = await getItemCard(head.id, variantId, branch.id);
    expect(card).not.toBeNull();
    expect(card!.movements.map((row) => row.type)).toEqual(["REVERSAL", "ISSUE", "RECEIPT"]);
    expect(card!.movements.map((row) => row.balanceAfter)).toEqual(["0.000", "7.000", "10.000"]);
    // Each balance equals the sum of its own and every earlier change (09 first paragraph).
    const oldestFirst = [...card!.movements].reverse();
    let sum = new Decimal(0);
    for (const row of oldestFirst) {
      sum = sum.plus(row.qtyDelta);
      expect(new Decimal(row.balanceAfter).equals(sum)).toBe(true);
    }
    // The newest balance is the quantity on hand of the card's header.
    expect(card!.quantity).toBe("0.000");
    expect(card!.found).toBe(3);

    // The source: a receipt and a purchase's reversal name their order; an issue its number.
    const [newest, middle, oldest] = card!.movements;
    expect(oldest!.order).toEqual({ id: receipt.order.id, number: receipt.order.number });
    expect(newest!.order).toEqual({ id: receipt.order.id, number: receipt.order.number });
    expect(middle!.order).toBeNull();
    expect(middle!.documentNumber).toBe(issue.number);
    expect(oldest!.documentNumber).toBeNull();
  });

  it("lists only the asked branch: the same subtype's movement in another branch is left out", async () => {
    setClock(AT);
    const branch = await insertBranch();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id, other.id] });
    const variantId = await goods();
    await received(branch.id, manager.id, variantId, "4");
    // The other branch's movement has every value but the branch (tests rule, D46).
    await received(other.id, manager.id, variantId, "9");

    const card = await getItemCard(manager.id, variantId, branch.id);
    expect(card!.movements.map((row) => row.qtyDelta)).toEqual(["4.000"]);
    expect(card!.quantity).toBe("4.000");
    const theirs = await getItemCard(manager.id, variantId, other.id);
    expect(theirs!.movements.map((row) => row.qtyDelta)).toEqual(["9.000"]);
  });
});

describe("getItemCard: the walls (03 rule 1; 06 Statuses; plan of 5.3, decided item 9)", () => {
  it("another branch's card is Not found for its Principal", async () => {
    const branch = await insertBranch();
    const other = await insertBranch();
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const variantId = await goods();
    await expect(getItemCard(principal.id, variantId, other.id)).rejects.toMatchObject(
      new AuthorizationError("not_found"),
    );
    expect(await getItemCard(principal.id, variantId, branch.id)).not.toBeNull();
  });

  it("an order behind the draft wall keeps its row and balance, without its number", async () => {
    setClock(AT);
    const branch = await insertBranch();
    const owner = await insertUser("MANAGER", { branches: [branch.id] });
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const variantId = await goods();
    const receipt = await received(branch.id, owner.id, variantId, "6");
    // Written straight into the table: an order with a purchase is past Open (06), so a DRAFT
    // here is reached only by hand (review of the plan, decision 9).
    await db.execute(sql`update orders set status = 'DRAFT' where id = ${receipt.order.id}`);

    const seenByColleague = await getItemCard(colleague.id, variantId, branch.id);
    expect(seenByColleague!.movements).toHaveLength(1);
    expect(seenByColleague!.movements[0]).toMatchObject({ balanceAfter: "6.000", order: null });
    // The branch's Principal and Finance are behind the wall too (permission review, should-fix 2).
    for (const role of ["PRINCIPAL", "FINANCE"] as const) {
      const viewer = await insertUser(role, { branches: [branch.id] });
      const seen = await getItemCard(viewer.id, variantId, branch.id);
      expect(seen!.movements[0]).toMatchObject({ balanceAfter: "6.000", order: null });
    }
    // The owner and the Head see the same row with its order.
    const seenByOwner = await getItemCard(owner.id, variantId, branch.id);
    expect(seenByOwner!.movements[0]!.order?.id).toBe(receipt.order.id);
    const seenByHead = await getItemCard(head.id, variantId, branch.id);
    expect(seenByHead!.movements[0]!.order?.id).toBe(receipt.order.id);
  });
});

describe("getItemCard: what has no card, and pages (plan of 5.3, decided items 3 and 6)", () => {
  it("a service and an unknown subtype have no card", async () => {
    const branch = await insertBranch();
    const service = await insertProduct({ type: "SERVICE" });
    expect(await getItemCard(head.id, service.defaultVariantId, branch.id)).toBeNull();
    expect(await getItemCard(head.id, randomUUID(), branch.id)).toBeNull();
    expect(await getItemCard(head.id, "not-an-id", branch.id)).toBeNull();
    expect(await getItemCard(head.id, await goods(), randomUUID())).toBeNull();
  });

  it("a deactivated subtype's card opens (04 rule 2: data stays); a branch it never held shows 0", async () => {
    const branch = await insertBranch();
    const product = await insertProduct();
    const [subtypeId] = await insertSubtypes(product.id, [{ name: "Ko'k" }, { isActive: false }]);
    await db.execute(sql`update product_variants set is_active = false where id = ${subtypeId!}`);
    const card = await getItemCard(head.id, subtypeId!, branch.id);
    expect(card).toMatchObject({ subtypeName: "Ko'k", quantity: "0", movements: [], found: 0 });
  });

  it(`page 2 holds the movement after the first ${ITEM_CARD_PAGE_SIZE}; a page past the last gives the last`, async () => {
    setClock(AT);
    const branch = await insertBranch();
    const variantId = await goods();
    await db.transaction(async (tx) => {
      for (let index = 0; index <= ITEM_CARD_PAGE_SIZE; index += 1) {
        await postMovement(tx, {
          branchId: branch.id,
          variantId,
          type: "DIRECT_ENTRY",
          qtyDelta: "1",
          unitCost: 100n,
          createdBy: head.id,
        });
      }
    });
    const first = await getItemCard(head.id, variantId, branch.id);
    expect(first).toMatchObject({ page: 1, pages: 2, found: ITEM_CARD_PAGE_SIZE + 1 });
    expect(first!.movements).toHaveLength(ITEM_CARD_PAGE_SIZE);
    expect(first!.movements[0]!.balanceAfter).toBe(`${ITEM_CARD_PAGE_SIZE + 1}.000`);
    const second = await getItemCard(head.id, variantId, branch.id, 2);
    expect(second!.movements.map((row) => row.balanceAfter)).toEqual(["1.000"]);
    const past = await getItemCard(head.id, variantId, branch.id, 9);
    expect(past!.page).toBe(2);
  });
});

describe("getItemCard: the Reverse button (plan of 5.7; 09 Issue to a department 3; Decided ahead, question 19)", () => {
  it("is offered to the Head and the creating Manager only, on a posted issue's own row; a reversed one shows Reversed and no button", async () => {
    setClock(AT);
    const branch = await insertBranch();
    const maker = await insertUser("MANAGER", { branches: [branch.id] });
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const switchedOff = await insertUser("MANAGER", { branches: [branch.id] });
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    const department = await insertDepartment(branch.id);
    const variantId = await goods();
    await receive(branch.id, variantId, "10", 5000n, maker.id);
    const kept = await postDocument({
      type: "ISSUE",
      branchId: branch.id,
      departmentId: department.id,
      createdBy: maker.id,
      lines: [{ variantId, qty: "2" }],
    });
    const undone = await postDocument({
      type: "ISSUE",
      branchId: branch.id,
      departmentId: department.id,
      createdBy: maker.id,
      lines: [{ variantId, qty: "1" }],
    });
    const reversed = await runAction(reverseStockDocument, maker.id, {
      documentId: undone.documentId,
      reason: "Sinov sababi",
    });
    expect(reversed.ok).toBe(true);
    // The maker's own issue, the right off: authorize() would refuse, so no button (D40).
    const madeOff = await postDocument({
      type: "ISSUE",
      branchId: branch.id,
      departmentId: department.id,
      createdBy: switchedOff.id,
      lines: [{ variantId, qty: "1" }],
    });
    await setManagerRight(switchedOff.id, "RETURN_REVERSE", false);

    const rows = async (userId: string) => {
      const card = await getItemCard(userId, variantId, branch.id);
      return card!.movements.map((row) => ({
        type: row.type,
        documentId: row.documentId,
        documentStatus: row.documentStatus,
        canReverse: row.canReverse,
      }));
    };
    const offered = async (userId: string) =>
      (await rows(userId)).filter((row) => row.canReverse).map((row) => row.documentId);

    // Newest first: the switched-off Manager's issue, the reversal, the reversed issue, the kept
    // issue, the receipt.
    expect(await rows(head.id)).toEqual([
      { type: "ISSUE", documentId: madeOff.documentId, documentStatus: "POSTED", canReverse: true },
      {
        type: "REVERSAL",
        documentId: undone.documentId,
        documentStatus: "REVERSED",
        canReverse: false,
      },
      {
        type: "ISSUE",
        documentId: undone.documentId,
        documentStatus: "REVERSED",
        canReverse: false,
      },
      { type: "ISSUE", documentId: kept.documentId, documentStatus: "POSTED", canReverse: true },
      { type: "RECEIPT", documentId: null, documentStatus: null, canReverse: false },
    ]);
    expect(await offered(maker.id)).toEqual([kept.documentId]);
    expect(await offered(colleague.id)).toEqual([]);
    expect(await offered(switchedOff.id)).toEqual([]);
    expect(await offered(principal.id)).toEqual([]);
    expect(await offered(finance.id)).toEqual([]);
  });
});
