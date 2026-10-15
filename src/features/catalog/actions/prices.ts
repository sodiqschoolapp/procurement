import { eq } from "drizzle-orm";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import { GLOBAL_TARGET, defineAction } from "@/server/action";
import { priceHistory, productVariants, products } from "@/server/db/schema";

import { priceNoteField, requiredPriceField } from "./catalog-fields";
import { recordPriceAdd, setHeadPrice } from "./price-rows";

// A new reference price (04-catalogs.md rule 4: "When a price changes, the Head adds the new price
// with a short note, and older prices stay in the price history"; A14: one price per subtype for
// the whole school; build-plan 1.9). Under "Add a new price for a product": price.add, Head only,
// global, no branch and no Manager right (03 Permission matrix; plan of 1.9, decision 4, Look
// first). One transaction: the subtype locked FOR UPDATE, its `reference_price`, a HEAD row of
// `price_history`, and the audit row `price.add` (04 rule 9; developer-rules rules 3 and 13).
// - Any subtype, the hidden default too: that is how a product without subtypes gets a new price
//   (04 rule 1; decision 5, Look first).
// - The same price again, and a price for an inactive subtype or product, are recorded too
//   (decision 7, Look first). Two prices at once are both kept in order under the lock; the later
//   one is current (decision 11).
// - The same client key twice gives the first result (developer-rules rule 8): the maker is the
//   row's `set_by`.

export type AddedPrice = {
  historyId: string;
  variantId: string;
  referencePrice: bigint;
  note: string;
};

export const addPrice = defineAction({
  name: "addPrice",
  permission: "price.add",
  input: z.object({
    clientKey: z.string().refine(isClientKey),
    variantId: z.uuid(),
    price: requiredPriceField,
    note: priceNoteField,
  }),
  async target() {
    return GLOBAL_TARGET;
  },
  repeat: {
    clientKey: (input) => input.clientKey,
    async find(tx, clientKey) {
      const [row] = await tx
        .select({
          historyId: priceHistory.id,
          variantId: priceHistory.variantId,
          referencePrice: priceHistory.price,
          note: priceHistory.note,
          userId: priceHistory.setBy,
        })
        .from(priceHistory)
        .where(eq(priceHistory.clientKey, clientKey));
      if (!row) return null;
      const { userId, note, ...result } = row;
      return {
        result: { ...result, note: note ?? "" } satisfies AddedPrice,
        userId,
        branchId: null,
      };
    },
  },
  async lock({ tx, input }) {
    const [row] = await tx
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        referencePrice: productVariants.referencePrice,
      })
      .from(productVariants)
      .where(eq(productVariants.id, input.variantId))
      .for("update");
    return row ? { target: GLOBAL_TARGET, rows: row } : null;
  },
  async write({ tx, input, userId }): Promise<AddedPrice> {
    const written = await setHeadPrice(tx, userId, {
      variantId: input.variantId,
      price: input.price,
      note: input.note,
      clientKey: input.clientKey,
    });
    return {
      historyId: written.id,
      variantId: input.variantId,
      referencePrice: input.price,
      note: input.note,
    };
  },
  async history({ tx, userId, locked }, added) {
    const current = locked!.rows;
    const [product] = await tx
      .select({ name: products.name })
      .from(products)
      .where(eq(products.id, current.productId));
    await recordPriceAdd(tx, userId, {
      variantId: added.variantId,
      productId: current.productId,
      product: product?.name ?? null,
      before: current.referencePrice,
      price: added.referencePrice,
      note: added.note,
    });
  },
});
