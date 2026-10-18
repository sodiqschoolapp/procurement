import { and, eq } from "drizzle-orm";
import * as z from "zod";

import { plainQuantity } from "@/domain/drafts";
import { isLow } from "@/domain/stock";
import { directEntryLineRefusal } from "@/domain/stock-documents";
import { ActionError, defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { now } from "@/server/clock";
import { branches, productVariants, products, stockMinimums, units } from "@/server/db/schema";
import { holdBalance } from "@/server/stock-ledger";
import { checkMinimum } from "@/server/stock-minimums";

// Set or clear the minimum of a subtype in a branch (04-catalogs.md rule 5: "The Head, or a
// Manager for their own branches, can set a minimum level per subtype per branch"; 09-warehouse.md,
// Low stock; 03-roles-and-permissions.md, Manager rights: SET_MINIMUMS; plan of 5.10). Under
// `stock.set_minimums` on the branch (decided item 5, Look first). Not a create: the same value
// sent twice is the same state, so no client key and no version; two at once queue on the locks
// and the later value stays (decided item 7).
//
//   lock   the product FOR SHARE, then the balance row FOR UPDATE, made at 0 when a minimum is
//          typed for an item never held (holdBalance(); review of the plan, must fix 1), then the
//          minimum row FOR UPDATE: the ledger's order (decided item 11)
//   check  a typed minimum: the branch active, an active subtype of an active product of goods,
//          the quantity by its measure and above 0 (directEntryLineRefusal(), the same subtype
//          and quantity rules as a direct entry's line). Clearing is allowed whatever the status
//          (decided item 5: a deactivated subtype's stock can still be issued and notify).
//   write  the minimum, then checkMinimum(): a minimum that leaves the item Low sends the notice
//          once; one that does not clears the mark (decided item 2, Look first)
//   history the `stock_minimum.set` audit row, before and after (CLAUDE.md, Conventions)

export type StockMinimumResult = {
  /** numeric(14,3) text as stored, or null for no minimum. */
  minimum: string | null;
  low: boolean;
};

type Held = {
  branchActive: boolean;
  isActive: boolean;
  productActive: boolean;
  type: "GOODS" | "SERVICE";
  allowsDecimals: boolean;
  qty: string | null;
  minimum: string | null;
};

const input = z.object({
  branchId: z.uuid(),
  variantId: z.uuid(),
  /** Empty: no minimum. */
  minQty: z.string().trim().max(40),
});

export const setStockMinimum = defineAction({
  name: "setStockMinimum",
  permission: "stock.set_minimums",
  input,
  // The minimum's key is its branch: read from the database, "Not found" when it is not there.
  async target({ tx, input: typed }) {
    const [branch] = await tx
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.id, typed.branchId));
    return branch ? { branchId: branch.id } : null;
  },
  async lock({ tx, input: typed }) {
    const [subtype] = await tx
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(eq(productVariants.id, typed.variantId));
    if (!subtype) return null;
    // A subtype's product never changes, so it is read without a lock before the product is locked.
    await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, subtype.productId))
      .for("share");
    const [row] = await tx
      .select({
        branchActive: branches.isActive,
        isActive: productVariants.isActive,
        productActive: products.isActive,
        type: products.type,
        allowsDecimals: units.allowDecimal,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .innerJoin(branches, eq(branches.id, typed.branchId))
      .where(eq(productVariants.id, typed.variantId))
      .for("share", { of: productVariants });
    const key = { branchId: typed.branchId, variantId: typed.variantId };
    // A service is refused before a balance row could be made for it.
    const typedMinimum = typed.minQty !== "" && row!.type === "GOODS";
    const balance = typedMinimum ? await holdBalance(tx, key) : null;
    const [minimum] = await tx
      .select({ minQty: stockMinimums.minQty })
      .from(stockMinimums)
      .where(
        and(
          eq(stockMinimums.branchId, typed.branchId),
          eq(stockMinimums.variantId, typed.variantId),
        ),
      )
      .for("update");
    return {
      target: { branchId: typed.branchId },
      rows: {
        ...row!,
        qty: balance?.qty ?? null,
        minimum: minimum?.minQty ?? null,
      } satisfies Held,
    };
  },
  check({ input: typed, locked }) {
    if (typed.minQty === "") return;
    const held = locked!.rows;
    if (!held.branchActive) {
      throw new ActionError("invalid_input", { branchId: "errors.field.branchInactive" });
    }
    const refusal = directEntryLineRefusal(held, typed.minQty);
    if (refusal) {
      const field = refusal.field === "qty" ? "minQty" : "variantId";
      throw new ActionError("invalid_input", { [field]: `errors.field.${refusal.kind}` });
    }
  },
  async write({ tx, input: typed, locked }): Promise<StockMinimumResult> {
    const held = locked!.rows;
    const minimum = typed.minQty === "" ? null : plainQuantity(typed.minQty);
    if (minimum === null && held.minimum === null) return { minimum: null, low: false };
    const moment = now();
    await tx
      .insert(stockMinimums)
      .values({
        branchId: typed.branchId,
        variantId: typed.variantId,
        minQty: minimum,
        createdAt: moment,
        updatedAt: moment,
      })
      .onConflictDoUpdate({
        target: [stockMinimums.branchId, stockMinimums.variantId],
        set: { minQty: minimum, updatedAt: moment },
      });
    const qty = held.qty ?? "0";
    await checkMinimum(tx, { branchId: typed.branchId, variantId: typed.variantId, qty });
    return { minimum, low: isLow(qty, minimum) };
  },
  async history({ tx, input: typed, userId, locked }, result) {
    const held = locked!.rows;
    if (result.minimum === null && held.minimum === null) return;
    await audit(
      { tx, userId },
      {
        action: "stock_minimum.set",
        entity: "stock_minimums",
        entityId: `${typed.branchId}:${typed.variantId}`,
        before: { branchId: typed.branchId, variantId: typed.variantId, minimum: held.minimum },
        after: { branchId: typed.branchId, variantId: typed.variantId, minimum: result.minimum },
        at: now(),
      },
    );
  },
});
