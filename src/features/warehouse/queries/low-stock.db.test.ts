import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { getItemCard } from "./item-card";
import { listStockOnHand } from "./stock-on-hand";

// The minimum, "Low" and "Low stock only" as Stock on hand and the item card read them (build plan
// 5.10; plan of 5.10, Tests). Spec: 09-warehouse.md (Stock screens: Stock on hand "minimum"; "Low
// stock only" switch; Low stock: "falls to its minimum or below"; "An item with no minimum never
// shows as low"); 00-definitions.md, Minimum stock; 03 rule 1 (the branch wall). The rows that
// must not be listed stand beside the one that must, each with every other value that would let
// it in (D40; .claude/rules/tests.md): the boundary rows of review of the plan, should fix 3.

const AT = "2031-05-03T06:00:00Z";

let branch: { id: string; code: string };
let other: { id: string; code: string };
let head: string;

beforeEach(async () => {
  setClock(AT);
  branch = await insertBranch();
  other = await insertBranch();
  head = (await insertUser("HEAD")).id;
});

/** A subtype with `qty` on hand in the branch and a minimum row of `minQty` (undefined: no row). */
async function item(qty: string, minQty: string | null | undefined, branchId = branch.id) {
  const { variantId, name } = await insertItem({ allowDecimal: true });
  await receive(branchId, variantId, qty, 1000n, head);
  if (minQty !== undefined) {
    await db.execute(sql`
      insert into stock_minimums (branch_id, variant_id, min_qty, created_at, updated_at)
      values (${branchId}, ${variantId}, ${minQty}, ${AT}, ${AT})`);
  }
  return { variantId, name };
}

describe("Stock on hand: the minimum column and 'Low stock only' (09 Stock screens; Low stock)", () => {
  it("lists only rows at or below their minimum: the boundary rows side by side", async () => {
    const at = await item("5", "5");
    const above = await item("5.001", "5");
    const cleared = await item("1", null);
    const none = await item("1", undefined);
    const elsewhere = await item("1", "5", other.id);
    const manager = await insertUser("MANAGER", { branches: [branch.id] });

    const all = await listStockOnHand(manager.id, {});
    const shown = (ids: { variantId: string }[]) => ids.map((each) => each.variantId);
    expect(all.rows.map((row) => row.variantId).sort()).toEqual(
      shown([at, above, cleared, none]).sort(),
    );
    expect(all.rows.find((row) => row.variantId === at.variantId)).toMatchObject({
      minimum: "5.000",
      low: true,
    });
    expect(all.rows.find((row) => row.variantId === above.variantId)).toMatchObject({
      minimum: "5.000",
      low: false,
    });
    expect(all.rows.find((row) => row.variantId === cleared.variantId)).toMatchObject({
      minimum: null,
      low: false,
    });

    const low = await listStockOnHand(manager.id, { low: true });
    expect(low.rows.map((row) => row.variantId)).toEqual([at.variantId]);
    expect(low.found).toBe(1);

    // The Head sees the other branch's Low row too; the Manager never did.
    const heads = await listStockOnHand(head, { low: true });
    expect(heads.rows.map((row) => row.variantId).sort()).toEqual(shown([at, elsewhere]).sort());
  });

  it("an item with a minimum and no movement is listed at 0, Low", async () => {
    const { variantId } = await insertItem();
    await db.execute(sql`
      insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
      values (${branch.id}, ${variantId}, 0, 0, ${AT}, ${AT})`);
    await db.execute(sql`
      insert into stock_minimums (branch_id, variant_id, min_qty, created_at, updated_at)
      values (${branch.id}, ${variantId}, 2, ${AT}, ${AT})`);
    const low = await listStockOnHand(head, { low: true, branch: branch.id });
    expect(low.rows).toEqual([
      expect.objectContaining({ variantId, quantity: "0.000", minimum: "2.000", low: true }),
    ]);
  });

  it("says who may set the minimum and add a draft, per role and right (04 rule 5; 03 matrix)", async () => {
    const row = await item("5", "5");
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const limited = await insertUser("MANAGER", { branches: [branch.id] });
    await setManagerRight(limited.id, "SET_MINIMUMS", false);
    await setManagerRight(limited.id, "CREATE_REQUESTS", false);
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const finance = await insertUser("FINANCE", { branches: [branch.id] });

    const rights = async (userId: string) => {
      const page = await listStockOnHand(userId, { branch: branch.id });
      const found = page.rows.find((each) => each.variantId === row.variantId)!;
      return [found.canSetMinimum, found.canAddDraft];
    };
    expect(await rights(head)).toEqual([true, true]);
    expect(await rights(manager.id)).toEqual([true, true]);
    expect(await rights(limited.id)).toEqual([false, false]);
    expect(await rights(principal.id)).toEqual([false, false]);
    expect(await rights(finance.id)).toEqual([false, false]);
  });
});

describe("the item card's header: minimum and Low (09 Low stock: 'on the item card')", () => {
  it("shows the minimum and Low at the minimum, not 0.001 above, never with none", async () => {
    const at = await item("5", "5");
    const above = await item("5.001", "5");
    const none = await item("1", undefined);
    expect(await getItemCard(head, at.variantId, branch.id)).toMatchObject({
      minimum: "5.000",
      low: true,
      canSetMinimum: true,
      canAddDraft: true,
    });
    expect(await getItemCard(head, above.variantId, branch.id)).toMatchObject({ low: false });
    expect(await getItemCard(head, none.variantId, branch.id)).toMatchObject({
      minimum: null,
      low: false,
    });
  });

  it("reads the minimum of the card's branch only, and a Principal may not set it", async () => {
    const { variantId } = await insertItem();
    await receive(branch.id, variantId, "5", 1000n, head);
    await receive(other.id, variantId, "5", 1000n, head);
    await db.execute(sql`
      insert into stock_minimums (branch_id, variant_id, min_qty, created_at, updated_at)
      values (${other.id}, ${variantId}, 9, ${AT}, ${AT})`);
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    expect(await getItemCard(principal.id, variantId, branch.id)).toMatchObject({
      minimum: null,
      low: false,
      canSetMinimum: false,
      canAddDraft: false,
    });
    expect(await getItemCard(head, variantId, other.id)).toMatchObject({
      minimum: "9.000",
      low: true,
    });
  });
});
