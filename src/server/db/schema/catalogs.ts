import { sql } from "drizzle-orm";
import {
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

// Four catalogs of the "Organisation and catalogs" group of docs/spec/14-data-model.md: units
// (measures), categories, extra_cost_types, companies. Task 1.5. Names are unique "ignoring
// capital letters and extra spaces" (04-catalogs.md rule 3) through an index on the same
// expression as branches_name_key; a name stays held while an entry is inactive (D41: renaming
// the inactive entry frees it). Each table has a nullable unique client_key for safe repeats
// (developer-rules.md rule 8; plan of 1.5, decision 7) and an index on its filter column
// is_active (rule 12; plan review of 1.5, correction 1).

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
  ],
);
