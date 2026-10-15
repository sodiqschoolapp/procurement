import { eq } from "drizzle-orm";

import { SUBTYPES } from "@/domain/catalogs";
import { audit } from "@/server/audit";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { priceHistory, productVariants } from "@/server/db/schema";

// The one writer of a HEAD row of the price history (14-data-model.md, price_history: "one row
// each time the Head sets a price"; 04-catalogs.md rule 4; plan of 1.9, decision 1, Look first).
// Called inside the action's transaction by every write that sets a subtype's reference price:
// a product's default on create, a new subtype, the first subtype taking a price, and a new price
// with a note. The deferred check `price_recorded` of migration 0014 refuses, at commit, a price
// set without its row.
//
// A new price with a note is set by setHeadPrice() and its audit row written by recordPriceAdd(),
// both used by addPrice and by the Excel import of prices, so the form and the file set a price
// the same way (plan of 1.11, decision 1, Look first). Only catalog actions import them (the fence
// test of imports.db.test.ts).

export async function recordHeadPrice(
  tx: Executor,
  row: {
    variantId: string;
    price: bigint;
    setBy: string;
    note?: string | null;
    clientKey?: string | null;
  },
) {
  const [written] = await tx
    .insert(priceHistory)
    .values({
      variantId: row.variantId,
      price: row.price,
      source: "HEAD",
      note: row.note ?? null,
      setBy: row.setBy,
      clientKey: row.clientKey ?? null,
      createdAt: now(),
    })
    .returning({ id: priceHistory.id, createdAt: priceHistory.createdAt });
  return written!;
}

/**
 * A new reference price with its note, on a subtype the caller holds FOR UPDATE: the subtype's
 * `reference_price` and its HEAD row (04 rule 4).
 */
export async function setHeadPrice(
  tx: Executor,
  userId: string,
  price: { variantId: string; price: bigint; note: string; clientKey: string | null },
) {
  await tx
    .update(productVariants)
    .set({ referencePrice: price.price })
    .where(eq(productVariants.id, price.variantId));
  return recordHeadPrice(tx, {
    variantId: price.variantId,
    price: price.price,
    setBy: userId,
    note: price.note,
    clientKey: price.clientKey,
  });
}

/**
 * The audit row `price.add` of a new price (04 rule 9): the product's id and name, the price
 * before as the locked row held it, and the new price with its note. Runs no query but its insert.
 */
export async function recordPriceAdd(
  tx: Executor,
  userId: string,
  added: {
    variantId: string;
    productId: string;
    product: string | null;
    before: bigint | null;
    price: bigint;
    note: string;
  },
) {
  const parent = { productId: added.productId, product: added.product };
  await audit(
    { tx, userId },
    {
      action: "price.add",
      entity: SUBTYPES.entity,
      entityId: added.variantId,
      before: { ...parent, referencePrice: added.before },
      after: { ...parent, referencePrice: added.price, note: added.note },
      at: now(),
    },
  );
}
