import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertDepartment } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints of migration 0034_import_stock (build-plan 5.9; plan of 5.9, Database changes;
// review of the plan, must fixes 1 and 2 and corrections 1 and 2). Each forbidden write goes
// straight to the table with nothing in front (D39), on insert and on update, beside the write the
// guard lets through (D40). Spec: developer-rules.md rules 5 and 8; 14-data-model.md (a foreign key
// on every relation).

const AT = "2031-05-03T05:00:00Z";
const CHECK = "23514";
const FOREIGN = "23503";

let branchId: string;
let code: string;
let userId: string;
let departmentId: string;
let counter = 0;

beforeAll(async () => {
  const branch = await insertBranch();
  branchId = branch.id;
  code = branch.code;
  userId = (await insertUser("HEAD")).id;
  departmentId = (await insertDepartment(branchId)).id;
});

async function insertImport(kind: string, branch: string | null): Promise<string> {
  const inserted = await db.execute<{ id: string }>(sql`insert into catalog_imports
      (kind, file_name, row_count, created_by, client_key, branch_id, created_at)
    values (${kind}, 'qoldiq.xlsx', 1, ${userId}, ${randomUUID()}, ${branch}, ${AT})
    returning id`);
  return inserted.rows[0]!.id;
}

async function insertDocument(type: "DIRECT_ENTRY" | "ISSUE", importId: string | null) {
  counter += 1;
  const prefix = type === "ISSUE" ? "ISS" : "ENT";
  const inserted = await db.execute<{ id: string }>(sql`
    insert into stock_documents (number, type, branch_id, department_id, doc_date, status, reason,
      client_key, created_by, import_id, created_at)
    values (${`${prefix}-${code}-31-${String(counter).padStart(4, "0")}`}, ${type}, ${branchId},
      ${type === "ISSUE" ? departmentId : null}, '2031-05-03', 'POSTED',
      ${type === "DIRECT_ENTRY" ? "EXISTING_STOCK" : null}, ${randomUUID()}, ${userId},
      ${importId}, ${AT})
    returning id`);
  return inserted.rows[0]!.id;
}

describe("catalog_imports.branch_id: a stock import has its branch, no other kind one (decided item 2, Look first)", () => {
  it("a STOCK row with its branch and a PRICES row without one are written", async () => {
    await insertImport("STOCK", branchId);
    await insertImport("PRICES", null);
  });

  it("a STOCK row without a branch and a PRICES row with one are refused, on insert", async () => {
    const refused = { code: CHECK, constraint: "catalog_imports_branch_check" };
    expect(await refusalOf(insertImport("STOCK", null))).toMatchObject(refused);
    expect(await refusalOf(insertImport("PRICES", branchId))).toMatchObject(refused);
  });

  it("and on update", async () => {
    const refused = { code: CHECK, constraint: "catalog_imports_branch_check" };
    const stock = await insertImport("STOCK", branchId);
    const prices = await insertImport("PRICES", null);
    expect(
      await refusalOf(
        db.execute(sql`update catalog_imports set branch_id = null where id = ${stock}`),
      ),
    ).toMatchObject(refused);
    expect(
      await refusalOf(
        db.execute(sql`update catalog_imports set branch_id = ${branchId} where id = ${prices}`),
      ),
    ).toMatchObject(refused);
  });

  it("an unknown branch is refused by its foreign key", async () => {
    expect(await refusalOf(insertImport("STOCK", randomUUID()))).toMatchObject({
      code: FOREIGN,
      constraint: "catalog_imports_branch_id_branches_id_fk",
    });
  });
});

describe("stock_documents.import_id: only a direct entry comes from an import (must fix 2)", () => {
  it("a direct entry with its import, and an issue without one, are written", async () => {
    const importId = await insertImport("STOCK", branchId);
    await insertDocument("DIRECT_ENTRY", importId);
    await insertDocument("ISSUE", null);
  });

  it("an issue with an import is refused, on insert and on update", async () => {
    const importId = await insertImport("STOCK", branchId);
    const refused = { code: CHECK, constraint: "stock_documents_import_check" };
    expect(await refusalOf(insertDocument("ISSUE", importId))).toMatchObject(refused);
    const issue = await insertDocument("ISSUE", null);
    expect(
      await refusalOf(
        db.execute(sql`update stock_documents set import_id = ${importId} where id = ${issue}`),
      ),
    ).toMatchObject(refused);
  });

  it("an unknown import is refused by its foreign key", async () => {
    expect(await refusalOf(insertDocument("DIRECT_ENTRY", randomUUID()))).toMatchObject({
      code: FOREIGN,
      constraint: "stock_documents_import_id_catalog_imports_id_fk",
    });
  });
});
