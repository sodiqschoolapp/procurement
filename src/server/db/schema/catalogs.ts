import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { COMPANY_KINDS } from "@/domain/catalogs";
import { PRICE_SOURCES } from "@/domain/prices";
import { PRODUCT_TYPES } from "@/domain/products";

import { files } from "./files";
import { branches } from "./organisation";
import { purchases } from "./purchasing";
import { users } from "./users";

// Four catalogs of the "Organisation and catalogs" group of docs/spec/14-data-model.md: units
// (measures), categories, extra_cost_types, companies. Task 1.5. Names are unique "ignoring
// capital letters and extra spaces" (04-catalogs.md rule 3) through an index on the same
// expression as branches_name_key; a name stays held while an entry is inactive (D41: renaming
// the inactive entry frees it). Each table has a nullable unique client_key for safe repeats
// (developer-rules.md rule 8; plan of 1.5, decision 7) and an index on its filter column
// is_active (rule 12; plan review of 1.5, correction 1). Departments (task 1.6) follow the same
// pattern, their names unique inside their branch.

const moment = (name: string) => timestamp(name, { withTimezone: true });

/** BRAND, SUPPLIER or BOTH (14-data-model.md, companies). */
export const companyKind = pgEnum("company_kind", COMPANY_KINDS);

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);

export const units = pgTable(
  "units",
  {
    id: id(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    allowDecimal: boolean("allow_decimal").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    clientKey: uuid("client_key"),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("units_client_key_key").on(table.clientKey),
    check("units_name_check", sql`btrim(${table.name}) <> ''`),
    check("units_short_name_check", sql`btrim(${table.shortName}) <> ''`),
    uniqueIndex("units_name_key").using(
      "btree",
      sql`lower(regexp_replace(btrim(${table.name}), '\\s+', ' ', 'g'))`,
    ),
    // Two "kg" would be the duplicate rule 3 refuses, shown on every line (plan of 1.5, decision 4).
    uniqueIndex("units_short_name_key").using(
      "btree",
      sql`lower(regexp_replace(btrim(${table.shortName}), '\\s+', ' ', 'g'))`,
    ),
    index("units_is_active_idx").on(table.isActive),
    // A filter column of its list (developer-rules.md rule 12; plan of 9.2, decided item 3).
    index("units_name_idx").on(table.name),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: id(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    clientKey: uuid("client_key"),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("categories_client_key_key").on(table.clientKey),
    check("categories_name_check", sql`btrim(${table.name}) <> ''`),
    uniqueIndex("categories_name_key").using(
      "btree",
      sql`lower(regexp_replace(btrim(${table.name}), '\\s+', ' ', 'g'))`,
    ),
    index("categories_is_active_idx").on(table.isActive),
    // A filter column of its list (developer-rules.md rule 12; plan of 9.2, decided item 3).
    index("categories_name_idx").on(table.name),
  ],
);

export const extraCostTypes = pgTable(
  "extra_cost_types",
  {
    id: id(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    clientKey: uuid("client_key"),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("extra_cost_types_client_key_key").on(table.clientKey),
    check("extra_cost_types_name_check", sql`btrim(${table.name}) <> ''`),
    uniqueIndex("extra_cost_types_name_key").using(
      "btree",
      sql`lower(regexp_replace(btrim(${table.name}), '\\s+', ' ', 'g'))`,
    ),
    index("extra_cost_types_is_active_idx").on(table.isActive),
    // A filter column of its list (developer-rules.md rule 12; plan of 9.2, decided item 3).
    index("extra_cost_types_name_idx").on(table.name),
  ],
);

// The tax ID's and phone's formats are the domain's and the form's only; the database refuses a
// blank value (plan of 1.5, decision 5; decisions 1.2 item 9, 1.3 item 12).
export const companies = pgTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    kind: companyKind("kind").notNull(),
    taxId: text("tax_id"),
    phone: text("phone"),
    note: text("note"),
    isActive: boolean("is_active").notNull().default(true),
    clientKey: uuid("client_key"),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("companies_client_key_key").on(table.clientKey),
    check("companies_name_check", sql`btrim(${table.name}) <> ''`),
    check("companies_tax_id_check", sql`${table.taxId} IS NULL OR btrim(${table.taxId}) <> ''`),
    check("companies_phone_check", sql`${table.phone} IS NULL OR btrim(${table.phone}) <> ''`),
    check("companies_note_check", sql`${table.note} IS NULL OR btrim(${table.note}) <> ''`),
    uniqueIndex("companies_name_key").using(
      "btree",
      sql`lower(regexp_replace(btrim(${table.name}), '\\s+', ' ', 'g'))`,
    ),
    // The picker filters on both (a brand or a supplier picker, active only).
    index("companies_is_active_kind_idx").on(table.isActive, table.kind),
    // A filter column of its list (developer-rules.md rule 12; plan of 9.2, decided item 3).
    index("companies_name_idx").on(table.name),
  ],
);

// Departments (14-data-model.md, departments; 04-catalogs.md, Catalogs table: "Branch, name,
// responsible person (name and phone)"; A6: "Each department belongs to one branch"). Task 1.6.
// The name is unique inside its branch (04 rule 3), with the expression of the four catalogs above;
// the index starts with branch_id, so it also serves the foreign key (developer-rules.md rule 12).
// The responsible person is plain text, optional; a blank value is refused (plan of 1.6, decision
// 4). The branch never changes after creation: the actions hold it (decision 1).
export const departments = pgTable(
  "departments",
  {
    id: id(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: text("name").notNull(),
    responsibleName: text("responsible_name"),
    responsiblePhone: text("responsible_phone"),
    isActive: boolean("is_active").notNull().default(true),
    clientKey: uuid("client_key"),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("departments_client_key_key").on(table.clientKey),
    // The target of the orders' composite foreign key (department_id, branch_id): an order's
    // department is of the order's branch (A6; plan of 2.4, decision 3, Look first).
    unique("departments_id_branch_id_key").on(table.id, table.branchId),
    check("departments_name_check", sql`btrim(${table.name}) <> ''`),
    check(
      "departments_responsible_name_check",
      sql`${table.responsibleName} IS NULL OR btrim(${table.responsibleName}) <> ''`,
    ),
    check(
      "departments_responsible_phone_check",
      sql`${table.responsiblePhone} IS NULL OR btrim(${table.responsiblePhone}) <> ''`,
    ),
    uniqueIndex("departments_branch_name_key").using(
      "btree",
      table.branchId,
      sql`lower(regexp_replace(btrim(${table.name}), '\\s+', ' ', 'g'))`,
    ),
    index("departments_is_active_idx").on(table.isActive),
  ],
);

/** GOODS or SERVICE (14-data-model.md, products.type; A7). */
export const productType = pgEnum("product_type", PRODUCT_TYPES);

// Products and services (14-data-model.md, products; 04-catalogs.md, Catalogs table; A7). Task
// 1.7. The name is unique across products and services together, with the expression of the
// catalogs above (04 rule 3; plan of 1.7, decision 9). A new item is GOODS unless SERVICE is chosen
// (decision 8). Category and measure are required; photo, default company, reference price and
// description are optional (decision 6). The reference price is whole so'm in bigint, more than 0
// (05-order-request-form.md, Line field 10; developer-rules.md rule 6); it is set at creation and
// changes only through a new price with a note (1.9; decision 2, Look first). A file is held by
// one record only (src/server/files/owners.ts), so the photo is unique. `has_variants` (1.8) says
// whether the product has real subtypes; with false its one subtype is the hidden default.
export const products = pgTable(
  "products",
  {
    id: id(),
    name: text("name").notNull(),
    type: productType("type").notNull().default("GOODS"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    photoFileId: uuid("photo_file_id").references(() => files.id),
    defaultCompanyId: uuid("default_company_id").references(() => companies.id),
    referencePrice: bigint("reference_price", { mode: "bigint" }),
    description: text("description"),
    hasVariants: boolean("has_variants").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    // The Manager who added it from an order's product search, and when the Head marked it
    // checked (04-catalogs.md rule 8; 14 products; task 1.12b).
    addedBy: uuid("added_by").references((): AnyPgColumn => users.id),
    checkedAt: moment("checked_at"),
    clientKey: uuid("client_key"),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("products_client_key_key").on(table.clientKey),
    // Only an entry a Manager added is marked checked (plan of 1.12b, Database changes).
    check(
      "products_checked_at_check",
      sql`${table.checkedAt} IS NULL OR ${table.addedBy} IS NOT NULL`,
    ),
    index("products_added_by_idx").on(table.addedBy),
    unique("products_photo_file_id_key").on(table.photoFileId),
    check("products_name_check", sql`btrim(${table.name}) <> ''`),
    check(
      "products_description_check",
      sql`${table.description} IS NULL OR btrim(${table.description}) <> ''`,
    ),
    check(
      "products_reference_price_check",
      sql`${table.referencePrice} IS NULL OR ${table.referencePrice} > 0`,
    ),
    uniqueIndex("products_name_key").using(
      "btree",
      sql`lower(regexp_replace(btrim(${table.name}), '\\s+', ' ', 'g'))`,
    ),
    index("products_category_id_idx").on(table.categoryId),
    index("products_unit_id_idx").on(table.unitId),
    index("products_default_company_id_idx").on(table.defaultCompanyId),
    index("products_is_active_idx").on(table.isActive),
    index("products_type_idx").on(table.type),
    // A filter column of its list (developer-rules.md rule 12; plan of 9.2, decided item 3).
    index("products_name_idx").on(table.name),
  ],
);

// Subtypes (14-data-model.md, product_variants; 04-catalogs.md, Catalogs table: Subtypes; rules 1
// and 3). Task 1.8. Every product has at least one row: a product without subtypes has one hidden
// row, `is_default`, named "default" (04 rule 1). Names are unique inside the product with the
// expression of the catalogs above (04 rule 3). The first real subtype of a product is its default
// row made real, same id (plan of 1.8, decision 1, Look first). The reference price is whole so'm,
// optional, more than 0, with no fallback to the product's (decisions 2 and 4, Look first). The
// last purchase columns are written by purchases (3.x; decision 10). Migration 0013 adds by hand
// what Drizzle cannot express: the deferred shape trigger (at least one row; `has_variants` agrees
// with the rows), the delete guard and the update guard on `product_id` and `is_default`.
export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    photoFileId: uuid("photo_file_id").references(() => files.id),
    referencePrice: bigint("reference_price", { mode: "bigint" }),
    lastPurchasePrice: bigint("last_purchase_price", { mode: "bigint" }),
    lastPurchaseAt: moment("last_purchase_at"),
    isActive: boolean("is_active").notNull().default(true),
    // As on products (04-catalogs.md rule 8; task 1.12b).
    addedBy: uuid("added_by").references((): AnyPgColumn => users.id),
    checkedAt: moment("checked_at"),
    clientKey: uuid("client_key"),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("product_variants_client_key_key").on(table.clientKey),
    check(
      "product_variants_checked_at_check",
      sql`${table.checkedAt} IS NULL OR ${table.addedBy} IS NOT NULL`,
    ),
    index("product_variants_added_by_idx").on(table.addedBy),
    unique("product_variants_photo_file_id_key").on(table.photoFileId),
    check("product_variants_name_check", sql`btrim(${table.name}) <> ''`),
    check(
      "product_variants_reference_price_check",
      sql`${table.referencePrice} IS NULL OR ${table.referencePrice} > 0`,
    ),
    check(
      "product_variants_last_purchase_price_check",
      sql`${table.lastPurchasePrice} IS NULL OR ${table.lastPurchasePrice} > 0`,
    ),
    uniqueIndex("product_variants_product_name_key").using(
      "btree",
      table.productId,
      sql`lower(regexp_replace(btrim(${table.name}), '\\s+', ' ', 'g'))`,
    ),
    uniqueIndex("product_variants_default_key")
      .on(table.productId)
      .where(sql`${table.isDefault}`),
    index("product_variants_product_id_idx").on(table.productId),
    index("product_variants_is_active_idx").on(table.isActive),
  ],
);

/** HEAD or PURCHASE (14-data-model.md, price_history.source). */
export const priceSource = pgEnum("price_source", PRICE_SOURCES);

// Price history (14-data-model.md, price_history: "one row each time the Head sets a price or a
// purchase is recorded"; 04-catalogs.md rule 4). Task 1.9. A HEAD row for every price the Head
// sets, the price typed at creation included, with no note then (plan of 1.9, decision 1, Look
// first); a new price carries its short note. PURCHASE rows and the foreign key of `purchase_id`
// come with 3.2 (build-plan 1.9; a plain key, price_history has no branch: plan of 3.2, decided
// item 2); a PURCHASE row names its purchase and a HEAD row none (decision 10). `seq` orders the rows without a tie (the clock is frozen in tests, and two writes can share
// a moment; plan review of 1.9, Must fix 1). Migration 0014 adds by hand what Drizzle cannot
// express: the append-only trigger (decision 3, Look first), the deferred check that a subtype's
// reference price is the price of its newest HEAD row (decision 2, Look first), and the backfill.
export const priceHistory = pgTable(
  "price_history",
  {
    id: id(),
    seq: bigint("seq", { mode: "bigint" }).generatedAlwaysAsIdentity().notNull(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id),
    price: bigint("price", { mode: "bigint" }).notNull(),
    source: priceSource("source").notNull(),
    note: text("note"),
    setBy: uuid("set_by")
      .notNull()
      .references(() => users.id),
    purchaseId: uuid("purchase_id").references((): AnyPgColumn => purchases.id),
    clientKey: uuid("client_key"),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("price_history_seq_key").on(table.seq),
    unique("price_history_client_key_key").on(table.clientKey),
    check("price_history_price_check", sql`${table.price} > 0`),
    check("price_history_note_check", sql`${table.note} IS NULL OR btrim(${table.note}) <> ''`),
    check(
      "price_history_purchase_check",
      sql`(${table.source} = 'HEAD') = (${table.purchaseId} IS NULL)`,
    ),
    index("price_history_variant_id_seq_idx").on(table.variantId, table.seq.desc()),
    index("price_history_set_by_idx").on(table.setBy),
    index("price_history_purchase_id_idx").on(table.purchaseId),
  ],
);
