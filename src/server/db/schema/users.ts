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
  uuid,
} from "drizzle-orm/pg-core";

// The users table of the "Organisation and catalogs" group of docs/spec/14-data-model.md, and
// the session tables the login library creates (the data model's last block: "sessions,
// accounts, verifications -- created by the login library"). Task 0.6.
//
// The library's own columns (email, email_verified, image, display_username, updated_at, the
// token columns of accounts) exist only because Better Auth reads and writes them; the plan of
// 0.6, "Database changes", lists where these tables differ from the constraint style of 0.2.
// The property names are the library's field names, so its Drizzle adapter finds them; only
// `name` is mapped onto `fullName` (src/server/auth/auth.ts).

export const userRole = pgEnum("user_role", ["HEAD", "MANAGER", "PRINCIPAL", "FINANCE"]);
export const locale = pgEnum("locale", ["uz", "ru", "en"]);

const moment = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    fullName: text("full_name").notNull(),
    username: text("username").notNull(),
    // The username as typed when the account was made; written by the username plugin.
    displayUsername: text("display_username"),
    // The placeholder `<user id>@users.invalid` (13-technology.md, Login: "the app fills in a
    // placeholder"); never shown and never mailed.
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    phone: text("phone").notNull(),
    role: userRole("role").notNull(),
    locale: locale("locale").notNull().default("uz"),
    isActive: boolean("is_active").notNull().default(true),
    // The browser-made id of the Head's create (developer-rules.md rule 8; plan of 1.3, "Database
    // changes"); none on a user made by the first-Head script, the seed or a test helper.
    clientKey: uuid("client_key"),
    // Empty until the user signs in for the first time.
    lastLoginAt: moment("last_login_at"),
    createdAt: moment("created_at").notNull(),
    updatedAt: moment("updated_at").notNull(),
  },
  (table) => [
    unique("users_username_key").on(table.username),
    unique("users_email_key").on(table.email),
    unique("users_client_key_key").on(table.clientKey),
    // The target of the foreign key of user_branches, which copies role and is_active (task 0.7).
    unique("users_id_role_is_active_key").on(table.id, table.role, table.isActive),
    check("users_full_name_check", sql`btrim(${table.fullName}) <> ''`),
    check(
      "users_username_check",
      sql`${table.username} = lower(${table.username}) AND ${table.username} <> ''`,
    ),
    check("users_phone_check", sql`btrim(${table.phone}) <> ''`),
    // A filter column of its list (developer-rules.md rule 12; plan of 9.2, decided item 3).
    index("users_full_name_idx").on(table.fullName),
  ],
);

// One row per signed-in device. Written by the library at sign-in with the times of our clock
// (the create hook of src/server/auth/auth.ts) and deleted at sign-out: the library's tokens,
// not records with data (plan of 0.6, Look first item 4).
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    token: text("token").notNull(),
    expiresAt: moment("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: moment("created_at").notNull(),
    updatedAt: moment("updated_at").notNull(),
  },
  (table) => [
    unique("sessions_token_key").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
    check("sessions_expires_at_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

// The password of a user: one `credential` account per user. The token columns are the
// library's and stay empty: there is no sign-in through another provider.
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: moment("access_token_expires_at"),
    refreshTokenExpiresAt: moment("refresh_token_expires_at"),
    scope: text("scope"),
    createdAt: moment("created_at").notNull(),
    updatedAt: moment("updated_at").notNull(),
  },
  (table) => [
    unique("accounts_provider_id_account_id_key").on(table.providerId, table.accountId),
    unique("accounts_user_id_provider_id_key").on(table.userId, table.providerId),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

// The library's table for e-mail verification, reset and magic links. All three are off, so
// nothing writes here; it exists because 14-data-model.md lists it (review of the plan of 0.6,
// correction 5).
export const verifications = pgTable("verifications", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: moment("expires_at").notNull(),
  createdAt: moment("created_at").notNull(),
  updatedAt: moment("updated_at").notNull(),
});

// Every sign-in try, for the limit of developer-rules.md rule 13 ("Login allows 5 tries per 15
// minutes"), counted per username (plan of 0.6, Look first item 1). Append-only: nothing
// updates or deletes a row.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // Lower-cased as typed, also a username that does not exist.
    username: text("username").notNull(),
    succeeded: boolean("succeeded").notNull(),
    createdAt: moment("created_at").notNull(),
  },
  (table) => [index("login_attempts_username_created_at_idx").on(table.username, table.createdAt)],
);
