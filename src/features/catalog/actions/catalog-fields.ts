import * as z from "zod";

import { catalogName, isCatalogName, isShortName } from "@/domain/catalogs";

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
