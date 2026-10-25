import { eq } from "drizzle-orm";
import * as z from "zod";

import {
  type SuggestionOutcome,
  type SuggestionStatus,
  canDecide,
  isSuggestionNote,
  statusAfter,
  suggestionNote,
} from "@/domain/suggestions";
import { ActionError, GLOBAL_TARGET, defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { catalogSuggestions, products } from "@/server/db/schema";
import { notify } from "@/server/notify";

import type { SavedEntry } from "./catalog-entries";
import { type ProductFields, createProduct, insertProduct, recordProductCreate } from "./products";

// Product suggestions (04-catalogs.md rule 8: "Suggestions sent before 25 October 2026 are decided
// as before, and the Manager is notified either way; no new ones are sent"; 10, Notifications:
// "Product suggestion decided"; build-plan 1.12, 1.12b). Sending one ended with 1.12b: a Manager
// adds the item from an order's product search (manager-adds.ts; plan of 1.12b, decided item 3,
// Look first).
// - Adding and declining are catalog.manage, the Head only (decision 2): the suggestion row is
//   locked FOR UPDATE and must be PENDING, so a second decision is `wrong_status` (decision 9).
// - The add writes the product through the create's own body (insertProduct, recordProductCreate):
//   every rule of a product made by hand holds. The suggestion's photo passes to the product,
//   read from the locked row and never from the input (decision 3, Look first).
// - Every write keeps its audit row `suggestion.*` (CLAUDE.md, Conventions).

const ENTITY = "catalog_suggestions";

export type SuggestionResult = { id: string; branchId: string; name: string };

type LockedSuggestion = {
  id: string;
  branchId: string;
  suggestedBy: string;
  name: string;
  photoFileId: string | null;
  status: SuggestionStatus;
};

async function lockSuggestion(tx: Executor, id: string) {
  const [row] = await tx
    .select({
      id: catalogSuggestions.id,
      branchId: catalogSuggestions.branchId,
      suggestedBy: catalogSuggestions.suggestedBy,
      name: catalogSuggestions.name,
      photoFileId: catalogSuggestions.photoFileId,
      status: catalogSuggestions.status,
    })
    .from(catalogSuggestions)
    .where(eq(catalogSuggestions.id, id))
    .for("update");
  return row ? { target: GLOBAL_TARGET, rows: row as LockedSuggestion } : null;
}

/** A decision only on a pending suggestion (decision 9). */
function refuseDecided(suggestion: LockedSuggestion) {
  if (!canDecide(suggestion.status)) throw new ActionError("wrong_status");
}

async function tellSuggester(
  context: { tx: Executor; userId: string },
  suggestion: LockedSuggestion,
  outcome: SuggestionOutcome,
) {
  await notify(context, {
    to: [suggestion.suggestedBy],
    type: "PRODUCT_SUGGESTION_DECIDED",
    params: { name: suggestion.name, outcome },
    branchId: suggestion.branchId,
    link: `/suggestions/${suggestion.id}`,
    at: now(),
  });
}

/**
 * What the add gives back: the suggestion and the new product. `product` is there on the first
 * run only, for the history step; a repeat returns the ids.
 */
export type AddedSuggestion = {
  id: string;
  productId: string;
  product?: SavedEntry<ProductFields>;
};

/**
 * The input of the add: the create's own (client key and every product field, so the same checks
 * run) and the suggestion it comes from.
 */
const addInput = createProduct.input.extend({ suggestionId: z.uuid() });

export const addSuggestedProduct = defineAction({
  name: "addSuggestedProduct",
  permission: "catalog.manage",
  input: addInput,
  async target() {
    return GLOBAL_TARGET;
  },
  // The client key is the new product's: a second click finds the product and its suggestion.
  repeat: {
    clientKey: (input) => input.clientKey,
    async find(tx, clientKey) {
      const [row] = await tx
        .select({
          id: catalogSuggestions.id,
          productId: products.id,
          userId: catalogSuggestions.decidedBy,
        })
        .from(products)
        .innerJoin(catalogSuggestions, eq(catalogSuggestions.productId, products.id))
        .where(eq(products.clientKey, clientKey));
      if (!row?.userId || !row.productId) return null;
      const result: AddedSuggestion = { id: row.id, productId: row.productId };
      return { result, userId: row.userId, branchId: null };
    },
  },
  async lock({ tx, input }) {
    return lockSuggestion(tx, input.suggestionId);
  },
  check({ locked }) {
    refuseDecided(locked!.rows);
  },
  async write({ tx, input, userId, locked }): Promise<AddedSuggestion> {
    const suggestion = locked!.rows;
    // insert() keeps only the product's own fields of the input.
    const product = await insertProduct(tx, userId, input, input.clientKey, {
      acceptedPhotoId: suggestion.photoFileId,
    });
    await tx
      .update(catalogSuggestions)
      .set({
        status: statusAfter("added"),
        productId: product.id,
        decidedBy: userId,
        decidedAt: now(),
      })
      .where(eq(catalogSuggestions.id, suggestion.id));
    return { id: suggestion.id, productId: product.id, product };
  },
  async history({ tx, userId }, { id, product }) {
    await recordProductCreate(tx, userId, product!);
    await audit(
      { tx, userId },
      {
        action: "suggestion.add",
        entity: ENTITY,
        entityId: id,
        before: { status: "PENDING" },
        after: { status: "ADDED", productId: product!.id, product: product!.name },
        at: now(),
      },
    );
  },
  async notify({ tx, userId, locked }) {
    await tellSuggester({ tx, userId }, locked!.rows, "added");
  },
});

export const declineSuggestion = defineAction({
  name: "declineSuggestion",
  permission: "catalog.manage",
  input: z.object({
    suggestionId: z.uuid(),
    reason: z.string().transform(suggestionNote).refine(isSuggestionNote),
  }),
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx, input }) {
    return lockSuggestion(tx, input.suggestionId);
  },
  check({ locked }) {
    refuseDecided(locked!.rows);
  },
  async write({ tx, input, userId, locked }) {
    const suggestion = locked!.rows;
    await tx
      .update(catalogSuggestions)
      .set({
        status: statusAfter("declined"),
        decisionNote: input.reason,
        decidedBy: userId,
        decidedAt: now(),
      })
      .where(eq(catalogSuggestions.id, suggestion.id));
    return { id: suggestion.id };
  },
  async history({ tx, input, userId, locked }) {
    await audit(
      { tx, userId },
      {
        action: "suggestion.decline",
        entity: ENTITY,
        entityId: locked!.rows.id,
        before: { status: "PENDING" },
        after: { status: "DECLINED", reason: input.reason },
        at: now(),
      },
    );
  },
  async notify({ tx, userId, locked }) {
    await tellSuggester({ tx, userId }, locked!.rows, "declined");
  },
});
