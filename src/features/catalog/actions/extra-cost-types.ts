import { extraCostTypes } from "@/server/db/schema";

import { defineCatalogActions } from "./catalog-entries";
import { nameField } from "./catalog-fields";

// Extra cost types (04-catalogs.md, Catalogs table: "Name"; "Delivery, loading, installation and
// so on"). Table `extra_cost_types`, audit `extra_cost_type.*`.

export type ExtraCostTypeFields = { name: string };

const catalog = defineCatalogActions<ExtraCostTypeFields>({
  kind: "extra-costs",
  name: "ExtraCostType",
  table: extraCostTypes,
  prefix: "extra_cost_type",
  columns: { name: extraCostTypes.name },
  shape: { name: nameField },
  unique: ["name"],
});

export const createExtraCostType = catalog.create;
export const updateExtraCostType = catalog.update;
export const setExtraCostTypeActive = catalog.setActive;
