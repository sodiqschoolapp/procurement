import { and, eq } from "drizzle-orm";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import {
  type SuggestionOutcome,
  type SuggestionStatus,
  canDecide,
  isSuggestionNote,
  isUnitText,
  statusAfter,
  suggestionNote,
  unitText,
} from "@/domain/suggestions";
import { ActionError, GLOBAL_TARGET, defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { branches, catalogSuggestions, products, users } from "@/server/db/schema";
import { notify } from "@/server/notify";

import type { SavedEntry } from "./catalog-entries";
import { nameField, optionalId, optionalText } from "./catalog-fields";
import { fileNameOf, refusePhoto } from "./photos";
import {
  type ProductFields,
  createProduct,
  insertProduct,
  recordProductCreate,
  refuseProductName,
} from "./products";

// Product suggestions (04-catalogs.md rule 8: "A Manager who needs something missing from the
// catalog sends a suggestion: name, measure, photo, note. The Head adds it (possibly edited) or
// declines with a reason. The Manager is notified either way"; 10, Notifications: "Product
// suggested | Head; the decision goes back to the Manager"; build-plan 1.12).
// - Suggesting is catalog.suggest on the suggestion's branch: the Head in any branch, a Manager in
//   their own; Principal and Finance never (03, Permission matrix; plan of 1.12, decisions 1, 10).
// - Adding and declining are catalog.manage, the Head only (decision 2): the suggestion row is
//   locked FOR UPDATE and must be PENDING, so a second decision is `wrong_status` (decision 9).
// - The add writes the product through the create's own body (insertProduct, recordProductCreate):
//   every rule of a product made by hand holds. The suggestion's photo passes to the product,
//   read from the locked row and never from the input (decision 3, Look first).
// - Every write keeps its audit row `suggestion.*` (CLAUDE.md, Conventions).

const ENTITY = "catalog_suggestions";

export type SuggestionResult = { id: string; branchId: string; name: string };

const suggestInput = z.object({
  clientKey: z.string().refine(isClientKey),
  branchId: z.uuid(),
  name: nameField,
  unitText: z.string().transform(unitText).refine(isUnitText),
  photoFileId: optionalId,
  note: optionalText(suggestionNote, isSuggestionNote),
});

/** The branch a suggestion names must exist and be active (decision 11), locked FOR SHARE. */
async function refuseBranch(tx: Executor, branchId: string): Promise<string> {
  const [branch] = await tx
    .select({ code: branches.code, isActive: branches.isActive })
    .from(branches)
    .where(eq(branches.id, branchId))
    .for("share");
  if (!branch) throw new ActionError("invalid_input", { branchId: "errors.field.notAllowed" });
  if (!branch.isActive) {
    throw new ActionError("invalid_input", { branchId: "errors.field.inactive" });
  }
  return branch.code;
}

async function branchCode(tx: Executor, branchId: string): Promise<string> {
  const [row] = await tx
    .select({ code: branches.code })
    .from(branches)
    .where(eq(branches.id, branchId));
  return row?.code ?? "";
}

/** Every active Head; notify() leaves out the one who acts (plan of 1.12, decision 8). */
async function activeHeads(tx: Executor): Promise<string[]> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "HEAD"), eq(users.isActive, true)));
  return rows.map((row) => row.id);
}

export const suggestProduct = defineAction({
  name: "suggestProduct",
  permission: "catalog.suggest",
  input: suggestInput,
  // A create: the branch comes from the input and authorize() checks it is the actor's.
  async target({ input }) {
    return { branchId: input.branchId };
  },
  repeat: {
    clientKey: (input) => input.clientKey,
    async find(tx, clientKey) {
      const [row] = await tx
        .select({
          id: catalogSuggestions.id,
          branchId: catalogSuggestions.branchId,
          name: catalogSuggestions.name,
          userId: catalogSuggestions.suggestedBy,
        })
        .from(catalogSuggestions)
        .where(eq(catalogSuggestions.clientKey, clientKey));
      if (!row) return null;
      const { userId, ...result } = row;
      return { result, userId, branchId: row.branchId };
    },
  },
  async write({ tx, input, userId }): Promise<SuggestionResult> {
    await refuseBranch(tx, input.branchId);
    await refuseProductName(tx, input.name);
    if (input.photoFileId) await refusePhoto(tx, userId, input.photoFileId);
    const [row] = await tx
      .insert(catalogSuggestions)
      .values({
        branchId: input.branchId,
        suggestedBy: userId,
        name: input.name,
        unitText: input.unitText,
        photoFileId: input.photoFileId,
        note: input.note,
        status: "PENDING",
        clientKey: input.clientKey,
        createdAt: now(),
      })
      .returning({
        id: catalogSuggestions.id,
        branchId: catalogSuggestions.branchId,
        name: catalogSuggestions.name,
      });
    return row!;
  },
  async history({ tx, input, userId }, result) {
    await audit(
      { tx, userId },
      {
        action: "suggestion.create",
        entity: ENTITY,
        entityId: result.id,
        before: null,
        after: {
          branchId: input.branchId,
          branch: await branchCode(tx, input.branchId),
          name: input.name,
          unitText: input.unitText,
          note: input.note,
          photoFileId: input.photoFileId,
          photo: input.photoFileId ? await fileNameOf(tx, input.photoFileId) : null,
          status: "PENDING",
        },
        at: now(),
      },
    );
  },
  async notify({ tx, userId }, result) {
    await notify(
      { tx, userId },
      {
        to: await activeHeads(tx),
        type: "PRODUCT_SUGGESTED",
        params: { name: result.name, branch: await branchCode(tx, result.branchId) },
        branchId: result.branchId,
        link: `/suggestions/${result.id}`,
        at: now(),
      },
    );
  },
});

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
    const { suggestionId: _suggestionId, clientKey, ...fields } = input;
    const product = await insertProduct(tx, userId, fields, clientKey, {
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
