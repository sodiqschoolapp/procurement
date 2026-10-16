import type { CreatedDraft, UpdatedDraft } from "./actions/drafts";
import type { DraftExtra, DraftRow } from "./queries/drafts";
import type { DraftChoices, PickerProduct, PickerSubtype } from "./queries/draft-picker";

// What the drafts grid receives from the server (plan of 2.5b, Server actions and queries): money
// as decimal text, never a JavaScript number, so nothing between the server and the formatter
// rounds it (plan of 2.5a, decided item 23; CLAUDE.md rule 6). The grid reads the text back with
// BigInt() for the formatter and tickedDraftsTotals() of src/domain/drafts.ts.

type Text<T, Keys extends keyof T> = Omit<T, Keys> & {
  [Key in Keys]: null extends T[Key] ? string | null : string;
};

export type WireExtra = Text<DraftExtra, "amount">;
export type WireDraftRow = Omit<Text<DraftRow, "price" | "total" | "priceHint">, "extras"> & {
  extras: WireExtra[];
};
export type WireSubtype = Text<PickerSubtype, "referencePrice" | "suggestedPrice">;
export type WireProduct = Omit<PickerProduct, "subtypes"> & { subtypes: WireSubtype[] };
export type WireCreated =
  | Extract<CreatedDraft, { merged: false }>
  | (Omit<Extract<CreatedDraft, { merged: true }>, "total"> & { total: string | null });
export type WireUpdated = { version: number; total: string | null; priceHint: string | null };
export type WireChoices = DraftChoices;

function text(value: bigint | null): string | null {
  return value === null ? null : value.toString();
}

export function wireDraft(row: DraftRow): WireDraftRow {
  return {
    ...row,
    price: text(row.price),
    total: text(row.total),
    priceHint: text(row.priceHint),
    extras: row.extras.map((extra) => ({ ...extra, amount: extra.amount.toString() })),
  };
}

export function wireProduct(product: PickerProduct): WireProduct {
  return {
    ...product,
    subtypes: product.subtypes.map((subtype) => ({
      ...subtype,
      referencePrice: text(subtype.referencePrice),
      suggestedPrice: text(subtype.suggestedPrice),
    })),
  };
}

export function wireCreated(created: CreatedDraft): WireCreated {
  return created.merged ? { ...created, total: text(created.total) } : created;
}

export function wireUpdated(updated: UpdatedDraft): WireUpdated {
  return {
    version: updated.version,
    total: text(updated.total),
    priceHint: text(updated.priceHint),
  };
}
