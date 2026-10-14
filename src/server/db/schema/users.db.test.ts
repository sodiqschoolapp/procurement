import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { refusalOf } from "../../../../tests/helpers/database-error";

// The constraints of migration 0001_sign_in (developer-rules.md rule 5: "Database tests that
// try the forbidden write directly"; docs/decisions.md 0.2, constraint style 12; D39). Each
// write is plain SQL with nothing in front of it. 14-data-model.md: users, sessions, accounts.

const AT = "2031-03-10T04:00:00Z";
let made = 0;

/** Inserts a valid user with plain SQL and returns its id. */
async function plainUser(): Promise<string> {
  made += 1;
  const found = await db.execute<{ id: string }>(sql`
    insert into users (full_name, username, email, phone, role, created_at, updated_at)
    values ('Invented Person', ${`invented_${made}`}, ${`invented_${made}@users.invalid`},
            '+998 90 000 00 00', 'MANAGER', ${AT}, ${AT})
    returning id`);
  return found.rows[0]!.id;
}

function userWith(columns: Record<string, string>) {
  made += 1;
  const row: Record<string, string> = {
    full_name: "Invented Person",
    username: `invented_${made}`,
    email: `invented_${made}@users.invalid`,
    phone: "+998 90 000 00 00",
    role: "MANAGER",
    locale: "uz",
    ...columns,
  };
  return db.execute(sql`
    insert into users (full_name, username, email, phone, role, locale, created_at, updated_at)
    values (${row.full_name}, ${row.username}, ${row.email}, ${row.phone},
            ${row.role}::user_role, ${row.locale}::locale, ${AT}, ${AT})`);
}

function sessionFor(userId: string, token: string, expiresAt = "2031-03-11T04:00:00Z") {
  return db.execute(sql`
    insert into sessions (user_id, token, expires_at, created_at, updated_at)
    values (${userId}, ${token}, ${expiresAt}, ${AT}, ${AT})`);
}

function accountFor(userId: string, accountId: string, providerId = "credential") {
  return db.execute(sql`
    insert into accounts (user_id, account_id, provider_id, password, created_at, updated_at)
    values (${userId}, ${accountId}, ${providerId}, 'invented-hash', ${AT}, ${AT})`);
}

const MISSING_USER = "00000000-0000-4000-8000-000000000000";

describe("users constraints (14-data-model.md: users; developer-rules.md rule 5)", () => {
  it("refuses a second user with the same username", async () => {
    await userWith({ username: "invented_twin" });
    expect(await refusalOf(userWith({ username: "invented_twin" }))).toMatchObject({
      code: "23505",
      constraint: "users_username_key",
    });
  });

  it.each([
    ["an upper-case username", { username: "Invented_Upper" }, "users_username_check"],
    ["an empty username", { username: "" }, "users_username_check"],
    ["an empty full name", { full_name: "" }, "users_full_name_check"],
    ["a full name of spaces", { full_name: "   " }, "users_full_name_check"],
    ["an empty phone", { phone: "" }, "users_phone_check"],
    ["a phone of spaces", { phone: "  " }, "users_phone_check"],
  ])("refuses %s", async (_what, columns, constraint) => {
    expect(await refusalOf(userWith(columns))).toMatchObject({ code: "23514", constraint });
  });

  it("refuses a second user with the same email", async () => {
    await userWith({ email: "invented_same@users.invalid" });
    expect(await refusalOf(userWith({ email: "invented_same@users.invalid" }))).toMatchObject({
      code: "23505",
      constraint: "users_email_key",
    });
  });

  it("refuses a role and a language that are not in their lists", async () => {
    expect(await refusalOf(userWith({ role: "ADMIN" }))).toMatchObject({ code: "22P02" });
    expect(await refusalOf(userWith({ locale: "de" }))).toMatchObject({ code: "22P02" });
  });

  it.each([
    ["the username to upper case", sql`username = 'Invented_Changed'`, "users_username_check"],
    ["the full name to empty", sql`full_name = ''`, "users_full_name_check"],
    ["the phone to empty", sql`phone = ' '`, "users_phone_check"],
  ])("refuses an update of %s", async (_what, change, constraint) => {
    const id = await plainUser();
    expect(
      await refusalOf(db.execute(sql`update users set ${change} where id = ${id}`)),
    ).toMatchObject({ code: "23514", constraint });
  });
});

describe("sessions constraints (14-data-model.md: sessions; developer-rules.md rule 5)", () => {
  it("refuses a session of a user that does not exist", async () => {
    expect(await refusalOf(sessionFor(MISSING_USER, "invented_token_0"))).toMatchObject({
      code: "23503",
      constraint: "sessions_user_id_users_id_fk",
    });
  });

  it("refuses a second session with the same token", async () => {
    const id = await plainUser();
    await sessionFor(id, "invented_token_1");
    expect(await refusalOf(sessionFor(id, "invented_token_1"))).toMatchObject({
      code: "23505",
      constraint: "sessions_token_key",
    });
  });

  it("refuses a session that ends when it starts, on insert and on update", async () => {
    const id = await plainUser();
    expect(await refusalOf(sessionFor(id, "invented_token_2", AT))).toMatchObject({
      code: "23514",
      constraint: "sessions_expires_at_check",
    });

    await sessionFor(id, "invented_token_3");
    expect(
      await refusalOf(
        db.execute(
          sql`update sessions set expires_at = created_at where token = 'invented_token_3'`,
        ),
      ),
    ).toMatchObject({ code: "23514", constraint: "sessions_expires_at_check" });
  });
});

describe("accounts constraints (14-data-model.md: accounts; developer-rules.md rule 5)", () => {
  it("refuses an account of a user that does not exist", async () => {
    expect(await refusalOf(accountFor(MISSING_USER, MISSING_USER))).toMatchObject({
      code: "23503",
      constraint: "accounts_user_id_users_id_fk",
    });
  });

  it("refuses the same provider account twice", async () => {
    const first = await plainUser();
    const second = await plainUser();
    await accountFor(first, "invented_account");
    expect(await refusalOf(accountFor(second, "invented_account"))).toMatchObject({
      code: "23505",
      constraint: "accounts_provider_id_account_id_key",
    });
  });

  it("refuses a second password for one user", async () => {
    const id = await plainUser();
    await accountFor(id, `${id}`);
    expect(await refusalOf(accountFor(id, "invented_other"))).toMatchObject({
      code: "23505",
      constraint: "accounts_user_id_provider_id_key",
    });
  });
});
