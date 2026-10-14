import { notFound } from "next/navigation";

import { type CatalogKind, isCatalogKind } from "@/domain/catalogs";

/** The catalog of the address; an unknown one is "not found" (plan of 1.5, decision 12). */
export function kindOrNotFound(segment: string): CatalogKind {
  if (!isCatalogKind(segment)) notFound();
  return segment;
}
