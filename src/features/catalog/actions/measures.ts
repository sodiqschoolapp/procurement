import { eq } from "drizzle-orm";
import * as z from "zod";

import { MEASURE_LOCKED_AFTER_USE, lockedChanges } from "@/domain/products";
import { ActionError } from "@/server/action";
import { products, units } from "@/server/db/schema";

import { defineCatalogActions } from "./catalog-entries";
import { nameField, shortNameField } from "./catalog-fields";

// Measures (04-catalogs.md, Catalogs table: "Name, short name, allows decimals"; "kg" allows
// decimals, "pcs" does not). Table `units`, audit `unit.*`. "Allows decimals" can be changed while
// no product uses the measure and locks once one does, active or not (decisions 1.5 item 2, Look
// first; wired in 1.7, decision 3). The measure row is held FOR UPDATE by the update, and a product
// create or a change of measure takes it FOR SHARE, so the two cannot pass each other.

export type MeasureFields = { name: string; shortName: string; allowDecimal: boolean };

const measures = defineCatalogActions<MeasureFields>({
  kind: "measures",
  name: "Measure",
  table: units,
  prefix: "unit",
  columns: { name: units.name, shortName: units.shortName, allowDecimal: units.allowDecimal },
  shape: { name: nameField, shortName: shortNameField, allowDecimal: z.boolean() },
  unique: ["name", "shortName"],
  async guard({ tx }, sent, current) {
    if (!current) return;
    const changed = Object.keys(sent);
    if (lockedChanges(MEASURE_LOCKED_AFTER_USE, changed, true).length === 0) return;
    const [used] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.unitId, current.id))
      .limit(1);
    if (lockedChanges(MEASURE_LOCKED_AFTER_USE, changed, used !== undefined).length > 0) {
      throw new ActionError("invalid_input", { allowDecimal: "errors.field.locked" });
    }
  },
});

export const createMeasure = measures.create;
export const updateMeasure = measures.update;
export const setMeasureActive = measures.setActive;
