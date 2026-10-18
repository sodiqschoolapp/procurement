import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { productInUse } from "@/features/catalog/actions/product-uses";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes, insertUnit } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment } from "../../../../tests/helpers/orders";
import { postDocument, receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { setStockMinimum } from "./minimum";
import { reverseStockDocument } from "./reverse";

// Minimum stock and low stock (build plan 5.10; plan of 5.10, Tests). Spec: 09-warehouse.md (Low
// stock: "When a quantity falls to its minimum or below, the item gets a 'Low' label"; "An item
// with no minimum never shows as low"); 10-notifications-analytics-reports.md, Notifications:
// "Item reached its minimum stock | Managers of the branch, once per item until restocked";
// 04-catalogs.md rule 5; 00-definitions.md, Minimum stock. Every fixture is asserted (D38); the
// rows that must not count stand beside the ones that do (D40): two Managers of the branch, a
// Manager of another branch, an inactive Manager of the branch, the Head.

const AT = "2031-05-03T06:00:00Z";

let branch: { id: string; code: string };
let other: { id: string; code: string };
let head: string;
let managers: string[];
let outsider: string;
let inactive: string;
let department: string;

beforeEach(async () => {
  setClock(AT);
  branch = await insertBranch();
  other = await insertBranch();
  head = (await insertUser("HEAD")).id;
  managers = [
    (await insertUser("MANAGER", { branches: [branch.id] })).id,
    (await insertUser("MANAGER", { branches: [branch.id] })).id,
  ];
  outsider = (await insertUser("MANAGER", { branches: [other.id] })).id;
  inactive = (await insertUser("MANAGER", { branches: [branch.id], isActive: false })).id;
  department = (await insertDepartment(branch.id)).id;
});

async function goods(allowDecimal = false) {
  const unit = await insertUnit({ allowDecimal });
  const product = await insertProduct({ unitId: unit.id });
  return { productId: product.id, variantId: product.defaultVariantId };
}

async function setMinimum(variantId: string, minQty: string, by = head, branchId = branch.id) {
  return runAction(setStockMinimum, by, { branchId, variantId, minQty });
}

async function issue(variantId: string, qty: string, branchId = branch.id) {
  const dept = branchId === branch.id ? department : (await insertDepartment(branchId)).id;
  return postDocument({
    type: "ISSUE",
    branchId,
    departmentId: dept,
    createdBy: head,
    lines: [{ variantId, qty }],
  });
}

/** The low-stock notices of one subtype, per recipient. */
async function noticesOf(variantId: string): Promise<Record<string, number>> {
  const found = await db.execute<{ user_id: string; n: number }>(sql`
    select user_id, count(*)::int as n from notifications
    where type = 'MINIMUM_STOCK_REACHED' and link like ${`/warehouse/items/${variantId}?%`}
    group by user_id`);
  return Object.fromEntries(found.rows.map((row) => [row.user_id, row.n]));
}

function once(...users: string[]): Record<string, number> {
  return Object.fromEntries(users.map((user) => [user, 1]));
}

async function minimumRow(variantId: string, branchId = branch.id) {
  const found = await db.execute<{ min_qty: string | null; notified: boolean }>(sql`
    select min_qty::text as min_qty, low_notified_at is not null as notified from stock_minimums
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0] ?? null;
}

describe("Done when: the notice once per item until restocked (09 Low stock; 10 Notifications)", () => {
  it("an issue to the minimum makes the item Low and tells each active Manager of the branch once", async () => {
    const item = await goods();
    await receive(branch.id, item.variantId, "10", 1000n, head);
    await receive(other.id, item.variantId, "10", 1000n, head);
    expect(await setMinimum(item.variantId, "5")).toEqual({
      ok: true,
      data: { minimum: "5", low: false },
    });
    expect(await noticesOf(item.variantId)).toEqual({});

    await issue(item.variantId, "5");
    expect(await minimumRow(item.variantId)).toEqual({ min_qty: "5.000", notified: true });
    // Exactly one each for the two; none for the other branch's, the inactive one or the Head.
    expect(await noticesOf(item.variantId)).toEqual(once(...managers));

    const [row] = (
      await db.execute<{ params: unknown; link: string }>(sql`
        select params, link from notifications
        where type = 'MINIMUM_STOCK_REACHED' and user_id = ${managers[0]!}`)
    ).rows;
    expect(row).toMatchObject({
      params: { branch: branch.code },
      link: `/warehouse/items/${item.variantId}?branch=${branch.id}`,
    });
    void outsider;
    void inactive;
  });

  it("a second issue sends none; a restock above the minimum and a fall to it again sends one more", async () => {
    const item = await goods();
    await receive(branch.id, item.variantId, "10", 1000n, head);
    expect(await setMinimum(item.variantId, "5")).toMatchObject({ ok: true });
    await issue(item.variantId, "5");
    expect(await noticesOf(item.variantId)).toEqual(once(...managers));

    await issue(item.variantId, "1");
    expect(await noticesOf(item.variantId)).toEqual(once(...managers));

    // A receipt that keeps it at the minimum is no restock (decided item 2, Look first).
    await receive(branch.id, item.variantId, "1", 1000n, head);
    expect(await minimumRow(item.variantId)).toEqual({ min_qty: "5.000", notified: true });

    await receive(branch.id, item.variantId, "3", 1000n, head);
    expect(await minimumRow(item.variantId)).toEqual({ min_qty: "5.000", notified: false });
    expect(await noticesOf(item.variantId)).toEqual(once(...managers));

    await issue(item.variantId, "3");
    expect(await noticesOf(item.variantId)).toEqual({ [managers[0]!]: 2, [managers[1]!]: 2 });
  });

  it("an item with no minimum is never Low and sends nothing, even at 0", async () => {
    const item = await goods();
    await receive(branch.id, item.variantId, "2", 1000n, head);
    await issue(item.variantId, "2");
    expect(await minimumRow(item.variantId)).toBeNull();
    expect(await noticesOf(item.variantId)).toEqual({});
  });

  it("another branch's minimum is not this branch's: its fall tells only its own Managers", async () => {
    const item = await goods();
    await receive(branch.id, item.variantId, "10", 1000n, head);
    await receive(other.id, item.variantId, "10", 1000n, head);
    expect(await setMinimum(item.variantId, "5", head, other.id)).toMatchObject({ ok: true });
    await issue(item.variantId, "6");
    expect(await noticesOf(item.variantId)).toEqual({});
    await issue(item.variantId, "6", other.id);
    expect(await noticesOf(item.variantId)).toEqual(once(outsider));
  });
});

describe("the minimum itself (04 rule 5; 09 Low stock; plan of 5.10, decided items 1, 2, 5)", () => {
  it("a minimum set at or above the stock sends the notice once, the Manager who set it included", async () => {
    const item = await goods();
    await receive(branch.id, item.variantId, "4", 1000n, head);
    expect(await setMinimum(item.variantId, "4", managers[0])).toEqual({
      ok: true,
      data: { minimum: "4", low: true },
    });
    expect(await noticesOf(item.variantId)).toEqual(once(...managers));
    expect(await setMinimum(item.variantId, "6")).toMatchObject({ data: { low: true } });
    expect(await noticesOf(item.variantId)).toEqual(once(...managers));
  });

  it("lowering the minimum below the stock clears the mark; raising it again sends one more", async () => {
    const item = await goods();
    await receive(branch.id, item.variantId, "4", 1000n, head);
    await setMinimum(item.variantId, "4");
    expect(await setMinimum(item.variantId, "3")).toMatchObject({ data: { low: false } });
    expect(await minimumRow(item.variantId)).toEqual({ min_qty: "3.000", notified: false });
    await setMinimum(item.variantId, "8");
    expect(await noticesOf(item.variantId)).toEqual({ [managers[0]!]: 2, [managers[1]!]: 2 });
  });

  it("clearing keeps the row with no minimum, clears Low and writes the audit row", async () => {
    const item = await goods();
    await receive(branch.id, item.variantId, "4", 1000n, head);
    await setMinimum(item.variantId, "5");
    setClock("2031-05-03T07:00:00Z");
    expect(await setMinimum(item.variantId, "")).toEqual({
      ok: true,
      data: { minimum: null, low: false },
    });
    expect(await minimumRow(item.variantId)).toEqual({ min_qty: null, notified: false });
    await issue(item.variantId, "4");
    expect(await noticesOf(item.variantId)).toEqual(once(...managers));

    const audits = await db.execute<{ before: unknown; after: unknown; actor_id: string }>(sql`
      select before, after, actor_id from audit_log
      where action = 'stock_minimum.set' and entity_id = ${`${branch.id}:${item.variantId}`}
      order by created_at`);
    expect(audits.rows.map((row) => [row.before, row.after])).toEqual([
      [
        { branchId: branch.id, variantId: item.variantId, minimum: null },
        { branchId: branch.id, variantId: item.variantId, minimum: "5" },
      ],
      [
        { branchId: branch.id, variantId: item.variantId, minimum: "5.000" },
        { branchId: branch.id, variantId: item.variantId, minimum: null },
      ],
    ]);
    expect(audits.rows.every((row) => row.actor_id === head)).toBe(true);
  });

  it("a minimum for an item never held makes its balance row at 0, Low at once", async () => {
    const item = await goods();
    expect(await setMinimum(item.variantId, "2")).toEqual({
      ok: true,
      data: { minimum: "2", low: true },
    });
    const balance = await db.execute<{ qty: string }>(sql`
      select qty::text as qty from stock_balances
      where branch_id = ${branch.id} and variant_id = ${item.variantId}`);
    expect(balance.rows).toEqual([{ qty: "0.000" }]);
    expect(await noticesOf(item.variantId)).toEqual(once(...managers));
  });

  it("a reverse that lowers the stock sends it too: every movement goes through the ledger", async () => {
    const item = await goods();
    await receive(branch.id, item.variantId, "6", 1000n, head);
    const returned = await postDocument({
      type: "RETURN",
      branchId: branch.id,
      departmentId: department,
      createdBy: head,
      lines: [{ variantId: item.variantId, qty: "2" }],
    });
    await setMinimum(item.variantId, "7");
    // 8 on hand, minimum 7: not Low; the reverse takes 2 back out.
    expect(await minimumRow(item.variantId)).toEqual({ min_qty: "7.000", notified: false });
    expect(
      await runAction(reverseStockDocument, head, {
        documentId: returned.documentId,
        reason: "Typed by mistake",
      }),
    ).toMatchObject({ ok: true });
    expect(await noticesOf(item.variantId)).toEqual(once(...managers));
  });

  it("refuses decimals for a piece measure, 0, a service, an inactive branch and an inactive subtype", async () => {
    const item = await goods();
    expect(await setMinimum(item.variantId, "1.5")).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { minQty: "errors.field.wholeOnly" } },
    });
    expect(await setMinimum(item.variantId, "0")).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { minQty: "errors.field.tooSmall" } },
    });
    const kilos = await goods(true);
    expect(await setMinimum(kilos.variantId, "1.5")).toMatchObject({ ok: true });

    const unit = await insertUnit();
    const service = await insertProduct({ unitId: unit.id, type: "SERVICE" });
    expect(await setMinimum(service.defaultVariantId, "1")).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { variantId: "errors.field.notAllowed" } },
    });

    const closed = await insertBranch({ isActive: false });
    expect(await setMinimum(item.variantId, "1", head, closed.id)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { branchId: "errors.field.branchInactive" } },
    });

    const product = await insertProduct({ unitId: unit.id });
    const subtypes = await insertSubtypes(product.id, [{}, { isActive: false }]);
    expect(await setMinimum(subtypes[1]!, "1")).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { variantId: "errors.field.inactive" } },
    });
    expect(await minimumRow(item.variantId)).toBeNull();
  });

  it("clearing is allowed on a subtype deactivated since (decided item 5)", async () => {
    const item = await goods();
    await receive(branch.id, item.variantId, "4", 1000n, head);
    await setMinimum(item.variantId, "2");
    await db.execute(
      sql`update product_variants set is_active = false where id = ${item.variantId}`,
    );
    expect(await setMinimum(item.variantId, "")).toMatchObject({ ok: true });
    expect(await minimumRow(item.variantId)).toEqual({ min_qty: null, notified: false });
  });

  it("a minimum is a use of the product; a cleared one before any other use is not (04 Catalogs table)", async () => {
    const item = await goods();
    expect(await setMinimum(item.variantId, "2")).toMatchObject({ ok: true });
    expect(await db.transaction((tx) => productInUse(tx, item.productId))).toBe(true);

    const fresh = await goods();
    await db.execute(sql`
      insert into stock_minimums (branch_id, variant_id, min_qty, created_at, updated_at)
      values (${branch.id}, ${fresh.variantId}, null, ${AT}, ${AT})`);
    expect(await db.transaction((tx) => productInUse(tx, fresh.productId))).toBe(false);
  });
});
