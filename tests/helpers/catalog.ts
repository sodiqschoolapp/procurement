import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { CompanyKind } from "@/domain/catalogs";
import type { FileMime } from "@/domain/files";
import type { ProductType } from "@/domain/products";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import {
  categories,
  companies,
  files,
  priceHistory,
  productVariants,
  products,
  units,
} from "@/server/db/schema";

import { insertUser } from "./users";

// Catalog rows, files, products, subtypes and their prices in the database for tests (tasks 1.7
// to 1.9). Names are invented and
// unique to the row unless given; everything is written at the moment of the clock.

let made = 0;
const next = () => (made += 1);

let setter: Promise<string> | null = null;

/**
 * The Head every price these helpers write is credited to: one per test file, made on first use.
 * A price is kept with its HEAD row of the price history in the same transaction (the deferred
 * check `price_recorded` of migration 0014; plan of 1.9, decision 2).
 */
export function priceSetter(): Promise<string> {
  setter ??= insertUser("HEAD").then((user) => user.id);
  return setter;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function recordPrice(tx: Tx, variantId: string, price: bigint | null | undefined) {
  if (price === null || price === undefined) return;
  await tx.insert(priceHistory).values({
    variantId,
    price,
    source: "HEAD",
    setBy: await priceSetter(),
    createdAt: now(),
  });
}

export async function insertCategory(options: { name?: string; isActive?: boolean } = {}) {
  const [row] = await db
    .insert(categories)
    .values({
      name: options.name ?? `Toifa ${randomUUID().slice(0, 8)} ${next()}`,
      isActive: options.isActive ?? true,
      createdAt: now(),
    })
    .returning({ id: categories.id, name: categories.name });
  return row!;
}

export async function insertUnit(
  options: { name?: string; allowDecimal?: boolean; isActive?: boolean } = {},
) {
  const tag = `${randomUUID().slice(0, 6)}${next()}`;
  const [row] = await db
    .insert(units)
    .values({
      name: options.name ?? `O'lchov ${tag}`,
      shortName: `u${tag}`,
      allowDecimal: options.allowDecimal ?? false,
      isActive: options.isActive ?? true,
      createdAt: now(),
    })
    .returning({ id: units.id, name: units.name });
  return row!;
}

export async function insertCompany(
  options: { name?: string; kind?: CompanyKind; isActive?: boolean } = {},
) {
  const [row] = await db
    .insert(companies)
    .values({
      name: options.name ?? `Kompaniya ${randomUUID().slice(0, 8)} ${next()}`,
      kind: options.kind ?? "BOTH",
      isActive: options.isActive ?? true,
      createdAt: now(),
    })
    .returning({ id: companies.id, name: companies.name });
  return row!;
}

/** A `files` row only (no object in the bucket): enough for the record that holds it. */
export async function insertFileRow(uploadedBy: string, mime: FileMime = "image/jpeg") {
  const [row] = await db
    .insert(files)
    .values({
      storageKey: randomUUID(),
      originalName: mime === "application/pdf" ? "hujjat.pdf" : "rasm.jpg",
      mime,
      sizeBytes: 1000,
      uploadedBy,
      clientKey: randomUUID(),
      createdAt: now(),
    })
    .returning({ id: files.id });
  return row!;
}

export type ProductRow = {
  name?: string;
  type?: ProductType;
  categoryId?: string;
  unitId?: string;
  photoFileId?: string | null;
  defaultCompanyId?: string | null;
  referencePrice?: bigint | null;
  description?: string | null;
  isActive?: boolean;
};

/**
 * A product with its own category and measure unless given, and its hidden default subtype with
 * its price in the same transaction (04-catalogs.md rule 1; the shape trigger of migration 0013).
 */
export async function insertProduct(row: ProductRow = {}) {
  const categoryId = row.categoryId ?? (await insertCategory()).id;
  const unitId = row.unitId ?? (await insertUnit()).id;
  if (row.referencePrice != null) await priceSetter();
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(products)
      .values({
        name: row.name ?? `Mahsulot ${randomUUID().slice(0, 8)} ${next()}`,
        type: row.type ?? "GOODS",
        categoryId,
        unitId,
        photoFileId: row.photoFileId ?? null,
        defaultCompanyId: row.defaultCompanyId ?? null,
        referencePrice: row.referencePrice ?? null,
        description: row.description ?? null,
        isActive: row.isActive ?? true,
        createdAt: now(),
      })
      .returning({ id: products.id, name: products.name });
    const [variant] = await tx
      .insert(productVariants)
      .values({
        productId: inserted!.id,
        name: "default",
        isDefault: true,
        referencePrice: row.referencePrice ?? null,
        createdAt: now(),
      })
      .returning({ id: productVariants.id });
    await recordPrice(tx, variant!.id, row.referencePrice);
    return { ...inserted!, categoryId, unitId, defaultVariantId: variant!.id };
  });
}

/**
 * Real subtypes of a product in one transaction: the first one is the default row made real
 * (plan of 1.8, decision 1), the rest new rows; `has_variants` turns true.
 */
export async function insertSubtypes(
  productId: string,
  rows: {
    name?: string;
    referencePrice?: bigint | null;
    photoFileId?: string | null;
    isActive?: boolean;
  }[],
) {
  if (rows.some((row) => row.referencePrice != null)) await priceSetter();
  return db.transaction(async (tx) => {
    const ids: string[] = [];
    const [product] = await tx
      .select({ hasVariants: products.hasVariants })
      .from(products)
      .where(eq(products.id, productId));
    let convert = !product!.hasVariants;
    for (const row of rows) {
      const values = {
        name: row.name ?? `Turi ${randomUUID().slice(0, 8)} ${next()}`,
        photoFileId: row.photoFileId ?? null,
        isActive: row.isActive ?? true,
      };
      if (convert) {
        const [made] = await tx
          .update(productVariants)
          .set({
            ...values,
            isDefault: false,
            ...(row.referencePrice !== undefined ? { referencePrice: row.referencePrice } : {}),
          })
          .where(and(eq(productVariants.productId, productId), eq(productVariants.isDefault, true)))
          .returning({ id: productVariants.id });
        await recordPrice(tx, made!.id, row.referencePrice);
        await tx.update(products).set({ hasVariants: true }).where(eq(products.id, productId));
        ids.push(made!.id);
        convert = false;
      } else {
        const [made] = await tx
          .insert(productVariants)
          .values({
            ...values,
            productId,
            referencePrice: row.referencePrice ?? null,
            createdAt: now(),
          })
          .returning({ id: productVariants.id });
        await recordPrice(tx, made!.id, row.referencePrice);
        ids.push(made!.id);
      }
    }
    return ids;
  });
}

/**
 * A subtype's last purchase price, set straight in the table: purchases write it from 3.x (plan
 * of 2.5a, Left out). Enough for the price suggestion of a draft (05 field 11).
 */
export async function setLastPurchasePrice(variantId: string, price: bigint | null) {
  await db
    .update(productVariants)
    .set({ lastPurchasePrice: price, lastPurchaseAt: price === null ? null : now() })
    .where(eq(productVariants.id, variantId));
}
