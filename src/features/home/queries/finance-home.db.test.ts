import { describe, expect, it } from "vitest";

import {
  actionTotal,
  approvalCashRows,
  plannedCash,
  settlementNet,
  settlementRows,
} from "@/domain/money-ledger";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertMoneyAction, insertMoneyRow } from "../../../../tests/helpers/money";
import {
  type OrderRow,
  insertDepartment,
  insertOrder,
  insertOrderExtra,
  setOrderStatus,
} from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { listOrderGroups } from "@/features/orders/queries/order-list";
import { getFinanceHome } from "./finance-home";

// The Finance home (build plan 6.2): 10-notifications-analytics-reports.md, Home page per role
// ("Waiting for my approval; waiting for settlement"); 11-screens-and-ux.md, Interface per role:
// Finance ("approvals and settlements with the exact amount to give or receive. Each one opens the
// order list filtered to those orders, ready to tick"); 08 When Finance approves, Closing 2, Money
// ledger 2; plan of 6.2, decided item 3, Look first. Each counted row stands beside the rows the
// walls keep out (D40).

const AT = "2031-05-15T05:00:00Z";

async function scene() {
  const branch = await insertBranch();
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id);
  const product = await insertProduct({ referencePrice: 5_000n });
  const base = {
    branchId: branch.id,
    ownerId: manager.id,
    departmentId: department.id,
    variantId: product.defaultVariantId,
  };
  return { branch, finance, manager, base };
}

/** The orders a link's filters open on the order list. */
async function listed(userId: string, filters: Parameters<typeof listOrderGroups>[1]) {
  const page = await listOrderGroups(userId, filters);
  return page.groups.flatMap((group) => group.orders.map((each) => each.id)).sort();
}

describe("waiting for my approval: cash to give per owner and branch (08 When Finance approves; decided item 3)", () => {
  it("one entry per owner; cash to give is the dialog's prefill, the Cash order's total with its extra and 0 for Transfer", async () => {
    setClock(AT);
    const { branch, finance, manager, base } = await scene();
    // A Cash order with a 20 000 extra, written while Sent back (`order_extras_plan_frozen`).
    const cash = await insertOrder({ ...base, status: "RETURNED" });
    await insertOrderExtra(cash.id, 20_000n);
    await setOrderStatus(cash.id, "PENDING_FINANCE");
    const transfer = await insertOrder({
      ...base,
      status: "PENDING_FINANCE",
      paymentType: "TRANSFER",
      plannedQty: "60.000",
    });
    const second = await insertUser("MANAGER", { branches: [branch.id] });
    const theirs = await insertOrder({ ...base, ownerId: second.id, status: "PENDING_FINANCE" });
    // Kept out: a step one off; another branch's Waiting for Finance order.
    await insertOrder({ ...base, status: "PENDING_PRINCIPAL" });
    const other = await scene();
    await insertOrder({ ...other.base, status: "PENDING_FINANCE" });

    const home = await getFinanceHome(finance.id, null);
    expect(home.approvals.map((entry) => [entry.ownerId, entry.count])).toEqual(
      [
        [manager.id, 2],
        [second.id, 1],
      ].sort((a, b) =>
        (a[0] === manager.id ? manager.fullName : second.fullName).localeCompare(
          b[0] === manager.id ? manager.fullName : second.fullName,
        ),
      ),
    );
    const mine = home.approvals.find((entry) => entry.ownerId === manager.id)!;
    const plans = [
      { quantity: "10.000", price: 5000n, extras: [20_000n], paymentType: "CASH" as const },
      { quantity: "60.000", price: 5000n, extras: [], paymentType: "TRANSFER" as const },
    ];
    expect(mine.cashToGive).toBe(70_000n);
    expect(mine.cashToGive).toBe(
      actionTotal(
        approvalCashRows(
          plans.map((plan, at) => ({
            id: String(at),
            ownerId: manager.id,
            amount: plannedCash(plan),
          })),
        ).flatMap((block) => block.rows),
      ),
    );
    expect(mine.planned).toBe(370_000n);
    expect(mine).toMatchObject({ branchId: branch.id, branchCode: branch.code });
    // The entry's link holds exactly its orders (11 Interface per role: Finance).
    expect(mine.filters).toMatchObject({
      status: "PENDING_FINANCE",
      owner: manager.id,
      branch: branch.id,
    });
    expect(await listed(finance.id, mine.filters)).toEqual([cash.id, transfer.id].sort());
    const theirEntry = home.approvals.find((entry) => entry.ownerId === second.id)!;
    expect(await listed(finance.id, theirEntry.filters)).toEqual([theirs.id]);
  });
});

describe("waiting for settlement: the amount to receive or give (08 Closing 2; Money ledger 2; decided item 3)", () => {
  it("the net of the prefilled rows per owner: holding 60 000 and owed 150 000 give 'pay 90 000'; counts at 0 give none", async () => {
    setClock(AT);
    const { branch, finance, manager, base } = await scene();
    const give = async (orderId: string, ownerId: string, amount: string) => {
      const action = await insertMoneyAction({ managerId: ownerId, createdBy: finance.id });
      await insertMoneyRow({ moneyActionId: action.rows[0]!.id, orderId, amount });
    };
    // Holds 60 000: given 60 000, nothing spent.
    const holding = await insertOrder({ ...base, status: "PURCHASING", approvedAt: new Date(AT) });
    await give(holding.id, manager.id, "60000");
    await setOrderStatus(holding.id, "SETTLEMENT");
    // Owed 150 000: given 50 000, spent 200 000 in cash.
    const owed = await insertOrder({ ...base, status: "PURCHASING", approvedAt: new Date(AT) });
    await give(owed.id, manager.id, "50000");
    const tripId = (await insertTrip(branch.id, manager.id)).rows[0]!.id;
    await insertPurchaseRow({
      tripId,
      orderId: owed.id,
      branchId: branch.id,
      variantId: base.variantId,
      createdBy: manager.id,
      qty: "1",
      unitPrice: "200000",
    });
    await setOrderStatus(owed.id, "SETTLEMENT");
    // Another owner whose order has no cash at all.
    const second = await insertUser("MANAGER", { branches: [branch.id] });
    const even = await insertOrder({
      ...base,
      ownerId: second.id,
      status: "SETTLEMENT",
      approvedAt: new Date(AT),
    } satisfies OrderRow);
    // Kept out: an Open order of the same owner; another branch's settlement.
    await insertOrder({ ...base, status: "PURCHASING", approvedAt: new Date(AT) });
    const other = await scene();
    await insertOrder({ ...other.base, status: "SETTLEMENT", approvedAt: new Date(AT) });

    const home = await getFinanceHome(finance.id, branch.id);
    const mine = home.settlements.find((entry) => entry.ownerId === manager.id)!;
    expect(mine.count).toBe(2);
    expect(mine.net).toEqual({ direction: "TO_MANAGER", amount: 90_000n });
    expect(mine.net).toEqual(
      settlementNet(
        settlementRows([
          { id: holding.id, cashCount: 60_000n },
          { id: owed.id, cashCount: -150_000n },
        ]),
      ),
    );
    expect(await listed(finance.id, mine.filters)).toEqual([holding.id, owed.id].sort());
    const theirs = home.settlements.find((entry) => entry.ownerId === second.id)!;
    expect(theirs.net).toEqual({ direction: "NONE", amount: 0n });
    expect(await listed(finance.id, theirs.filters)).toEqual([even.id]);
    expect(home.settlements).toHaveLength(2);
  });

  it("a Manager who only holds cash is to hand it back: TO_FINANCE", async () => {
    setClock(AT);
    const { finance, manager, base } = await scene();
    const order = await insertOrder({ ...base, status: "PURCHASING", approvedAt: new Date(AT) });
    const action = await insertMoneyAction({ managerId: manager.id, createdBy: finance.id });
    await insertMoneyRow({ moneyActionId: action.rows[0]!.id, orderId: order.id, amount: "45000" });
    await setOrderStatus(order.id, "SETTLEMENT");
    const home = await getFinanceHome(finance.id, base.branchId);
    expect(home.settlements.map((entry) => entry.net)).toEqual([
      { direction: "TO_FINANCE", amount: 45_000n },
    ]);
  });
});
