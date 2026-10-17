import { inArray, sql } from "drizzle-orm";
import { beforeEach, expect, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import { businessDate } from "@/domain/business-date";
import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import {
  orders,
  priceHistory,
  productVariants,
  purchaseExtras,
  purchaseTrips,
  purchases,
  stockBalances,
  stockMovements,
  tripFiles,
} from "@/server/db/schema";

import { type TickedResult, describeTickedWall } from "../../../../tests/helpers/ticked-wall";
import type { InsertedUser } from "../../../../tests/helpers/users";

// Record purchase on ticked orders of two branches, through the page's own export (build plan 3.4;
// progress 2.15, "For 3.x": every action on ticked orders goes through describeTickedWall();
// 03-roles-and-permissions.md rules 1 and 8; 07-purchasing.md, One trip, many orders: "a trip
// covers orders of one branch and one owner"). Where the matrix lets both orders through (the
// Head), the trip is refused whole as one branch by its own rule (plan of 3.4, decided item 14).
// A refusal leaves every purchasing table as it was (review of the plan, correction 2).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { recordPurchaseAction } = await import("@/app/(app)/orders/[id]/purchase/actions");

beforeEach(() => {
  store.user = null;
});

function signedIn(user: InsertedUser): void {
  store.user = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    locale: "uz",
    sessionToken: "invented-token",
  } as CurrentUser;
}

function wall(result: ActionResult<unknown>): TickedResult {
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Every purchasing row a trip writes, counted, and every subtype's last purchase price. */
async function purchasing() {
  const counted: Record<string, number> = {};
  for (const [name, table] of Object.entries({
    purchaseTrips,
    purchases,
    purchaseExtras,
    tripFiles,
    stockMovements,
    stockBalances,
  })) {
    counted[name] = await db.$count(table);
  }
  counted.priceRows = await db.$count(priceHistory, sql`${priceHistory.source} = 'PURCHASE'`);
  const lastPrices = await db
    .select({ id: productVariants.id, price: productVariants.lastPurchasePrice })
    .from(productVariants)
    .orderBy(productVariants.id);
  return { counted, lastPrices };
}

describeTickedWall("recordPurchaseAction", {
  permission: "purchase.record",
  status: "PURCHASING",
  owned: true,
  order: { approvedAt: new Date("2020-01-02T07:00:00Z") },
  oneBranch: { code: "invalid_input", fields: { orders: "errors.field.tripOneOwner" } },
  unchanged: purchasing,
  async run(user, ticked) {
    signedIn(user);
    return wall(
      await recordPurchaseAction({
        clientKey: newClientKey(),
        orders: ticked.map(({ id, version }) => ({ id, version })),
        purchasedOn: businessDate(now()),
        paymentType: "CASH",
        supplierId: null,
        receiptFileIds: [],
        lines: ticked.map(({ id }) => ({
          orderId: id,
          qty: "10",
          unitPrice: "5000",
          extras: [],
          comment: null,
        })),
      }),
    );
  },
  async saved(_user, ticked) {
    const rows = await db
      .select({ orderId: purchases.orderId, tripId: purchases.tripId })
      .from(purchases)
      .where(
        inArray(
          purchases.orderId,
          ticked.map(({ id }) => id),
        ),
      );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.tripId)).size).toBe(1);
    const versions = await db
      .select({ version: orders.version })
      .from(orders)
      .where(
        inArray(
          orders.id,
          ticked.map(({ id }) => id),
        ),
      );
    expect(versions).toEqual([{ version: 2 }, { version: 2 }]);
  },
});
