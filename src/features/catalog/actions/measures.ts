import * as z from "zod";

import { units } from "@/server/db/schema";

import { defineCatalogActions } from "./catalog-entries";
import { nameField, shortNameField } from "./catalog-fields";

// Measures (04-catalogs.md, Catalogs table: "Name, short name, allows decimals"; "kg" allows
// decimals, "pcs" does not). Table `units`, audit `unit.*`. "Allows decimals" can be changed while
// no product uses the measure; 1.7 locks it once one does (plan of 1.5, decision 3, Look first).

export type MeasureFields = { name: string; shortName: string; allowDecimal: boolean };

const measures = defineCatalogActions<MeasureFields>({
  kind: "measures",
  name: "Measure",
  table: units,
  prefix: "unit",
  columns: { name: units.name, shortName: units.shortName, allowDecimal: units.allowDecimal },
  shape: { name: nameField, shortName: shortNameField, allowDecimal: z.boolean() },
  unique: ["name", "shortName"],
});

export const createMeasure = measures.create;
export const updateMeasure = measures.update;
export const setMeasureActive = measures.setActive;
