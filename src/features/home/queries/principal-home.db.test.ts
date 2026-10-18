import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ordersTotals } from "@/domain/order-totals";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import {
  type OrderRow,
  insertDepartment,
  insertExtraCostType,
  insertOrder,
  insertOrderExtra,
  setOrderStatus,
} from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { getPrincipalHome } from "./principal-home";

// The Principal's home (build plan 6.1): 10-notifications-analytics-reports.md, Home page per role
// ("Waiting for my approval, with the total amount; my branch's orders by status; my branch's
// spending this month"); 11-screens-and-ux.md, Interface per role: Principal; 03 rule 1 (the
// branch wall); 08 Actual total; plan of 6.1, decided items 6, 8 and 9. Each counted row stands
// beside the rows the walls keep out (D40).

const AT = "2026-10-16T05:00:00Z";

async function scene() {
  const branch = await insertBranch();
  const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id);
  const product = await insertProduct({ referencePrice: 5_000n });
  const base = {
    branchId: branch.id,
    ownerId: manager.id,
    departmentId: department.id,
    variantId: product.defaultVariantId,
  };
  return { branch, principal, manager, base };
}

/** A submitted order with one extra cost, written while Sent back (`order_extras_plan_frozen`). */
async function orderWithExtra(row: OrderRow, amount: bigint) {
  const made = await insertOrder({ ...row, status: "RETURNED" });
  await insertOrderExtra(made.id, amount);
  await setOrderStatus(made.id, row.status ?? "PENDING_HEAD");
  return made;
}

describe("waiting for my approval: cards, their moves and the total (10 Home page per role; 11 Interface per role)", () => {
  it("one card per group row of the Principal's branch, with Approve, Send back and Reject; the total of every waiting order", async () => {
    setClock(AT);
    const { branch, principal, base } = await scene();
    const first = await insertOrder({ ...base, status: "PENDING_PRINCIPAL", plannedQty: "10.000" });
    const second = await orderWithExtra(
      { ...base, status: "PENDING_PRINCIPAL", plannedQty: "5.000", paymentType: "TRANSFER" },
      20_000n,
    );
    // Kept out: a step one off in the same branch; a waiting order of another branch.
    await insertOrder({ ...base, status: "PENDING_HEAD" });
    const other = await scene();
    await insertOrder({ ...other.base, status: "PENDING_PRINCIPAL" });

    const home = await getPrincipalHome(principal.id, branch.id);
    expect(home.cards).toHaveLength(1);
    const [card] = home.cards;
    expect(card!.group.status).toBe("PENDING_PRINCIPAL");
    expect(card!.group.orders.map((order) => order.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    expect(card!.moves).toEqual(["APPROVE", "SEND_BACK", "REJECT"]);
    expect(home.cardCount).toBe(1);
    expect(home.waiting.count).toBe(2);
    expect(home.waiting.totals).toEqual(
      ordersTotals([
        { quantity: "10.000", price: 5000n, extras: [], paymentType: "CASH" },
        { quantity: "5.000", price: 5000n, extras: [20_000n], paymentType: "TRANSFER" },
      ]),
    );
    // The same with "All my branches": the Principal has one branch, the wall keeps the other out.
    const all = await getPrincipalHome(principal.id, null);
    expect(all.waiting).toEqual(home.waiting);
    expect(all.cards.map((each) => each.group.key)).toEqual([card!.group.key]);
  });

  it("urgent cards come first (05 field 14; decided item 9)", async () => {
    setClock(AT);
    const { branch, principal, base } = await scene();
    const later = await insertProduct({ referencePrice: 5_000n });
    await insertOrder({ ...base, status: "PENDING_PRINCIPAL", neededBy: "2026-10-20" });
    const urgent = await insertOrder({
      ...base,
      variantId: later.defaultVariantId,
      status: "PENDING_PRINCIPAL",
      neededBy: "2026-12-20",
      priority: "URGENT",
      urgentReason: "Dars uchun kerak",
    });
    const home = await getPrincipalHome(principal.id, branch.id);
    expect(home.cards[0]!.group.orders.map((order) => order.id)).toEqual([urgent.id]);
    expect(home.cards[0]!.group.summary.urgent).toBe(true);
  });

  it("a Manager of the branch reads the cards with no move: the state machine decides (06 Allowed moves)", async () => {
    setClock(AT);
    const { branch, manager, base } = await scene();
    await insertOrder({ ...base, status: "PENDING_PRINCIPAL" });
    const home = await getPrincipalHome(manager.id, branch.id);
    expect(home.cards).toHaveLength(1);
    expect(home.cards[0]!.moves).toEqual([]);
  });

  it("another branch's address is Not found (03 rule 1)", async () => {
    setClock(AT);
    const { principal } = await scene();
    const other = await insertBranch();
    await expect(getPrincipalHome(principal.id, other.id)).rejects.toThrow(AuthorizationError);
  });
});

describe("my branch's orders by status (10 Home page per role; decided item 8)", () => {
  it("counts each status of the branch; no Draft, never submitted or taken back; no other branch", async () => {
    setClock(AT);
    const { branch, principal, base } = await scene();
    await insertOrder({ ...base, status: "PENDING_HEAD" });
    await insertOrder({ ...base, status: "PENDING_PRINCIPAL" });
    await insertOrder({ ...base, status: "PENDING_PRINCIPAL" });
    await insertOrder({ ...base, status: "CLOSED", closedAt: new Date(AT) });
    // A never-submitted draft and a taken-back one that keeps its number.
    await insertOrder({ ...base, status: "DRAFT" });
    await insertOrder({ ...base, status: "DRAFT", number: `${branch.code}-26-0999` });
    const other = await scene();
    await insertOrder({ ...other.base, status: "PENDING_HEAD" });
    await insertOrder({ ...other.base, status: "PENDING_PRINCIPAL" });
    await insertOrder({ ...other.base, status: "CLOSED", closedAt: new Date(AT) });

    const home = await getPrincipalHome(principal.id, null);
    expect(home.byStatus).toEqual([
      { status: "PENDING_HEAD", count: 1 },
      { status: "PENDING_PRINCIPAL", count: 2 },
      { status: "CLOSED", count: 1 },
    ]);
  });
});

describe("my branch's spending this month (08 Actual total; decided item 6, Look first)", () => {
  async function bought(
    row: { branchId: string; ownerId: string; variantId: string; departmentId: string },
    purchasedOn: string,
    qty: string,
    unitPrice: string,
    extra: bigint | null = null,
  ) {
    const order = await insertOrder({ ...row, status: "PURCHASING", approvedAt: new Date(AT) });
    const tripId = (await insertTrip(row.branchId, row.ownerId, undefined, purchasedOn)).rows[0]!
      .id;
    const purchase = await insertPurchaseRow({
      tripId,
      orderId: order.id,
      branchId: row.branchId,
      variantId: row.variantId,
      createdBy: row.ownerId,
      qty,
      unitPrice,
    });
    const purchaseId = purchase.rows[0]!.id;
    if (extra !== null) {
      const type = await insertExtraCostType();
      await db.execute(sql`
        insert into purchase_extras (purchase_id, extra_cost_type_id, amount, payment_type,
          created_at)
        values (${purchaseId}, ${type.id}, ${extra}, 'CASH', ${AT})`);
    }
    return purchaseId;
  }

  it("the review's worked example: 100 000 + 20 000 extra on 1 October and 50 000 on 31 October make 170 000", async () => {
    // 16 October in Tashkent.
    setClock(AT);
    const { branch, principal, manager, base } = await scene();
    await bought(base, "2026-10-01", "10.000", "10000", 20_000n);
    await bought(base, "2026-10-31", "1.000", "50000");
    // Kept out: a cancelled record of this month, the last day of last month, the first day of
    // next month, and another branch's record of this month.
    const cancelled = await bought(base, "2026-10-15", "1.000", "70000");
    await db.execute(sql`update purchases set is_cancelled = true, cancel_reason = 'Xato kiritildi',
      cancelled_by = ${manager.id}, cancelled_at = ${AT} where id = ${cancelled}`);
    await bought(base, "2026-09-30", "1.000", "40000");
    await bought(base, "2026-11-01", "1.000", "30000");
    const other = await scene();
    await bought(other.base, "2026-10-10", "1.000", "99000");

    const home = await getPrincipalHome(principal.id, branch.id);
    expect(home.month).toEqual({ first: "2026-10-01", last: "2026-10-31" });
    expect(home.spending).toBe(170_000n);
    expect((await getPrincipalHome(principal.id, null)).spending).toBe(170_000n);
  });

  it("the month is the Tashkent one: 31 October 20:00 UTC is already November", async () => {
    setClock("2026-10-31T20:00:00Z");
    const { principal, base } = await scene();
    await bought(base, "2026-10-31", "1.000", "50000");
    await bought(base, "2026-11-01", "1.000", "30000");
    const home = await getPrincipalHome(principal.id, null);
    expect(home.month).toEqual({ first: "2026-11-01", last: "2026-11-30" });
    expect(home.spending).toBe(30_000n);
  });
});
