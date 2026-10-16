import { type SQL, and, asc, count, desc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import * as z from "zod";

import { businessDayStart, nextBusinessDate } from "@/domain/business-date";
import { plainQuantity } from "@/domain/drafts";
import {
  type GroupSummary,
  ORDER_LIST_PAGE_SIZE,
  type ListStatus,
  groupSummary,
  pinsUrgent,
} from "@/domain/order-list";
import { ORDER_ACTION_MAX, type OrderAction, allowedActions } from "@/domain/order-moves";
import { type OrdersTotals, ordersTotals, priceHintPercent } from "@/domain/order-totals";
import type { PaymentType } from "@/domain/payment-types";
import type { Actor } from "@/domain/permissions";
import { type Executor, authorize, authorizeList, branchFilter } from "@/server/authorize";
import {
  branches,
  categories,
  departments,
  orderEvents,
  orderExtras,
  orders,
  productVariants,
  products,
  units,
  users,
} from "@/server/db/schema";
import { orderState } from "@/server/order-moves";
import { readSettings } from "@/server/settings";

import { type ListFilters, NO_FILTERS, numberParts } from "../list-filters";

// The order list on /orders (05-order-request-form.md, Group rows; Ticking and filters;
// 11-screens-and-ux.md, Order list layout; Rules for a smooth feel 8; plan of 2.8). Under
// `data.view` with the branch inside the SQL (developer-rules.md rule 4; 03 matrix "See orders,
// stock and reports"). The list holds every status but Draft: that is the draft wall too, inside
// the SQL (06 Statuses; decided item 1, Look first; .claude/rules/server-actions.md). The SQL only
// filters, groups, orders and pages; each number a group row shows is groupSummary() of its
// orders (decided item 3, Look first), and the ticked totals are ordersTotals() (08).

export type ListOrder = {
  id: string;
  number: string;
  revision: number;
  version: number;
  departmentName: string;
  /** Plain decimal text, without trailing zeros. */
  quantity: string;
  price: bigint;
  paymentType: PaymentType;
  neededBy: string;
  ownerName: string;
  submittedAt: Date;
  priority: "NORMAL" | "URGENT";
  priceHint: bigint | null;
};

export type OrderGroup = {
  /** branch, subtype and status: the group's key (decided item 4). */
  key: string;
  branchId: string;
  branchCode: string;
  variantId: string;
  productName: string;
  /** The subtype's name; null for the hidden default subtype of a product without subtypes. */
  subtypeName: string | null;
  unitShortName: string;
  status: ListStatus;
  summary: GroupSummary;
  orders: ListOrder[];
};

export type OrderGroupPage = { groups: OrderGroup[]; page: number; pages: number; total: number };

const pageInput = z.number().int().min(1).catch(1);
const idsInput = z
  .array(z.uuid())
  .max(ORDER_ACTION_MAX)
  .refine((ids) => new Set(ids).size === ids.length, "An order is ticked twice");

const DATE_COLUMNS = {
  created: orders.createdAt,
  submitted: orders.submittedAt,
  approved: orders.approvedAt,
  closed: orders.closedAt,
} as const;

/** The counter of an order number as an integer, so 10000 comes after 9999 (05 Order number 2). */
const counter = sql`split_part(${orders.number}, '-', 3)::bigint`;
const prefix = sql`split_part(${orders.number}, '-', 1) || '-' || split_part(${orders.number}, '-', 2)`;

/** The walls and the filters of the list, inside the SQL. */
function listWhere(actor: Actor, filters: ListFilters): SQL | undefined {
  const dateColumn = DATE_COLUMNS[filters.dates];
  const from = filters.numberFrom ? numberParts(filters.numberFrom) : null;
  const to = filters.numberTo ? numberParts(filters.numberTo) : null;
  const range = from ?? to;
  return and(
    // The draft wall and decided item 1: no Draft is in the list.
    ne(orders.status, "DRAFT"),
    branchFilter(actor, orders.branchId),
    filters.branch ? eq(orders.branchId, filters.branch) : undefined,
    filters.status ? eq(orders.status, filters.status) : undefined,
    filters.owner ? eq(orders.ownerId, filters.owner) : undefined,
    filters.department ? eq(orders.departmentId, filters.department) : undefined,
    filters.category
      ? inArray(
          orders.variantId,
          sql`(select pv.id from product_variants pv join products p on p.id = pv.product_id where p.category_id = ${filters.category})`,
        )
      : undefined,
    filters.payment ? eq(orders.paymentType, filters.payment) : undefined,
    filters.urgent ? eq(orders.priority, "URGENT") : undefined,
    // Tashkent days, inclusive, as UTC bounds (CLAUDE.md rule 10; decided item 11, Look first).
    filters.from ? gte(dateColumn, businessDayStart(filters.from)) : undefined,
    filters.to ? lt(dateColumn, businessDayStart(nextBusinessDate(filters.to))) : undefined,
    // Decided item 10: the same branch code and year, the counter between the bounds.
    range ? sql`${prefix} = ${range.prefix}` : undefined,
    from ? sql`${counter} >= ${from.counter}` : undefined,
    to ? sql`${counter} <= ${to.counter}` : undefined,
    filters.action
      ? inArray(
          orders.id,
          sql`(select ${orderEvents.orderId} from ${orderEvents} where ${orderEvents.actionId} = ${filters.action})`,
        )
      : undefined,
  );
}

const GROUP_BY = [
  orders.branchId,
  orders.variantId,
  orders.status,
  branches.code,
  products.name,
  productVariants.name,
  productVariants.isDefault,
  units.shortName,
] as const;

/**
 * The order of the groups (decided items 9 and 14): Urgent first for approvers, then the sort,
 * then branch code, product, subtype, status in the table's order. `over` makes each aggregate a
 * window over the order's group, so "Select all" takes the orders in the list's order.
 */
function groupOrder(actor: Actor, sort: ListFilters["sort"], over: boolean): SQL[] {
  const of = (aggregate: SQL) =>
    over
      ? sql`${aggregate} over (partition by ${orders.branchId}, ${orders.variantId}, ${orders.status})`
      : aggregate;
  const keys: SQL[] = [];
  if (pinsUrgent(actor.role)) keys.push(desc(of(sql`bool_or(${orders.priority} = 'URGENT')`)));
  if (sort === "neededBy") keys.push(asc(of(sql`min(${orders.neededBy})`)));
  if (sort === "submitted") {
    keys.push(asc(of(sql`min(${orders.submittedAt})`)), asc(of(sql`min(${counter})`)));
  }
  if (sort === "product") keys.push(asc(products.name), sql`${productVariants.isDefault} desc`);
  keys.push(
    asc(branches.code),
    asc(products.name),
    sql`${productVariants.isDefault} desc`,
    asc(productVariants.name),
    asc(orders.status),
    asc(orders.branchId),
    asc(orders.variantId),
  );
  return keys;
}

/** The orders inside a group: oldest first, the lower number first (05 Group rows 6). */
const MEMBER_ORDER = [asc(orders.submittedAt), asc(counter), asc(orders.id)];

const groupKey = (branchId: string, variantId: string, status: string) =>
  `${branchId}:${variantId}:${status}`;

/** Checks the `branch` filter: another branch is "Not found" (03 rule 1; decided item 12). */
async function authorizeFilters(userId: string, filters: ListFilters): Promise<Actor> {
  const actor = await authorizeList(userId, "data.view");
  if (filters.branch) await authorize(userId, "data.view", { branchId: filters.branch });
  return actor;
}

/** The extra costs of orders, by order. */
async function extrasOf(executor: Executor, ids: readonly string[]) {
  const map = new Map<string, bigint[]>();
  if (ids.length === 0) return map;
  const rows = await executor
    .select({ orderId: orderExtras.orderId, amount: orderExtras.amount })
    .from(orderExtras)
    .where(inArray(orderExtras.orderId, [...ids]))
    .orderBy(asc(orderExtras.createdAt), asc(orderExtras.id));
  for (const row of rows) map.set(row.orderId, [...(map.get(row.orderId) ?? []), row.amount]);
  return map;
}

/**
 * One page of group rows, 25 a page; a page past the last gives the last. Each group holds its
 * orders of the filter (decided item 15).
 */
export async function listOrderGroups(
  userId: string,
  filters: ListFilters = NO_FILTERS,
  page = 1,
): Promise<OrderGroupPage> {
  const actor = await authorizeFilters(userId, filters);
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const where = listWhere(actor, filters);

  const grouped = db
    .select({ branchId: orders.branchId })
    .from(orders)
    .where(where)
    .groupBy(orders.branchId, orders.variantId, orders.status)
    .as("grouped");
  const [counted] = await db.select({ total: count() }).from(grouped);
  const total = counted?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ORDER_LIST_PAGE_SIZE));
  const shown = Math.min(pageInput.parse(page), pages);

  const heads = await db
    .select({
      branchId: orders.branchId,
      variantId: sql<string>`${orders.variantId}`,
      status: orders.status,
      branchCode: branches.code,
      productName: products.name,
      variantName: productVariants.name,
      variantIsDefault: productVariants.isDefault,
      unitShortName: units.shortName,
    })
    .from(orders)
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .innerJoin(productVariants, eq(productVariants.id, orders.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .where(where)
    .groupBy(...GROUP_BY)
    .orderBy(...groupOrder(actor, filters.sort, false))
    .limit(ORDER_LIST_PAGE_SIZE)
    .offset((shown - 1) * ORDER_LIST_PAGE_SIZE);
  if (heads.length === 0) return { groups: [], page: shown, pages, total };

  const owner = users;
  const members = await db
    .select({
      id: orders.id,
      number: orders.number,
      revision: orders.revision,
      version: orders.version,
      branchId: orders.branchId,
      variantId: orders.variantId,
      status: orders.status,
      departmentName: departments.name,
      quantity: orders.plannedQty,
      price: orders.plannedPrice,
      paymentType: orders.paymentType,
      neededBy: orders.neededBy,
      ownerName: owner.fullName,
      submittedAt: orders.submittedAt,
      priority: orders.priority,
      referencePrice: productVariants.referencePrice,
    })
    .from(orders)
    .innerJoin(owner, eq(owner.id, orders.ownerId))
    .innerJoin(departments, eq(departments.id, orders.departmentId))
    .innerJoin(productVariants, eq(productVariants.id, orders.variantId))
    .where(
      and(
        where,
        or(
          ...heads.map((head) =>
            and(
              eq(orders.branchId, head.branchId),
              eq(orders.variantId, head.variantId),
              eq(orders.status, head.status),
            ),
          ),
        ),
      ),
    )
    .orderBy(...MEMBER_ORDER);
  const extras = await extrasOf(
    db,
    members.map((member) => member.id),
  );
  const threshold = (await readSettings(db)).price_hint_percent;

  const byGroup = new Map<string, { order: ListOrder; extras: bigint[] }[]>();
  for (const member of members) {
    // Outside DRAFT the plan is complete (`orders_submitted_plan_check`).
    const order: ListOrder = {
      id: member.id,
      number: member.number!,
      revision: member.revision,
      version: member.version,
      departmentName: member.departmentName,
      quantity: plainQuantity(member.quantity!),
      price: member.price!,
      paymentType: member.paymentType,
      neededBy: member.neededBy!,
      ownerName: member.ownerName,
      submittedAt: member.submittedAt!,
      priority: member.priority,
      priceHint: priceHintPercent(member.price, member.referencePrice, threshold),
    };
    const key = groupKey(member.branchId, member.variantId!, member.status);
    byGroup.set(key, [...(byGroup.get(key) ?? []), { order, extras: extras.get(member.id) ?? [] }]);
  }

  const groups = heads.map((head): OrderGroup => {
    const key = groupKey(head.branchId, head.variantId, head.status);
    const held = byGroup.get(key) ?? [];
    return {
      key,
      branchId: head.branchId,
      branchCode: head.branchCode,
      variantId: head.variantId,
      productName: head.productName,
      subtypeName: head.variantIsDefault ? null : head.variantName,
      unitShortName: head.unitShortName,
      status: head.status as ListStatus,
      summary: groupSummary(
        held.map(({ order, extras: amounts }) => ({
          quantity: order.quantity,
          price: order.price,
          extras: amounts,
          paymentType: order.paymentType,
          neededBy: order.neededBy,
          priority: order.priority,
          priceHint: order.priceHint,
        })),
      ),
      orders: held.map(({ order }) => order),
    };
  });
  return { groups, page: shown, pages, total };
}

/**
 * "Select all on this filter" (05 Ticking and filters): the matching orders in the list's order,
 * at most 200, and how many match (decided item 6).
 */
export async function selectAllOnFilter(
  userId: string,
  filters: ListFilters = NO_FILTERS,
): Promise<{ orders: { id: string; version: number }[]; matching: number }> {
  const actor = await authorizeFilters(userId, filters);
  const { db } = await import("@/server/db/client");
  const where = listWhere(actor, filters);
  const [counted] = await db.select({ total: count() }).from(orders).where(where);
  const rows = await db
    .select({ id: orders.id, version: orders.version })
    .from(orders)
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .innerJoin(productVariants, eq(productVariants.id, orders.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(where)
    .orderBy(...groupOrder(actor, filters.sort, true), ...MEMBER_ORDER)
    .limit(ORDER_ACTION_MAX);
  return { orders: rows, matching: counted?.total ?? 0 };
}

export type TickedSummary = {
  count: number;
  /** Ticked ids the list no longer holds for this user: unknown, unseen or a Draft now. */
  missing: string[];
  totals: OrdersTotals;
  /** The moves the state machine allows on every ticked order (06 rule 8; decided item 7). */
  actions: OrderAction[];
};

/**
 * The action bar of the ticked orders (11 Order list layout 4): their count and totals and the
 * actions allowed on all of them. An id the user may not see, an unknown id and a Draft are
 * dropped alike and named in `missing`, so the answer tells nothing about them (03 rule 1;
 * decided item 16). At most 200 ids, none twice (06 rule 8).
 */
export async function tickedSummary(
  userId: string,
  orderIds: readonly string[],
): Promise<TickedSummary> {
  const actor = await authorizeList(userId, "data.view");
  const ids = idsInput.parse(orderIds);
  const none: TickedSummary = {
    count: 0,
    missing: [],
    totals: ordersTotals([]),
    actions: [],
  };
  if (ids.length === 0) return none;
  const { db } = await import("@/server/db/client");
  const creator = sql`(select c.role from users c where c.id = ${orders.createdBy})`;
  const found = await db
    .select({
      id: orders.id,
      branchId: orders.branchId,
      ownerId: orders.ownerId,
      status: orders.status,
      version: orders.version,
      revision: orders.revision,
      progress: orders.progress,
      createdByHead: sql<boolean>`${creator} = 'HEAD'`,
      // As the action wrapper reads it (src/server/order-action.ts): the Head, or a Manager whose
      // CLOSE_ALONE is not switched off.
      ownerClosesAlone: sql<boolean>`(select w.role = 'HEAD' or (w.role = 'MANAGER' and not exists (
        select 1 from manager_rights mr
        where mr.user_id = w.id and mr."right" = 'CLOSE_ALONE' and not mr.enabled
      )) from users w where w.id = ${orders.ownerId})`,
      quantity: orders.plannedQty,
      price: orders.plannedPrice,
      paymentType: orders.paymentType,
    })
    .from(orders)
    .where(and(inArray(orders.id, ids), listWhere(actor, NO_FILTERS)));
  const extras = await extrasOf(
    db,
    found.map((row) => row.id),
  );
  const seen = new Set(found.map((row) => row.id));
  return {
    count: found.length,
    missing: ids.filter((id) => !seen.has(id)),
    totals: ordersTotals(
      found.map((row) => ({
        quantity: row.quantity!,
        price: row.price!,
        extras: extras.get(row.id) ?? [],
        paymentType: row.paymentType,
      })),
    ),
    actions: allowedActions(actor, found.map(orderState)),
  };
}

export type FilterChoice = { id: string; name: string; isActive: boolean };

export type ListFilterChoices = {
  owners: FilterChoice[];
  departments: (FilterChoice & { branchCode: string })[];
  categories: FilterChoice[];
};

/**
 * The choices of the owner, department and category filters: only of the branches the user sees
 * (03 rule 1; decided item 12). Owners are the owners of the list's orders; inactive entries stay,
 * marked, so an old order can still be found.
 */
export async function listOrderFilterChoices(userId: string): Promise<ListFilterChoices> {
  const actor = await authorizeList(userId, "data.view");
  const { db } = await import("@/server/db/client");
  const owners = await db
    .selectDistinct({ id: users.id, name: users.fullName, isActive: users.isActive })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.ownerId))
    .where(listWhere(actor, NO_FILTERS))
    .orderBy(asc(users.fullName), asc(users.id));
  const departmentRows = await db
    .select({
      id: departments.id,
      name: departments.name,
      isActive: departments.isActive,
      branchCode: branches.code,
    })
    .from(departments)
    .innerJoin(branches, eq(branches.id, departments.branchId))
    .where(branchFilter(actor, departments.branchId))
    .orderBy(asc(branches.code), asc(departments.name), asc(departments.id));
  const categoryRows = await db
    .select({ id: categories.id, name: categories.name, isActive: categories.isActive })
    .from(categories)
    .orderBy(asc(categories.name), asc(categories.id));
  return { owners, departments: departmentRows, categories: categoryRows };
}
