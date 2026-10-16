import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { orderDraftAdds, orders } from "@/server/db/schema";

import { insertBranch } from "../../../../tests/helpers/branches";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints of migration 0020_order_draft_adds (plan of 2.5a, Database changes; decided
// items 3 and 14, Look first; review of the plan, correction 2). Each forbidden write goes
// straight to the table with nothing in front (D39) beside the write that passes (D40). Spec:
// 05-order-request-form.md, Drafts 2; developer-rules.md rules 5, 8, 9, 11.

const AT = "2031-04-11T05:00:00Z";
const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN = "23503";

let branchId: string;
let ownerId: string;

beforeAll(async () => {
  branchId = (await insertBranch()).id;
  ownerId = (await insertUser("MANAGER", { branches: [branchId] })).id;
});

type AddRow = {
  clientKey?: string;
  orderId?: string;
  addedQty?: string;
  qtyAfter?: string;
  versionAfter?: number;
  totalAfter?: bigint | null;
  userId?: string;
};

async function add(row: AddRow = {}) {
  const orderId = row.orderId ?? (await insertOrder({ branchId, ownerId })).id;
  return db
    .insert(orderDraftAdds)
    .values({
      clientKey: row.clientKey ?? randomUUID(),
      orderId,
      addedQty: row.addedQty ?? "10",
      qtyAfter: row.qtyAfter ?? "20",
      versionAfter: row.versionAfter ?? 2,
      totalAfter: row.totalAfter === undefined ? 100_000n : row.totalAfter,
      userId: row.userId ?? ownerId,
      createdAt: new Date(AT),
    })
    .returning({ id: orderDraftAdds.id, orderId: orderDraftAdds.orderId });
}

describe("order_draft_adds (05 Drafts 2; developer-rules rules 5 and 8)", () => {
  it("a client key is held once (rule 8): a duplicate is refused, another key passes", async () => {
    const key = randomUUID();
    await add({ clientKey: key });
    expect(await refusalOf(add({ clientKey: key }))).toMatchObject({
      code: UNIQUE,
      constraint: "order_draft_adds_client_key_key",
    });
    await add({ clientKey: randomUUID() });
  });

  it("the quantity added is more than 0: 0 is refused, 0.001 passes", async () => {
    expect(await refusalOf(add({ addedQty: "0" }))).toMatchObject({
      code: CHECK,
      constraint: "order_draft_adds_added_qty_check",
    });
    await add({ addedQty: "0.001" });
  });

  it("the quantity after is more than 0: 0 is refused", async () => {
    expect(await refusalOf(add({ qtyAfter: "0" }))).toMatchObject({
      code: CHECK,
      constraint: "order_draft_adds_qty_after_check",
    });
    await add({ qtyAfter: "0.001" });
  });

  it("the version after is more than 0 (rule 9): 0 is refused, 1 passes", async () => {
    expect(await refusalOf(add({ versionAfter: 0 }))).toMatchObject({
      code: CHECK,
      constraint: "order_draft_adds_version_after_check",
    });
    await add({ versionAfter: 1 });
  });

  it("the total after is whole so'm of 0 or more, or none while the draft has no price (review of 2.5a, S2)", async () => {
    expect(await refusalOf(add({ totalAfter: -1n }))).toMatchObject({
      code: CHECK,
      constraint: "order_draft_adds_total_after_check",
    });
    await add({ totalAfter: 0n });
    await add({ totalAfter: null });
  });

  it("an unknown order or an unknown user is refused (a foreign key on every relation)", async () => {
    expect(await refusalOf(add({ orderId: randomUUID() }))).toMatchObject({
      code: FOREIGN,
      constraint: "order_draft_adds_order_id_orders_id_fk",
    });
    expect(await refusalOf(add({ userId: randomUUID() }))).toMatchObject({
      code: FOREIGN,
      constraint: "order_draft_adds_user_id_users_id_fk",
    });
  });

  it("a deleted never-submitted draft takes its add rows with it (rule 11; decided item 14)", async () => {
    const draft = await insertOrder({ branchId, ownerId });
    const kept = await insertOrder({ branchId, ownerId });
    await add({ orderId: draft.id });
    await add({ orderId: kept.id });
    await db.delete(orders).where(eq(orders.id, draft.id));
    const left = await db.execute<{ order_id: string }>(
      sql`select order_id from order_draft_adds where order_id in (${draft.id}, ${kept.id})`,
    );
    expect(left.rows.map((row) => row.order_id)).toEqual([kept.id]);
  });
});
