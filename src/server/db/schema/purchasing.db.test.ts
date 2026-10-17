import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertFileRow, insertProduct } from "../../../../tests/helpers/catalog";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertExtraCostType, insertOrder } from "../../../../tests/helpers/orders";
import { insertPurchase, insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints, keys and triggers of migration 0024_purchases (build plan 3.2; plan of 3.2,
// Tests). Each forbidden write goes straight to the table with nothing in front (D39) and stands
// beside the write the guard lets through (D40). Spec: 14-data-model.md (Purchasing and money);
// 07-purchasing.md (Purchase record; One trip, many orders; Fixing a mistake); developer-rules.md
// rules 5, 7 and 8; docs/decisions.md, Decided ahead, question 3.

const AT = "2031-05-02T05:00:00Z";
const CHECK = "23514";
const FOREIGN_KEY = "23503";
const UNIQUE = "23505";

let branchId: string;
let otherBranchId: string;
let userId: string;

beforeAll(async () => {
  branchId = (await insertBranch()).id;
  otherBranchId = (await insertBranch()).id;
  userId = (await insertUser("HEAD")).id;
});

function update(table: string, set: string, id: string) {
  return db.execute(sql.raw(`update "${table}" set ${set} where id = '${id}'`));
}

function cancel(id: string, reason = "Xato kiritildi") {
  return db.execute(sql`update purchases set is_cancelled = true, cancel_reason = ${reason},
      cancelled_by = ${userId}, cancelled_at = ${AT} where id = ${id}`);
}

function insertExtra(purchaseId: string, extraCostTypeId: string, amount: string) {
  return db.execute<{ id: string }>(sql`
    insert into purchase_extras (purchase_id, extra_cost_type_id, amount, payment_type, created_at)
    values (${purchaseId}, ${extraCostTypeId}, ${amount}, 'CASH', ${AT}) returning id`);
}

function insertTripFile(tripId: string, fileId: string) {
  return db.execute(sql`insert into trip_files (trip_id, file_id, created_at)
    values (${tripId}, ${fileId}, ${AT})`);
}

function insertMovement(row: { purchaseId: string; branchId: string; variantId: string }) {
  // RECEIPT of 1 at 100: every other CHECK of stock_movements passes, so only the key can refuse.
  return db.execute(sql`
    insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost, balance_after,
      purchase_id, created_by, created_at)
    values (${row.branchId}, ${row.variantId}, 'RECEIPT', '1', '100', '1', ${row.purchaseId},
      ${userId}, ${AT})`);
}

describe("purchases CHECKs (developer-rules rule 5; 07 Purchase record)", () => {
  it("purchases_qty_check refuses 0 and −1; 0.001 passes", async () => {
    const p = await insertPurchase(branchId, userId);
    const constraint = { code: CHECK, constraint: "purchases_qty_check" };
    for (const qty of ["0", "-1"]) {
      expect(
        await refusalOf(insertPurchaseRow({ ...p, branchId, createdBy: userId, qty })),
      ).toMatchObject(constraint);
    }
    await insertPurchaseRow({ ...p, branchId, createdBy: userId, qty: "0.001" });
    // No UPDATE of qty can reach the CHECK: purchases_cancel_only refuses it first (tested below).
  });

  it("purchases_unit_price_check refuses −1; 0, a gift, passes (07 Purchase record)", async () => {
    const p = await insertPurchase(branchId, userId);
    expect(
      await refusalOf(insertPurchaseRow({ ...p, branchId, createdBy: userId, unitPrice: "-1" })),
    ).toMatchObject({ code: CHECK, constraint: "purchases_unit_price_check" });
    await insertPurchaseRow({
      ...p,
      branchId,
      createdBy: userId,
      unitPrice: "0",
      comment: "Sovg'a",
    });
  });

  it("purchases_comment_check refuses 1 001 characters; 1 000 pass", async () => {
    const p = await insertPurchase(branchId, userId);
    expect(
      await refusalOf(
        insertPurchaseRow({ ...p, branchId, createdBy: userId, comment: "a".repeat(1001) }),
      ),
    ).toMatchObject({ code: CHECK, constraint: "purchases_comment_check" });
    await insertPurchaseRow({ ...p, branchId, createdBy: userId, comment: "a".repeat(1000) });
  });

  it("purchases_cancel_check: the cancel fields are all empty, or all filled with a reason", async () => {
    const p = await insertPurchase(branchId, userId);
    const constraint = { code: CHECK, constraint: "purchases_cancel_check" };
    const half = [
      `cancel_reason = 'Xato'`,
      `is_cancelled = true, cancel_reason = 'Xato', cancelled_by = '${userId}'`,
      `is_cancelled = true, cancelled_by = '${userId}', cancelled_at = '${AT}'`,
      `is_cancelled = true, cancel_reason = '   ', cancelled_by = '${userId}', cancelled_at = '${AT}'`,
    ];
    for (const set of half) {
      // The CHECK is reached on insert, where no trigger stands in front.
      const values = set.split(", ").map((pair) => pair.split(" = ") as [string, string]);
      const columns = values.map(([column]) => column).join(", ");
      const given = values.map(([, value]) => value).join(", ");
      expect(
        await refusalOf(
          db.execute(
            sql.raw(`insert into purchases (trip_id, order_id, branch_id, variant_id, qty,
              unit_price, created_by, created_at, ${columns})
            values ('${p.tripId}', '${p.orderId}', '${branchId}', '${p.variantId}', 1, 5000,
              '${userId}', '${AT}', ${given})`),
          ),
        ),
      ).toMatchObject(constraint);
      // On update: the trigger lets a false → true change through, and the CHECK then refuses it.
      if (set.startsWith("is_cancelled")) {
        expect(await refusalOf(update("purchases", set, p.id))).toMatchObject(constraint);
      }
    }
    await cancel(p.id);
  });
});

describe("the branch of a purchase (plan of 3.2, decided item 1, Look first; CLAUDE.md goal 2)", () => {
  it("a record whose order is of another branch than its trip is refused", async () => {
    const tripId = (await insertTrip(branchId, userId)).rows[0]!.id;
    const own = await insertOrder({ branchId, ownerId: userId, status: "PURCHASING" });
    const other = await insertOrder({
      branchId: otherBranchId,
      ownerId: userId,
      status: "PURCHASING",
    });
    const row = { tripId, branchId, createdBy: userId };
    // The record names the trip's branch: the order's key (id, branch) does not exist.
    expect(
      await refusalOf(insertPurchaseRow({ ...row, orderId: other.id, variantId: other.variantId })),
    ).toMatchObject({ code: FOREIGN_KEY, constraint: "purchases_order_branch_fk" });
    // The record names the order's branch: the trip's key (id, branch) does not exist.
    expect(
      await refusalOf(
        insertPurchaseRow({
          ...row,
          branchId: otherBranchId,
          orderId: other.id,
          variantId: other.variantId,
        }),
      ),
    ).toMatchObject({ code: FOREIGN_KEY, constraint: "purchases_trip_branch_fk" });
    await insertPurchaseRow({ ...row, orderId: own.id, variantId: own.variantId });
  });
});

describe("the keys of stock_movements and price_history (developer-rules rule 5)", () => {
  it("a movement of another branch or another subtype than its purchase is refused", async () => {
    const p = await insertPurchase(branchId, userId);
    const constraint = { code: FOREIGN_KEY, constraint: "stock_movements_purchase_fk" };
    const otherVariant = (await insertProduct()).defaultVariantId;
    expect(
      await refusalOf(
        insertMovement({ purchaseId: p.id, branchId: otherBranchId, variantId: p.variantId }),
      ),
    ).toMatchObject(constraint);
    expect(
      await refusalOf(insertMovement({ purchaseId: p.id, branchId, variantId: otherVariant })),
    ).toMatchObject(constraint);
    expect(
      await refusalOf(
        insertMovement({ purchaseId: randomUUID(), branchId, variantId: p.variantId }),
      ),
    ).toMatchObject(constraint);
    await insertMovement({ purchaseId: p.id, branchId, variantId: p.variantId });
  });

  it("a PURCHASE price row naming no real purchase is refused; a real one passes", async () => {
    const p = await insertPurchase(branchId, userId);
    const write = (purchaseId: string) =>
      db.execute(sql`insert into price_history (variant_id, price, source, set_by, purchase_id,
          created_at)
        values (${p.variantId}, 5000, 'PURCHASE', ${userId}, ${purchaseId}, ${AT})`);
    expect(await refusalOf(write(randomUUID()))).toMatchObject({
      code: FOREIGN_KEY,
      constraint: "price_history_purchase_id_purchases_id_fk",
    });
    await write(p.id);
  });
});

describe("safe repeats and one holder per file (developer-rules rule 8; 0.12 file contract)", () => {
  it("purchase_trips.client_key twice is refused; another key passes", async () => {
    const key = randomUUID();
    await insertTrip(branchId, userId, key);
    expect(await refusalOf(insertTrip(branchId, userId, key))).toMatchObject({
      code: UNIQUE,
      constraint: "purchase_trips_client_key_key",
    });
    await insertTrip(branchId, userId);
  });

  it("the same file on a second trip is refused; another file on it passes", async () => {
    const first = (await insertTrip(branchId, userId)).rows[0]!.id;
    const second = (await insertTrip(otherBranchId, userId)).rows[0]!.id;
    const file = (await insertFileRow(userId)).id;
    await insertTripFile(first, file);
    expect(await refusalOf(insertTripFile(second, file))).toMatchObject({
      code: UNIQUE,
      constraint: "trip_files_file_id_key",
    });
    await insertTripFile(second, (await insertFileRow(userId)).id);
  });
});

describe("purchase_extras_amount_check (developer-rules, Constraints the spec names)", () => {
  it("refuses 0 and −1; 1 passes", async () => {
    const p = await insertPurchase(branchId, userId);
    const type = (await insertExtraCostType()).id;
    for (const amount of ["0", "-1"]) {
      expect(await refusalOf(insertExtra(p.id, type, amount))).toMatchObject({
        code: CHECK,
        constraint: "purchase_extras_amount_check",
      });
    }
    await insertExtra(p.id, type, "1");
  });
});

describe("a record changes only by its one cancel (Decided ahead, question 3)", () => {
  const ONLY = { code: CHECK, constraint: "purchases_cancel_only" };

  it("false → true with the three fields passes, and nothing else changes", async () => {
    const p = await insertPurchase(branchId, userId);
    await cancel(p.id);
    const row = await db.execute(
      sql`select is_cancelled, cancel_reason, qty, unit_price from purchases where id = ${p.id}`,
    );
    expect(row.rows).toEqual([
      { is_cancelled: true, cancel_reason: "Xato kiritildi", qty: "1.000", unit_price: "5000" },
    ]);
  });

  it("a second cancel and an un-cancel are refused", async () => {
    const p = await insertPurchase(branchId, userId);
    await cancel(p.id);
    expect(await refusalOf(cancel(p.id, "Yana"))).toMatchObject(ONLY);
    expect(
      await refusalOf(
        update(
          "purchases",
          "is_cancelled = false, cancel_reason = null, cancelled_by = null, cancelled_at = null",
          p.id,
        ),
      ),
    ).toMatchObject(ONLY);
  });

  it("a change of any other column is refused, alone and together with the cancel", async () => {
    const p = await insertPurchase(branchId, userId);
    const other = await insertProduct();
    const changes = [
      `qty = 2`,
      `unit_price = 4000`,
      `comment = 'Boshqa'`,
      `give_to_requester = true`,
      `variant_id = '${other.defaultVariantId}'`,
      `created_at = '2031-05-03T05:00:00Z'`,
    ];
    for (const change of changes) {
      expect(await refusalOf(update("purchases", change, p.id))).toMatchObject(ONLY);
      expect(
        await refusalOf(
          update(
            "purchases",
            `${change}, is_cancelled = true, cancel_reason = 'Xato', cancelled_by = '${userId}', cancelled_at = '${AT}'`,
            p.id,
          ),
        ),
      ).toMatchObject(ONLY);
    }
    // Beside them, the plain cancel passes.
    await cancel(p.id);
  });

  it("DELETE and TRUNCATE are refused", async () => {
    const p = await insertPurchase(branchId, userId);
    expect(
      await refusalOf(db.execute(sql`delete from purchases where id = ${p.id}`)),
    ).toMatchObject(ONLY);
    expect(await refusalOf(db.execute(sql`truncate purchases cascade`))).toMatchObject(ONLY);
  });
});

describe("a trip, its extras and its files are append-only (developer-rules rule 7)", () => {
  it("UPDATE, DELETE and TRUNCATE are refused on each", async () => {
    const p = await insertPurchase(branchId, userId);
    const extra = (await insertExtra(p.id, (await insertExtraCostType()).id, "1000")).rows[0]!.id;
    const file = (await insertFileRow(userId)).id;
    await insertTripFile(p.tripId, file);
    const cases = [
      {
        table: "purchase_trips",
        update: sql`update purchase_trips set purchased_on = '2031-05-01' where id = ${p.tripId}`,
        remove: sql`delete from purchase_trips where id = ${p.tripId}`,
      },
      {
        table: "purchase_extras",
        update: sql`update purchase_extras set amount = 2000 where id = ${extra}`,
        remove: sql`delete from purchase_extras where id = ${extra}`,
      },
      {
        table: "trip_files",
        update: sql`update trip_files set created_at = ${AT} where file_id = ${file}`,
        remove: sql`delete from trip_files where file_id = ${file}`,
      },
    ];
    for (const { table, update: change, remove } of cases) {
      const refused = { code: CHECK, constraint: `${table}_append_only` };
      expect(await refusalOf(db.execute(change))).toMatchObject(refused);
      expect(await refusalOf(db.execute(remove))).toMatchObject(refused);
      expect(await refusalOf(db.execute(sql.raw(`truncate "${table}" cascade`)))).toMatchObject(
        refused,
      );
    }
  });
});

describe("the date, supplier and payment type are the trip's (14: never copied)", () => {
  it("purchases has no such column", async () => {
    const columns = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns where table_name = 'purchases'`);
    const names = columns.rows.map((row) => row.column_name);
    expect(names).toContain("trip_id");
    for (const copied of ["purchased_on", "supplier_id", "payment_type"]) {
      expect(names).not.toContain(copied);
    }
  });
});
