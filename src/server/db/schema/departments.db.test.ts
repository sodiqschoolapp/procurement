import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { refusalOf } from "../../../../tests/helpers/database-error";

// The constraints of migration 0011_departments (developer-rules.md rule 5: "Database tests that
// try the forbidden write directly"; D39: every guard on INSERT and on UPDATE, plain SQL with
// nothing in front; D40: each refused write beside an accepted one). 14-data-model.md: departments;
// 04-catalogs.md rule 3 ("department names inside a branch", ignoring capital letters and extra
// spaces); A6 ("Each department belongs to one branch"); plan of 1.6 and its review.

const AT = "2031-04-11T05:00:00Z";
let made = 0;

type Row = {
  name?: string;
  responsibleName?: string | null;
  responsiblePhone?: string | null;
  clientKey?: string | null;
};

/** One department with plain SQL; what is not given is unique to the row. */
async function insert(branchId: string, row: Row = {}): Promise<string> {
  made += 1;
  const found = await db.execute<{ id: string }>(sql`
    insert into departments
      (branch_id, name, responsible_name, responsible_phone, client_key, created_at)
    values (${branchId}, ${row.name ?? `Bo'lim ${made}`}, ${row.responsibleName ?? null},
            ${row.responsiblePhone ?? null}, ${row.clientKey ?? null}, ${AT})
    returning id`);
  return found.rows[0]!.id;
}

function update(id: string, column: string, value: string | null) {
  return db.execute(
    sql`update departments set ${sql.identifier(column)} = ${value} where id = ${id}`,
  );
}

describe("departments: the name is unique inside its branch (04 rule 3)", () => {
  it("the same name in two branches is allowed (build-plan 1.6, Done when)", async () => {
    const first = await insertBranch();
    const second = await insertBranch();
    await insert(first.id, { name: "Oshxona" });
    await insert(second.id, { name: "Oshxona" });
    const found = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from departments
          where name = 'Oshxona' and branch_id in (${first.id}, ${second.id})`,
    );
    expect(found.rows[0]!.count).toBe(2);
  });

  it("on INSERT: twice in one branch is refused, also as ' KITCHEN  room ' against 'Kitchen room'", async () => {
    const branch = await insertBranch();
    await insert(branch.id, { name: "Kitchen room" });
    await insert(branch.id, { name: "Кухня" });
    expect(await refusalOf(insert(branch.id, { name: "Kitchen room" }))).toMatchObject({
      code: "23505",
      constraint: "departments_branch_name_key",
    });
    expect(await refusalOf(insert(branch.id, { name: " KITCHEN  room " }))).toMatchObject({
      code: "23505",
      constraint: "departments_branch_name_key",
    });
    expect(await refusalOf(insert(branch.id, { name: "КУХНЯ " }))).toMatchObject({
      code: "23505",
      constraint: "departments_branch_name_key",
    });
    await insert(branch.id, { name: "Kitchen store" });
  });

  it("on UPDATE: a rename into a name held in the branch, and a move into a branch holding it, are refused", async () => {
    const branch = await insertBranch();
    const other = await insertBranch();
    await insert(branch.id, { name: "Kutubxona" });
    const renamed = await insert(branch.id, { name: "Sport zali" });
    expect(await refusalOf(update(renamed, "name", " KUTUBXONA "))).toMatchObject({
      code: "23505",
      constraint: "departments_branch_name_key",
    });
    const moved = await insert(other.id, { name: "kutubxona" });
    expect(await refusalOf(update(moved, "branch_id", branch.id))).toMatchObject({
      code: "23505",
      constraint: "departments_branch_name_key",
    });
    await update(renamed, "name", "Sport zali 2");
    const free = await insert(other.id, { name: "Musiqa xonasi" });
    await update(free, "branch_id", branch.id);
  });
});

describe("departments: a blank value is refused (14-data-model.md, departments; plan of 1.6, decision 4)", () => {
  it("a blank name is refused on INSERT and on UPDATE (departments_name_check)", async () => {
    const branch = await insertBranch();
    expect(await refusalOf(insert(branch.id, { name: "   " }))).toMatchObject({
      code: "23514",
      constraint: "departments_name_check",
    });
    const id = await insert(branch.id);
    expect(await refusalOf(update(id, "name", " "))).toMatchObject({
      code: "23514",
      constraint: "departments_name_check",
    });
    await update(id, "name", "Yangi bo'lim");
  });

  it.each([
    ["responsible_name", "responsibleName", "Sinov Shaxsov"],
    ["responsible_phone", "responsiblePhone", "+998 90 000 00 00"],
  ] as const)(
    "a blank %s is refused on INSERT and on UPDATE; null and a filled value are taken",
    async (column, field, filled) => {
      const branch = await insertBranch();
      expect(await refusalOf(insert(branch.id, { [field]: "  " }))).toMatchObject({
        code: "23514",
        constraint: `departments_${column}_check`,
      });
      const id = await insert(branch.id, { [field]: filled });
      expect(await refusalOf(update(id, column, ""))).toMatchObject({
        code: "23514",
        constraint: `departments_${column}_check`,
      });
      await update(id, column, null);
      await insert(branch.id, { [field]: null });
    },
  );
});

describe("departments: every department belongs to one branch (A6; developer-rules.md rule 5)", () => {
  it("an unknown branch_id is refused by the foreign key on INSERT and on UPDATE", async () => {
    const branch = await insertBranch();
    expect(await refusalOf(insert(randomUUID()))).toMatchObject({
      code: "23503",
      constraint: "departments_branch_id_branches_id_fk",
    });
    const id = await insert(branch.id);
    expect(await refusalOf(update(id, "branch_id", randomUUID()))).toMatchObject({
      code: "23503",
      constraint: "departments_branch_id_branches_id_fk",
    });
    expect(await refusalOf(update(id, "branch_id", null))).toMatchObject({ code: "23502" });
    const other = await insertBranch();
    await update(id, "branch_id", other.id);
  });

  it("client_key is unique on INSERT and on UPDATE; rows without a key are taken (developer-rules.md rule 8)", async () => {
    const branch = await insertBranch();
    const key = randomUUID();
    await insert(branch.id, { clientKey: key });
    expect(await refusalOf(insert(branch.id, { clientKey: key }))).toMatchObject({
      code: "23505",
      constraint: "departments_client_key_key",
    });
    const keyless = await insert(branch.id);
    await insert(branch.id);
    expect(await refusalOf(update(keyless, "client_key", key))).toMatchObject({
      code: "23505",
      constraint: "departments_client_key_key",
    });
    await update(keyless, "client_key", randomUUID());
  });
});
