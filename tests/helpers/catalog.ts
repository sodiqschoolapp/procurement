import { randomUUID } from "node:crypto";

import type { CompanyKind } from "@/domain/catalogs";
import type { FileMime } from "@/domain/files";
import type { ProductType } from "@/domain/products";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { categories, companies, files, products, units } from "@/server/db/schema";

// Catalog rows, files and products in the database for tests (task 1.7). Names are invented and
// unique to the row unless given; everything is written at the moment of the clock.

let made = 0;
const next = () => (made += 1);

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

/** A product with its own category and measure unless given. */
export async function insertProduct(row: ProductRow = {}) {
  const categoryId = row.categoryId ?? (await insertCategory()).id;
  const unitId = row.unitId ?? (await insertUnit()).id;
  const [inserted] = await db
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
  return { ...inserted!, categoryId, unitId };
}
