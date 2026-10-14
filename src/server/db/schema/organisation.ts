import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { MANAGER_RIGHTS } from "@/domain/permissions";

import { userRole, users } from "./users";

// The branches and who works in which, from the "Organisation and catalogs" group of
// docs/spec/14-data-model.md: branches, user_branches, manager_rights. Task 0.7.

const moment = (name: string) => timestamp(name, { withTimezone: true });

/** The nine Manager rights the Head can switch off; the one list is in src/domain/permissions.ts. */
export const managerRight = pgEnum("manager_right", MANAGER_RIGHTS);

// 04-catalogs.md, Branches: "The code is 2 to 4 Latin capital letters, unique"; rule 3: names
// unique "ignoring capital letters and extra spaces". Both stay held when a branch is
// deactivated (plan of 0.7, decision 8; D41): the code is used in order numbers.
export const branches = pgTable(
  "branches",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    code: text("code").notNull(),
    address: text("address").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    unique("branches_code_key").on(table.code),
    check("branches_code_check", sql`${table.code} ~ '^[A-Z]{2,4}$'`),
    check("branches_name_check", sql`btrim(${table.name}) <> ''`),
    check("branches_address_check", sql`btrim(${table.address}) <> ''`),
    uniqueIndex("branches_name_key").using(
      "btree",
      sql`lower(regexp_replace(btrim(${table.name}), '\\s+', ' ', 'g'))`,
    ),
  ],
);

// "no rows for HEAD, exactly one row for PRINCIPAL, and at most one active PRINCIPAL per branch"
// (14-data-model.md). A partial index cannot read `users`, so the user's role and active flag
// are copied here and held equal by a composite foreign key ON UPDATE CASCADE (plan of 0.7,
// decision 1, an amendment of constraint style 9 for copied columns only). The "at least one"
// half for a Principal is the deferred trigger written by hand in migration 0002.
export const userBranches = pgTable(
  "user_branches",
  {
    userId: uuid("user_id").notNull(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    userRole: userRole("user_role").notNull(),
    userIsActive: boolean("user_is_active").notNull(),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [
    primaryKey({ name: "user_branches_pkey", columns: [table.userId, table.branchId] }),
    foreignKey({
      name: "user_branches_user_fk",
      columns: [table.userId, table.userRole, table.userIsActive],
      foreignColumns: [users.id, users.role, users.isActive],
    }).onUpdate("cascade"),
    index("user_branches_branch_id_idx").on(table.branchId),
    check("user_branches_user_role_check", sql`${table.userRole} <> 'HEAD'`),
    uniqueIndex("user_branches_principal_user_id_key")
      .on(table.userId)
      .where(sql`${table.userRole} = 'PRINCIPAL'`),
    uniqueIndex("user_branches_active_principal_branch_id_key")
      .on(table.branchId)
      .where(sql`${table.userRole} = 'PRINCIPAL' AND ${table.userIsActive}`),
  ],
);

// "No row means enabled" (14-data-model.md). `enabled` is switched in place by the Head (1.4);
// the history is the audit row (plan of 0.7, decision 9).
export const managerRights = pgTable(
  "manager_rights",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    right: managerRight("right").notNull(),
    enabled: boolean("enabled").notNull(),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [primaryKey({ name: "manager_rights_pkey", columns: [table.userId, table.right] })],
);
