import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { refreshAnalytics } from "@/server/jobs/analytics-refresh";

import { insertBranch } from "./branches";
import { insertCategory, insertCompany, insertProduct } from "./catalog";
import { insertDepartment, insertExtraCostType, insertOrder } from "./orders";
import { insertUser } from "./users";

// Purchase records written straight into the tables for the analytics tests (build-plan 6.3), and
// the refresh the scheduler runs every 5 minutes, run here at once.

const AT = "2031-05-02T05:00:00Z";

/** A branch with its Manager, Principal and Finance user, a department, a category and a supplier. */
export async function spendingScene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  const department = await insertDepartment(branch.id);
  const category = await insertCategory();
  const supplier = await insertCompany();
  return { branch, manager, principal, finance, department, category, supplier };
}

export type SpendingScene = Awaited<ReturnType<typeof spendingScene>>;

export type Bought = {
  purchasedOn: string;
  qty?: string;
  unitPrice?: string;
  extras?: readonly bigint[];
  cancelled?: boolean;
  /** Defaults: the scene's own. */
  categoryId?: string;
  departmentId?: string;
  supplierId?: string | null;
  ownerId?: string;
};

/** One Open order of the scene's branch with one record on its own trip. Returns the record. */
export async function bought(scene: SpendingScene, row: Bought) {
  const product = await insertProduct({ categoryId: row.categoryId ?? scene.category.id });
  const ownerId = row.ownerId ?? scene.manager.id;
  const order = await insertOrder({
    branchId: scene.branch.id,
    ownerId,
    departmentId: row.departmentId ?? scene.department.id,
    variantId: product.defaultVariantId,
    status: "PURCHASING",
  });
  const supplierId = row.supplierId === undefined ? scene.supplier.id : row.supplierId;
  const trip = await db.execute<{ id: string }>(sql`
    insert into purchase_trips (client_key, branch_id, purchased_on, supplier_id, payment_type,
      created_by, created_at)
    values (${randomUUID()}, ${scene.branch.id}, ${row.purchasedOn}, ${supplierId}, 'CASH',
      ${ownerId}, ${AT})
    returning id`);
  const purchase = await db.execute<{ id: string }>(sql`
    insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price, created_by,
      created_at)
    values (${trip.rows[0]!.id}, ${order.id}, ${scene.branch.id}, ${product.defaultVariantId},
      ${row.qty ?? "1.000"}, ${row.unitPrice ?? "10000"}, ${ownerId}, ${AT})
    returning id`);
  const purchaseId = purchase.rows[0]!.id;
  for (const amount of row.extras ?? []) {
    const type = await insertExtraCostType();
    await db.execute(sql`
      insert into purchase_extras (purchase_id, extra_cost_type_id, amount, payment_type,
        created_at)
      values (${purchaseId}, ${type.id}, ${amount}, 'CASH', ${AT})`);
  }
  if (row.cancelled) {
    await db.execute(sql`update purchases set is_cancelled = true, cancel_reason = 'Xato kiritildi',
      cancelled_by = ${ownerId}, cancelled_at = ${AT} where id = ${purchaseId}`);
  }
  return { purchaseId, orderId: order.id, number: order.number, productId: product.id };
}

/** The refresh of the scheduler job, in a transaction of its own. */
export function refreshNow() {
  return db.transaction((tx) => refreshAnalytics(tx));
}
