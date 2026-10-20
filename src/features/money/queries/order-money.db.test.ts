import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { moneyPrefill } from "@/domain/money-ledger";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder, setOrderStatus } from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { getOrderPage } from "../../orders/queries/order-page";
import { tickedSummary } from "../../orders/queries/order-list";
import { cancelMoney } from "../actions/cancel-money";
import { recordMoney } from "../actions/record-money";
import { moneyPrefillOrders } from "./money-prefill";
import { getOrderMoney } from "./order-money";

// The Money tab and the Record money dialog's orders (build plan 4.3; 11-screens-and-ux.md, Order
// page layout 3; 08-money-and-settlement.md, Money ledger and Order's cash count; plan of 4.3,
// decided items 1, 2 and 11; review of the plan, Must fix 3): rows, count, who is offered Record
// money and Cancel, and the branch and draft walls inside each query's own SQL, called directly.
// Every row a wall keeps out has every other value that would let it in (.claude/rules/tests.md).

async function scene() {
  setClock("2031-05-10T07:00:00Z");
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const colleague = await insertUser("MANAGER", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  const other = await insertBranch();
  const otherFinance = await insertUser("FINANCE", { branches: [other.id] });
  const otherPrincipal = await insertUser("PRINCIPAL", { branches: [other.id] });
  return { branch, manager, colleague, finance, principal, head, otherFinance, otherPrincipal };
}

async function recorded(
  financeId: string,
  order: { id: string; version: number },
  kind: string,
  amount: string,
) {
  const result = await runOrdersAction(recordMoney, financeId, {
    clientKey: randomUUID(),
    orders: [{ id: order.id, version: order.version }],
    kind,
    occurredOn: "2031-05-09",
    documentNo: "KO-3",
    comment: "Invented money",
    amounts: { [order.id]: amount },
  });
  expect(result).toMatchObject({ ok: true });
}

describe("getOrderMoney (11 Order page layout 3; 08 Money ledger)", () => {
  it("the rows newest first and the count; a cancelled action's row is shown with its reason and left out of the count", async () => {
    const { branch, manager, finance } = await scene();
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    await recorded(finance.id, order, "CASH_GIVEN", "50000");
    setClock("2031-05-10T09:00:00Z");
    await recorded(finance.id, { id: order.id, version: order.version + 1 }, "CASH_GIVEN", "7000");
    const trip = (await insertTrip(branch.id, manager.id)).rows[0]!.id;
    await insertPurchaseRow({
      tripId: trip,
      orderId: order.id,
      branchId: branch.id,
      variantId: order.variantId,
      createdBy: manager.id,
      qty: "4",
    });

    const before = await getOrderMoney(finance.id, order.id);
    expect(before!.count).toBe(37_000n);
    expect(before!.rows.map((row) => row.amount)).toEqual([7_000n, 50_000n]);
    expect(before!.rows[0]).toMatchObject({
      kind: "CASH_GIVEN",
      occurredOn: "2031-05-09",
      documentNo: "KO-3",
      comment: "Invented money",
      isCancelled: false,
      cancel: { orders: [{ id: order.id, version: order.version + 2 }], total: 7_000n },
    });

    expect(
      await runOrdersAction(cancelMoney, finance.id, {
        clientKey: randomUUID(),
        moneyActionId: before!.rows[0]!.actionId,
        orders: [{ id: order.id, version: order.version + 2 }],
        reason: "Typed twice",
      }),
    ).toMatchObject({ ok: true });
    const after = await getOrderMoney(finance.id, order.id);
    expect(after!.count).toBe(30_000n);
    expect(after!.rows[0]).toMatchObject({
      amount: 7_000n,
      isCancelled: true,
      cancelReason: "Typed twice",
      cancel: null,
    });
  });

  it("Cancel is offered to Finance of the branch only, and not once an order of the action is Closed", async () => {
    const { branch, manager, finance, principal, head } = await scene();
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    await recorded(finance.id, order, "BANK_TRANSFER", "50000");
    for (const user of [manager, principal, head]) {
      const money = await getOrderMoney(user.id, order.id);
      expect(money!.rows).toHaveLength(1);
      expect(money!.rows[0]!.cancel).toBeNull();
    }
    expect((await getOrderMoney(finance.id, order.id))!.rows[0]!.cancel).not.toBeNull();
    await setOrderStatus(order.id, "CLOSED");
    expect((await getOrderMoney(finance.id, order.id))!.rows[0]!.cancel).toBeNull();
  });

  it("another branch's order is null for its Finance and its Principal; the own branch's users see it", async () => {
    const { branch, manager, finance, principal, otherFinance, otherPrincipal } = await scene();
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    await recorded(finance.id, order, "CASH_GIVEN", "50000");
    expect(await getOrderMoney(otherFinance.id, order.id)).toBeNull();
    expect(await getOrderMoney(otherPrincipal.id, order.id)).toBeNull();
    expect(await getOrderMoney(principal.id, order.id)).not.toBeNull();
    expect(await getOrderMoney(finance.id, order.id)).not.toBeNull();
  });

  it("a numbered Draft (taken back) is behind the draft wall for a colleague of its branch; its owner and the Head see it", async () => {
    const { branch, manager, colleague, head } = await scene();
    const draft = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "DRAFT",
      number: "TST-31-0001",
    });
    expect(await getOrderMoney(colleague.id, draft.id)).toBeNull();
    expect(await getOrderMoney(manager.id, draft.id)).not.toBeNull();
    expect(await getOrderMoney(head.id, draft.id)).not.toBeNull();
  });

  it("an unknown or malformed id is null", async () => {
    const { finance } = await scene();
    expect(await getOrderMoney(finance.id, randomUUID())).toBeNull();
    expect(await getOrderMoney(finance.id, "not-an-id")).toBeNull();
  });
});

describe("moneyPrefillOrders (plan of 4.3, decided item 2)", () => {
  it("each ticked order's planned cash and count; another branch's order is missing, never read", async () => {
    const { branch, manager, finance, otherFinance } = await scene();
    const cash = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    const transfer = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
      paymentType: "TRANSFER",
    });
    await recorded(finance.id, cash, "CASH_GIVEN", "60000");
    const answer = await moneyPrefillOrders(finance.id, [cash.id, transfer.id]);
    const byId = new Map(answer.map((order) => [order.id, order]));
    expect(byId.get(cash.id)).toMatchObject({
      plannedCash: 50_000n,
      cashCount: 60_000n,
      handed: 60_000n,
    });
    expect(byId.get(transfer.id)).toMatchObject({ plannedCash: 0n, cashCount: 0n, handed: 0n });
    expect(await moneyPrefillOrders(otherFinance.id, [cash.id, transfer.id])).toEqual([]);
  });

  it("a later Cash given prefills the planned cash not yet given (08 When Finance approves; D55 (1); plan of 4.10b)", async () => {
    const { branch, manager, finance } = await scene();
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    await recorded(finance.id, order, "CASH_GIVEN", "30000");
    const [read] = await moneyPrefillOrders(finance.id, [order.id]);
    expect(read).toMatchObject({ plannedCash: 50_000n, handed: 30_000n });
    expect(moneyPrefill("CASH_GIVEN", read!)).toBe(20_000n);
  });
});

describe("Record money is offered (decided item 1, Look first; .claude/rules/ui.md)", () => {
  it("to Finance of the branch on Open and Waiting for settlement orders; not on a Closed one, not to the Head", async () => {
    const { branch, manager, finance, head } = await scene();
    const open = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    const settling = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "SETTLEMENT",
    });
    const closed = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "CLOSED",
    });
    expect((await getOrderPage(finance.id, open.id))!.canRecordMoney).toBe(true);
    expect((await getOrderPage(finance.id, settling.id))!.canRecordMoney).toBe(true);
    expect((await getOrderPage(finance.id, closed.id))!.canRecordMoney).toBe(false);
    expect((await getOrderPage(head.id, open.id))!.canRecordMoney).toBe(false);
    expect((await tickedSummary(finance.id, [open.id, settling.id])).canRecordMoney).toBe(true);
    expect((await tickedSummary(finance.id, [open.id, closed.id])).canRecordMoney).toBe(false);
    expect((await tickedSummary(head.id, [open.id])).canRecordMoney).toBe(false);
  });
});
