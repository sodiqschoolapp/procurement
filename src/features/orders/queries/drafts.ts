import { type SQL, and, asc, count, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as z from "zod";

import {
  DRAFTS_PAGE_SIZE,
  draftTotal,
  inStock,
  plainQuantity,
  seesDraftsGrid,
} from "@/domain/drafts";
import { behindDraftWall } from "@/domain/order-moves";
import { priceHintPercent } from "@/domain/order-totals";
import { inactiveEntries } from "@/domain/submit-checks";
import type { Actor } from "@/domain/permissions";
import type { RequestStatus } from "@/domain/request-status";
import {
  AuthorizationError,
  type Executor,
  authorize,
  authorizeList,
  branchFilter,
} from "@/server/authorize";
import {
  branches,
  categories,
  companies,
  departments,
  extraCostTypes,
  orderExtras,
  orders,
  productVariants,
  products,
  stockBalances,
  units,
  users,
} from "@/server/db/schema";
import { readSettings } from "@/server/settings";

// The rows of the drafts grid (05-order-request-form.md, Order: all fields; Drafts 1 and 5;
// Ticking and filters: Price hint; 11-screens-and-ux.md, Screens: Order list, Order list layout 3;
// plan of 2.5a, decided item 9, Look first). Under `data.view` with the branch inside the SQL
// (developer-rules.md rule 4): DRAFT and RETURNED orders, a Manager's own, the Head's own or,
// with `owners: "all"`, everyone's. The Principal and Finance have no drafts grid. A draft of
// another user is behind the draft wall (06 Statuses: "Visible to the owner and the Head only").
// Paged on the server, 25 rows a page, oldest first (11 Rules for a smooth feel 8).

/** The label of a numbered row in the grid (05 Drafts 5). */
export type DraftLabel = "SENT_BACK" | "TAKEN_BACK";

export type DraftExtra = { id: string; extraCostTypeId: string; name: string; amount: bigint };

export type DraftRow = {
  id: string;
  number: string | null;
  revision: number;
  status: RequestStatus;
  label: DraftLabel | null;
  version: number;
  branchId: string;
  ownerId: string;
  ownerName: string;
  productId: string | null;
  productName: string | null;
  productType: "GOODS" | "SERVICE" | null;
  categoryName: string | null;
  variantId: string | null;
  /** The subtype's name; null for the hidden default subtype of a product without subtypes. */
  subtypeName: string | null;
  unitShortName: string | null;
  allowsDecimals: boolean | null;
  /** 05 field 5: the subtype's photo, else the product's. */
  photoFileId: string | null;
  referencePhotoFileId: string | null;
  companyId: string | null;
  companyName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  responsibleName: string | null;
  responsiblePhone: string | null;
  requesterName: string | null;
  neededBy: string | null;
  quantity: string | null;
  price: bigint | null;
  paymentType: "CASH" | "TRANSFER" | "CARD";
  priority: "NORMAL" | "URGENT";
  urgentReason: string | null;
  comment: string | null;
  extras: DraftExtra[];
  /** 05 field 4: the stock of the order's branch; null (a dash) for a service. */
  inStock: string | null;
  /** 05 field 16, by draftTotal(): null while quantity or price is missing. */
  total: bigint | null;
  /** The price hint against the reference price (05 Ticking and filters), or null. */
  priceHint: bigint | null;
  /**
   * The cells whose catalog entry is deactivated: branch, product or subtype, department,
   * company, an extra cost type (edge case "A product is deactivated while it sits in a draft":
   * "the draft is marked"; plan of 2.7, decided item 9). Submit refuses them too.
   */
  inactive: string[];
  createdAt: Date;
};

export type DraftPage = { rows: DraftRow[]; page: number; pages: number; total: number };

const branchInput = z.uuid().nullable().catch(null);
const ownersInput = z.enum(["all"]).nullable().catch(null);

const owner = alias(users, "owner");

const columns = {
  id: orders.id,
  number: orders.number,
  revision: orders.revision,
  status: orders.status,
  version: orders.version,
  branchId: orders.branchId,
  ownerId: orders.ownerId,
  ownerName: owner.fullName,
  productId: products.id,
  productName: products.name,
  productType: products.type,
  categoryName: categories.name,
  variantId: orders.variantId,
  variantName: productVariants.name,
  variantIsDefault: productVariants.isDefault,
  variantPhoto: productVariants.photoFileId,
  productPhoto: products.photoFileId,
  referencePrice: productVariants.referencePrice,
  unitShortName: units.shortName,
  allowsDecimals: units.allowDecimal,
  referencePhotoFileId: orders.referencePhotoFileId,
  companyId: orders.companyId,
  companyName: companies.name,
  departmentId: orders.departmentId,
  departmentName: departments.name,
  responsibleName: departments.responsibleName,
  responsiblePhone: departments.responsiblePhone,
  requesterName: orders.requesterName,
  neededBy: orders.neededBy,
  quantity: orders.plannedQty,
  price: orders.plannedPrice,
  paymentType: orders.paymentType,
  priority: orders.priority,
  urgentReason: orders.urgentReason,
  comment: orders.comment,
  stock: stockBalances.qty,
  branchActive: branches.isActive,
  variantActive: productVariants.isActive,
  productActive: products.isActive,
  departmentActive: departments.isActive,
  companyActive: companies.isActive,
  createdAt: orders.createdAt,
};

/** The editable statuses of the grid (05 Drafts 5). */
const IN_GRID = inArray(orders.status, ["DRAFT", "RETURNED"]);

/** Reads the rows with everything the grid shows. */
async function readRows(
  executor: Executor,
  where: SQL | undefined,
  page?: { limit: number; offset: number },
): Promise<DraftRow[]> {
  const query = executor
    .select(columns)
    .from(orders)
    .innerJoin(owner, eq(owner.id, orders.ownerId))
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .leftJoin(productVariants, eq(productVariants.id, orders.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(units, eq(units.id, products.unitId))
    .leftJoin(companies, eq(companies.id, orders.companyId))
    .leftJoin(departments, eq(departments.id, orders.departmentId))
    .leftJoin(
      stockBalances,
      and(
        eq(stockBalances.branchId, orders.branchId),
        eq(stockBalances.variantId, orders.variantId),
      ),
    )
    .where(where)
    .orderBy(asc(orders.createdAt), asc(orders.id));
  const rows = page ? await query.limit(page.limit).offset(page.offset) : await query;
  if (rows.length === 0) return [];

  const extras = await executor
    .select({
      id: orderExtras.id,
      orderId: orderExtras.orderId,
      extraCostTypeId: orderExtras.extraCostTypeId,
      name: extraCostTypes.name,
      amount: orderExtras.amount,
      isActive: extraCostTypes.isActive,
    })
    .from(orderExtras)
    .innerJoin(extraCostTypes, eq(extraCostTypes.id, orderExtras.extraCostTypeId))
    .where(
      inArray(
        orderExtras.orderId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(orderExtras.createdAt), asc(orderExtras.id));
  const extrasOf = new Map<string, DraftExtra[]>();
  const extrasActive = new Map<string, { active: boolean }[]>();
  for (const { orderId, isActive, ...extra } of extras) {
    extrasOf.set(orderId, [...(extrasOf.get(orderId) ?? []), extra]);
    extrasActive.set(orderId, [...(extrasActive.get(orderId) ?? []), { active: isActive }]);
  }
  const threshold = (await readSettings(executor)).price_hint_percent;

  return rows.map((row) => {
    const rowExtras = extrasOf.get(row.id) ?? [];
    const quantity = row.quantity === null ? null : plainQuantity(row.quantity);
    return {
      id: row.id,
      number: row.number,
      revision: row.revision,
      status: row.status,
      label: row.status === "RETURNED" ? "SENT_BACK" : row.number !== null ? "TAKEN_BACK" : null,
      version: row.version,
      branchId: row.branchId,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      productId: row.productId,
      productName: row.productName,
      productType: row.productType,
      categoryName: row.categoryName,
      variantId: row.variantId,
      subtypeName: row.variantIsDefault === false ? row.variantName : null,
      unitShortName: row.unitShortName,
      allowsDecimals: row.allowsDecimals,
      photoFileId: row.variantPhoto ?? row.productPhoto,
      referencePhotoFileId: row.referencePhotoFileId,
      companyId: row.companyId,
      companyName: row.companyName,
      departmentId: row.departmentId,
      departmentName: row.departmentName,
      responsibleName: row.responsibleName,
      responsiblePhone: row.responsiblePhone,
      requesterName: row.requesterName,
      neededBy: row.neededBy,
      quantity,
      price: row.price,
      paymentType: row.paymentType,
      priority: row.priority,
      urgentReason: row.urgentReason,
      comment: row.comment,
      extras: rowExtras,
      // 05 field 4: no stock row is 0; a service has no stock.
      inStock: row.productType === null ? null : inStock(row.productType, row.stock),
      total: draftTotal({
        quantity,
        price: row.price,
        extras: rowExtras.map((extra) => extra.amount),
        paymentType: row.paymentType,
      }),
      priceHint: priceHintPercent(row.price, row.referencePrice, threshold),
      inactive: inactiveEntries({
        branchActive: row.branchActive,
        variantId: row.variantId,
        subtypeActive:
          row.variantActive === null ? null : row.variantActive && row.productActive === true,
        departmentId: row.departmentId,
        departmentActive: row.departmentActive,
        companyId: row.companyId,
        companyActive: row.companyActive,
        extras: extrasActive.get(row.id) ?? [],
      }),
      createdAt: row.createdAt,
    };
  });
}

/** Refuses the roles that have no drafts grid (decided item 9, Look first). */
function refuseWithoutGrid(actor: Actor): void {
  if (!seesDraftsGrid(actor.role)) throw new AuthorizationError("forbidden");
}

/**
 * One page of the drafts grid: of `branchId` when given (authorized on it, so another branch is
 * "Not found"), else of every branch the person sees. A Manager sees his own rows, with
 * CREATE_REQUESTS off too ("can only view orders"); the Head his own, or every owner's with
 * `owners: "all"`. A page past the last gives the last.
 */
export async function listDrafts(
  userId: string,
  options: { page?: number; branchId?: string | null; owners?: string | null } = {},
): Promise<DraftPage> {
  const branchId = branchInput.parse(options.branchId ?? null);
  const everyOwner = ownersInput.parse(options.owners ?? null) === "all";
  // The role first: the Principal and Finance are refused the grid in every branch.
  const actor = await authorizeList(userId, "data.view");
  refuseWithoutGrid(actor);
  if (branchId) await authorize(userId, "data.view", { branchId });
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const where = and(
    IN_GRID,
    branchFilter(actor, orders.branchId),
    branchId ? eq(orders.branchId, branchId) : undefined,
    actor.role === "HEAD" && everyOwner ? undefined : eq(orders.ownerId, actor.userId),
  );
  const [totals] = await db.select({ total: count() }).from(orders).where(where);
  const total = totals?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / DRAFTS_PAGE_SIZE));
  const asked = Number.isInteger(options.page) && options.page! >= 1 ? options.page! : 1;
  const page = Math.min(asked, pages);
  const rows = await readRows(db, where, {
    limit: DRAFTS_PAGE_SIZE,
    offset: (page - 1) * DRAFTS_PAGE_SIZE,
  });
  return { rows, page, pages, total };
}

/**
 * One row of the grid, or `null` for an id that is unknown, not an id, not a DRAFT or RETURNED
 * order, another user's Draft for anyone but the Head (the draft wall), or another branch's order
 * (03 rule 1), alike: authorize() on the order's own branch decides, and its "Not found" is null.
 */
export async function getDraft(userId: string, id: string): Promise<DraftRow | null> {
  const { db } = await import("@/server/db/client");
  const [found] = z.uuid().safeParse(id).success
    ? await db
        .select({ branchId: orders.branchId, ownerId: orders.ownerId, status: orders.status })
        .from(orders)
        .where(eq(orders.id, id))
    : [];
  if (!found) {
    await authorizeList(userId, "data.view");
    return null;
  }
  let actor: Actor;
  try {
    actor = await authorize(userId, "data.view", { branchId: found.branchId });
  } catch (error) {
    // Another branch's order is null like every other "not found" (permission review of 2.5a, P2).
    if (error instanceof AuthorizationError && error.kind === "not_found") return null;
    throw error;
  }
  if (behindDraftWall(actor, found)) return null;
  const [row] = await readRows(
    db,
    and(eq(orders.id, id), IN_GRID, branchFilter(actor, orders.branchId)),
  );
  return row ?? null;
}
