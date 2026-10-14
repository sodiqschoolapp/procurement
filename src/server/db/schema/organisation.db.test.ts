import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { refusalOf } from "../../../../tests/helpers/database-error";

// The constraints of migration 0002_permissions (developer-rules.md rule 5: "Database tests that
// try the forbidden write directly"; docs/decisions.md 0.2, constraint style 12; D39, D40). Every
// write is plain SQL with nothing in front of it. 14-data-model.md: branches, user_branches,
// manager_rights; 04-catalogs.md: Branches, rule 3.

const AT = "2031-03-10T04:00:00Z";
const MISSING = "00000000-0000-4000-8000-000000000000";
let made = 0;

type Executor = Pick<typeof db, "execute">;

function next(): number {
  made += 1;
  return made;
}

/** A code of three capital letters from a count, so every branch of the file has its own. */
function codeOf(count: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return [676, 26, 1].map((size) => letters[Math.floor(count / size) % 26]).join("");
}

function branchWith(columns: { name?: string; code?: string; address?: string } = {}) {
  const count = next();
  return db.execute<{ id: string }>(sql`
    insert into branches (name, code, address, created_at)
    values (${columns.name ?? `Sinov filiali ${count}`}, ${columns.code ?? codeOf(count)},
            ${columns.address ?? "Sinov ko'chasi 1"}, ${AT})
    returning id`);
}

async function branch(): Promise<string> {
  return (await branchWith()).rows[0]!.id;
}

/** A user with plain SQL. A Principal must get its row in the same transaction (the trigger). */
async function plainUser(
  role: string,
  isActive = true,
  executor: Executor = db,
): Promise<string> {
  const count = next();
  const found = await executor.execute<{ id: string }>(sql`
    insert into users (full_name, username, email, phone, role, is_active, created_at, updated_at)
    values ('Invented Person', ${`invented_${count}`}, ${`invented_${count}@users.invalid`},
            '+998 90 000 00 00', ${role}::user_role, ${isActive}, ${AT}, ${AT})
    returning id`);
  return found.rows[0]!.id;
}

function link(
  userId: string,
  branchId: string,
  role: string,
  isActive = true,
  executor: Executor = db,
) {
  return executor.execute(sql`
    insert into user_branches (user_id, branch_id, user_role, user_is_active, created_at)
    values (${userId}, ${branchId}, ${role}::user_role, ${isActive}, ${AT})`);
}

/** A Principal of a branch, written with its row in one transaction. */
async function principalOf(branchId: string, isActive = true): Promise<string> {
  return db.transaction(async (tx) => {
    const id = await plainUser("PRINCIPAL", isActive, tx);
    await link(id, branchId, "PRINCIPAL", isActive, tx);
    return id;
  });
}

const PRINCIPAL_HAS_ONE_BRANCH = {
  code: "23514",
  constraint: "user_branches_principal_has_one_branch",
  table: "user_branches",
};

describe("branches (04-catalogs.md: Branches, rule 3)", () => {
  it("refuses a lower-case code, a one-letter code and a five-letter code; takes 2 and 4 letters", async () => {
    for (const code of ["chl", "C", "CHLMB", "CH1"]) {
      expect(await refusalOf(branchWith({ code })), code).toMatchObject({
        code: "23514",
        constraint: "branches_code_check",
      });
    }
    await branchWith({ code: "XQ" });
    await branchWith({ code: "XQWZ" });
  });

  it("refuses a second branch with the same code", async () => {
    await branchWith({ code: "TWN" });
    expect(await refusalOf(branchWith({ code: "TWN" }))).toMatchObject({
      code: "23505",
      constraint: "branches_code_key",
    });
  });

  it("refuses a name that differs only in capital letters and spaces; takes another name", async () => {
    await branchWith({ name: "Chilonzor filiali" });
    expect(await refusalOf(branchWith({ name: "  chilonzor   FILIALI " }))).toMatchObject({
      code: "23505",
      constraint: "branches_name_key",
    });
    await branchWith({ name: "Chilonzor filiali 2" });
  });

  it("refuses a blank name and a blank address", async () => {
    expect(await refusalOf(branchWith({ name: "  " }))).toMatchObject({
      code: "23514",
      constraint: "branches_name_check",
    });
    expect(await refusalOf(branchWith({ address: " " }))).toMatchObject({
      code: "23514",
      constraint: "branches_address_check",
    });
  });
});

describe("user_branches: one active Principal per branch (14-data-model.md)", () => {
  it("refuses a second active Principal in one branch", async () => {
    const chl = await branch();
    await principalOf(chl);
    const refused = db.transaction(async (tx) => {
      const second = await plainUser("PRINCIPAL", true, tx);
      await link(second, chl, "PRINCIPAL", true, tx);
    });
    expect(await refusalOf(refused)).toMatchObject({
      code: "23505",
      constraint: "user_branches_active_principal_branch_id_key",
    });
  });

  it("takes a new Principal once the old one is inactive, and refuses reactivating the old one through the cascade", async () => {
    const chl = await branch();
    const old = await principalOf(chl);
    await db.execute(sql`update users set is_active = false where id = ${old}`);
    await principalOf(chl);
    expect(await refusalOf(db.execute(sql`update users set is_active = true where id = ${old}`)))
      .toMatchObject({
        code: "23505",
        constraint: "user_branches_active_principal_branch_id_key",
      });
  });

  it("keeps one active Principal per branch, not per school: Principals of two branches are both active", async () => {
    await principalOf(await branch());
    await principalOf(await branch());
  });
});

describe("user_branches: no rows for the Head (14-data-model.md)", () => {
  it("refuses a row for a Head; takes one for a Manager", async () => {
    const chl = await branch();
    const head = await plainUser("HEAD");
    expect(await refusalOf(link(head, chl, "HEAD"))).toMatchObject({
      code: "23514",
      constraint: "user_branches_user_role_check",
    });
    await link(await plainUser("MANAGER"), chl, "MANAGER");
  });

  it("refuses making a Manager with a branch the Head", async () => {
    const manager = await plainUser("MANAGER");
    await link(manager, await branch(), "MANAGER");
    expect(await refusalOf(db.execute(sql`update users set role = 'HEAD' where id = ${manager}`)))
      .toMatchObject({ code: "23514", constraint: "user_branches_user_role_check" });
  });
});

describe("user_branches: exactly one row for a Principal (14-data-model.md)", () => {
  it("refuses a Principal with two branches", async () => {
    const principal = await principalOf(await branch());
    expect(await refusalOf(link(principal, await branch(), "PRINCIPAL"))).toMatchObject({
      code: "23505",
      constraint: "user_branches_principal_user_id_key",
    });
  });

  it("refuses making a Manager with two branches a Principal", async () => {
    const manager = await plainUser("MANAGER");
    await link(manager, await branch(), "MANAGER");
    await link(manager, await branch(), "MANAGER");
    expect(
      await refusalOf(db.execute(sql`update users set role = 'PRINCIPAL' where id = ${manager}`)),
    ).toMatchObject({ code: "23505", constraint: "user_branches_principal_user_id_key" });
  });

  it("refuses at commit a Principal with no branch, active or not; takes a Manager and a Finance user with none", async () => {
    for (const isActive of [true, false]) {
      expect(await refusalOf(plainUser("PRINCIPAL", isActive)), String(isActive)).toMatchObject(
        PRINCIPAL_HAS_ONE_BRANCH,
      );
    }
    await plainUser("MANAGER");
    await plainUser("FINANCE");
  });

  it("takes a Principal and its row written in one transaction", async () => {
    const chl = await branch();
    const id = await principalOf(chl);
    const rows = await db.execute(sql`select 1 from user_branches where user_id = ${id}`);
    expect(rows.rows).toHaveLength(1);
    // Beside it, the same Principal without the row is refused (D40).
    expect(await refusalOf(plainUser("PRINCIPAL"))).toMatchObject(PRINCIPAL_HAS_ONE_BRANCH);
  });

  it("refuses making a Manager or a Finance user with no branch a Principal", async () => {
    for (const role of ["MANAGER", "FINANCE"]) {
      const user = await plainUser(role);
      expect(
        await refusalOf(db.execute(sql`update users set role = 'PRINCIPAL' where id = ${user}`)),
        role,
      ).toMatchObject(PRINCIPAL_HAS_ONE_BRANCH);
    }
  });

  it("takes making a Manager with one branch a Principal", async () => {
    const manager = await plainUser("MANAGER");
    await link(manager, await branch(), "MANAGER");
    await db.execute(sql`update users set role = 'PRINCIPAL' where id = ${manager}`);
    const rows = await db.execute<{ user_role: string }>(
      sql`select user_role from user_branches where user_id = ${manager}`,
    );
    expect(rows.rows).toEqual([{ user_role: "PRINCIPAL" }]);
  });

  it("refuses deleting the only row of a Principal, active or not", async () => {
    for (const isActive of [true, false]) {
      const principal = await principalOf(await branch(), isActive);
      expect(
        await refusalOf(db.execute(sql`delete from user_branches where user_id = ${principal}`)),
        String(isActive),
      ).toMatchObject(PRINCIPAL_HAS_ONE_BRANCH);
    }
  });

  it("refuses moving the only row of a Principal to another user, active or not", async () => {
    for (const isActive of [true, false]) {
      const principal = await principalOf(await branch(), isActive);
      const manager = await plainUser("MANAGER", isActive);
      // The row's role and active flag must match the new user, or the foreign key refuses first.
      const moved = db.execute(sql`
        update user_branches set user_id = ${manager}, user_role = 'MANAGER'
        where user_id = ${principal}`);
      expect(await refusalOf(moved), String(isActive)).toMatchObject(PRINCIPAL_HAS_ONE_BRANCH);
    }
  });
});

describe("user_branches: the copied role and active flag (plan of 0.7, decision 1)", () => {
  it("follows an update of the user's active flag and role", async () => {
    const manager = await plainUser("MANAGER");
    await link(manager, await branch(), "MANAGER");
    await db.execute(sql`update users set is_active = false where id = ${manager}`);
    await db.execute(sql`update users set role = 'FINANCE' where id = ${manager}`);
    const rows = await db.execute(
      sql`select user_role, user_is_active from user_branches where user_id = ${manager}`,
    );
    expect(rows.rows).toEqual([{ user_role: "FINANCE", user_is_active: false }]);
  });

  it("refuses a row whose role or active flag differs from the user's; takes the matching one", async () => {
    const chl = await branch();
    const manager = await plainUser("MANAGER");
    expect(await refusalOf(link(manager, chl, "FINANCE"))).toMatchObject({
      code: "23503",
      constraint: "user_branches_user_fk",
    });
    expect(await refusalOf(link(manager, chl, "MANAGER", false))).toMatchObject({
      code: "23503",
      constraint: "user_branches_user_fk",
    });
    await link(manager, chl, "MANAGER", true);
  });

  it("refuses a row for an unknown user and for an unknown branch", async () => {
    expect(await refusalOf(link(MISSING, await branch(), "MANAGER"))).toMatchObject({
      code: "23503",
      constraint: "user_branches_user_fk",
    });
    expect(await refusalOf(link(await plainUser("MANAGER"), MISSING, "MANAGER"))).toMatchObject({
      code: "23503",
      constraint: "user_branches_branch_id_branches_id_fk",
    });
  });
});

describe("manager_rights (14-data-model.md; 03-roles-and-permissions.md, Manager rights)", () => {
  function rightRow(userId: string, right: string) {
    return db.execute(sql`
      insert into manager_rights (user_id, "right", enabled, created_at)
      values (${userId}, ${right}::manager_right, false, ${AT})`);
  }

  it("refuses a second row for the same user and right; takes another right", async () => {
    const manager = await plainUser("MANAGER");
    await rightRow(manager, "ISSUE_STOCK");
    expect(await refusalOf(rightRow(manager, "ISSUE_STOCK"))).toMatchObject({
      code: "23505",
      constraint: "manager_rights_pkey",
    });
    await rightRow(manager, "SET_MINIMUMS");
  });

  it("refuses a right that is not one of the nine", async () => {
    expect(await refusalOf(rightRow(await plainUser("MANAGER"), "APPROVE_ALL"))).toMatchObject({
      code: "22P02",
    });
  });

  it("refuses a row for an unknown user", async () => {
    expect(await refusalOf(rightRow(MISSING, "ISSUE_STOCK"))).toMatchObject({
      code: "23503",
      constraint: "manager_rights_user_id_users_id_fk",
    });
  });
});
