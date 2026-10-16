import { and, asc, eq, exists, ilike, inArray } from "drizzle-orm";
import * as z from "zod";

import { DRAFT_PICKER_MAX, inStock, suggestedPrice } from "@/domain/drafts";
import type { CompanyKind } from "@/domain/catalogs";
import type { PaymentType } from "@/domain/payment-types";
import type { ProductType } from "@/domain/products";
import { authorize } from "@/server/authorize";
import {
  categories,
  companies,
  departments,
  extraCostTypes,
  productVariants,
  products,
  stockBalances,
  units,
} from "@/server/db/schema";
import { readSettings } from "@/server/settings";

// The product picker and the choices of the drafts grid (05-order-request-form.md, Order fields
// 2 to 7, 11 to 13; plan of 2.5a, decided item 9, Look first). Both under `request.create` on the
// branch the draft is for: they show that branch's stock and departments to whoever may add a
// draft there (03, Permission matrix), so another branch is "Not found" (03 rule 1). Active
// entries only: inactive ones "leave the pickers" (04 rule 2).

export type PickerSubtype = {
  id: string;
  /** The subtype's name; null for the hidden default subtype (04 rule 1). */
  name: string | null;
  /** 05 field 5: the subtype's photo, else the product's. */
  photoFileId: string | null;
  /** 05 field 4: the stock of the branch; null (a dash) for a service. */
  inStock: string | null;
  referencePrice: bigint | null;
  /** 05 field 11: the reference price, else the last purchase price, else none. */
  suggestedPrice: bigint | null;
};

export type PickerProduct = {
  id: string;
  name: string;
  type: ProductType;
  categoryName: string;
  unitShortName: string;
  allowsDecimals: boolean;
  photoFileId: string | null;
  subtypes: PickerSubtype[];
};

export type DraftChoices = {
  departments: {
    id: string;
    name: string;
    responsibleName: string | null;
    responsiblePhone: string | null;
  }[];
  companies: { id: string; name: string; kind: CompanyKind }[];
  extraCostTypes: { id: string; name: string }[];
  /** 05 field 13: "Default is Cash (a setting)". */
  defaultPaymentType: PaymentType;
  /** 05 Ticking and filters, Price hint: "more than 20% (a setting)". */
  priceHintPercent: number;
};

const branchInput = z.uuid();
const searchInput = z.string().trim().max(200).catch("");

/** `%`, `_` and `\` typed by a person are matched as themselves (as 1.5, decision 13). */
function containing(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * Up to 20 active products whose name holds `q` (any case), by name, each with its active
 * subtypes and their stock in the branch. A product with no active subtype is left out.
 */
export async function searchDraftProducts(
  userId: string,
  options: { branchId: string; q?: string },
): Promise<PickerProduct[]> {
  const branchId = branchInput.parse(options.branchId);
  await authorize(userId, "request.create", { branchId });
  const q = searchInput.parse(options.q ?? "");
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const activeSubtype = db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(and(eq(productVariants.productId, products.id), eq(productVariants.isActive, true)));
  const found = await db
    .select({
      id: products.id,
      name: products.name,
      type: products.type,
      categoryName: categories.name,
      unitShortName: units.shortName,
      allowsDecimals: units.allowDecimal,
      photoFileId: products.photoFileId,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(units, eq(units.id, products.unitId))
    .where(
      and(
        eq(products.isActive, true),
        q === "" ? undefined : ilike(products.name, containing(q)),
        exists(activeSubtype),
      ),
    )
    .orderBy(asc(products.name), asc(products.id))
    .limit(DRAFT_PICKER_MAX);
  if (found.length === 0) return [];

  const subtypes = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      name: productVariants.name,
      isDefault: productVariants.isDefault,
      photoFileId: productVariants.photoFileId,
      referencePrice: productVariants.referencePrice,
      lastPurchasePrice: productVariants.lastPurchasePrice,
      stock: stockBalances.qty,
    })
    .from(productVariants)
    .leftJoin(
      stockBalances,
      and(eq(stockBalances.variantId, productVariants.id), eq(stockBalances.branchId, branchId)),
    )
    .where(
      and(
        inArray(
          productVariants.productId,
          found.map((product) => product.id),
        ),
        eq(productVariants.isActive, true),
      ),
    )
    .orderBy(asc(productVariants.name), asc(productVariants.id));

  return found.map((product) => ({
    ...product,
    subtypes: subtypes
      .filter((subtype) => subtype.productId === product.id)
      .map((subtype) => ({
        id: subtype.id,
        name: subtype.isDefault ? null : subtype.name,
        photoFileId: subtype.photoFileId ?? product.photoFileId,
        inStock: inStock(product.type, subtype.stock),
        referencePrice: subtype.referencePrice,
        suggestedPrice: suggestedPrice(subtype.referencePrice, subtype.lastPurchasePrice),
      })),
  }));
}

/**
 * The choices of the grid for one branch: its active departments with their responsible person
 * (05 field 7), the active companies (field 6), the active extra cost types (field 12), and the
 * two settings the grid uses (fields 13 and the price hint).
 */
export async function listDraftChoices(
  userId: string,
  options: { branchId: string },
): Promise<DraftChoices> {
  const branchId = branchInput.parse(options.branchId);
  await authorize(userId, "request.create", { branchId });
  const { db } = await import("@/server/db/client");
  const [departmentRows, companyRows, typeRows, settings] = await Promise.all([
    db
      .select({
        id: departments.id,
        name: departments.name,
        responsibleName: departments.responsibleName,
        responsiblePhone: departments.responsiblePhone,
      })
      .from(departments)
      .where(and(eq(departments.branchId, branchId), eq(departments.isActive, true)))
      .orderBy(asc(departments.name), asc(departments.id)),
    db
      .select({ id: companies.id, name: companies.name, kind: companies.kind })
      .from(companies)
      .where(eq(companies.isActive, true))
      .orderBy(asc(companies.name), asc(companies.id)),
    db
      .select({ id: extraCostTypes.id, name: extraCostTypes.name })
      .from(extraCostTypes)
      .where(eq(extraCostTypes.isActive, true))
      .orderBy(asc(extraCostTypes.name), asc(extraCostTypes.id)),
    readSettings(db),
  ]);
  return {
    departments: departmentRows,
    companies: companyRows,
    extraCostTypes: typeRows,
    defaultPaymentType: settings.default_payment_type,
    priceHintPercent: settings.price_hint_percent,
  };
}
