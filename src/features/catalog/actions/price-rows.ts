import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { priceHistory } from "@/server/db/schema";

// The one writer of a HEAD row of the price history (14-data-model.md, price_history: "one row
// each time the Head sets a price"; 04-catalogs.md rule 4; plan of 1.9, decision 1, Look first).
// Called inside the action's transaction by every write that sets a subtype's reference price:
// a product's default on create, a new subtype, the first subtype taking a price, and a new price
// with a note. The deferred check `price_recorded` of migration 0014 refuses, at commit, a price
// set without its row.

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
