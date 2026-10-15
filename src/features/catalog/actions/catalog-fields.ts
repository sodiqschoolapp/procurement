import * as z from "zod";

import { catalogName, isCatalogName, isShortName } from "@/domain/catalogs";
import { parseSom } from "@/domain/money";

// The Zod checks the four catalogs share (developer-rules.md rule 13: "Every input is checked on
// the server with Zod"). Each returns the stored form; the rules are those of src/domain/.

/** A name: trimmed, inner spaces collapsed, 1 to 120 code points (04 rule 3). */
export const nameField = z.string().transform(catalogName).refine(isCatalogName);

/** A measure's short name: the same, 1 to 20 code points (plan of 1.5, decision 4). */
export const shortNameField = z.string().transform(catalogName).refine(isShortName);

/**
 * An optional text: stored in the form `normalize` gives, an empty one as null (plan of 1.5,
 * decision 5), and checked with `isValid` when filled.
 */
export function optionalText(
  normalize: (value: string) => string,
  isValid: (value: string) => boolean,
) {
  return z
    .string()
    .nullish()
    .transform((value) => {
      const stored = value == null ? "" : normalize(value);
      return stored === "" ? null : stored;
    })
    .refine((value) => value === null || isValid(value));
}

/** An optional id: an empty text or none is null. */
export const optionalId = z
  .union([z.literal(""), z.uuid()])
  .nullish()
  .transform((value) => (value ? value : null));

const blank = (value: string | null | undefined) => value == null || value.trim() === "";

/**
 * Whole so'm as the Head typed it ("1 250 000"; the browser cannot send a bigint), read by the one
 * parser of src/domain/money.ts; empty is null (plan of 1.7, decision 6), anything else "Wrong
 * format". A product's and a subtype's reference price (1.7, 1.8).
 */
export const priceField = z
  .string()
  .nullish()
  .refine((value) => blank(value) || parseSom(value!) !== null)
  .transform((value) => (blank(value) ? null : parseSom(value!)));
