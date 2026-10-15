import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints of migration 0015_catalog_imports (developer-rules.md rule 5: "Database tests
// that try the forbidden write directly"; D39: every refused branch reached by plain SQL with
// nothing in front; D40: the pass case beside each refusal). Plan of 1.10, "Database changes",
// decision 13; spec review of the plan, Must fix 2.

const AT = "2031-04-11T05:00:00Z";

type Row = {
  kind?: string;
  fileName?: string;
  rowCount?: number;
  createdBy?: string;
  clientKey?: string;
};

async function insertImport(row: Row = {}) {
  const createdBy = row.createdBy ?? (await insertUser("HEAD")).id;
  return db.execute(sql`insert into catalog_imports
      (kind, file_name, row_count, created_by, client_key, created_at)
    values (${row.kind ?? "PRODUCTS"}, ${row.fileName ?? "mahsulotlar.xlsx"}, ${row.rowCount ?? 30},
      ${createdBy}, ${row.clientKey ?? randomUUID()}, ${AT})`);
}

describe("catalog_imports (plan of 1.10, Database changes)", () => {
  it("a row of each kind is written", async () => {
    await insertImport({ kind: "PRODUCTS" });
    await insertImport({ kind: "DEPARTMENTS", rowCount: 1 });
  });

  it("a kind outside the enum is refused", async () => {
    expect(await refusalOf(insertImport({ kind: "PRICES_LATER" }))).toMatchObject({
      code: "22P02",
    });
  });

  it("row_count must be more than 0", async () => {
    expect(await refusalOf(insertImport({ rowCount: 0 }))).toMatchObject({
      code: "23514",
      constraint: "catalog_imports_row_count_check",
    });
  });

  it("a blank file name, or one of 256 code points, is refused; 255 passes", async () => {
    const refused = { code: "23514", constraint: "catalog_imports_file_name_check" };
    expect(await refusalOf(insertImport({ fileName: "   " }))).toMatchObject(refused);
    expect(await refusalOf(insertImport({ fileName: `${"ʻ".repeat(251)}.xlsx` }))).toMatchObject(
      refused,
    );
    await insertImport({ fileName: `${"ʻ".repeat(250)}.xlsx` });
  });

  it("the same client key twice is refused (developer-rules.md rule 8)", async () => {
    const clientKey = randomUUID();
    await insertImport({ clientKey });
    expect(await refusalOf(insertImport({ clientKey }))).toMatchObject({
      code: "23505",
      constraint: "catalog_imports_client_key_key",
    });
  });

  it("created_by must be a user", async () => {
    expect(await refusalOf(insertImport({ createdBy: randomUUID() }))).toMatchObject({
      code: "23503",
      constraint: "catalog_imports_created_by_users_id_fk",
    });
  });

  it("an update is held to the same rules (D39: insert and update)", async () => {
    const clientKey = randomUUID();
    await insertImport({ clientKey });
    const taken = randomUUID();
    await insertImport({ clientKey: taken });
    const update = (set: ReturnType<typeof sql>) =>
      db.execute(sql`update catalog_imports set ${set} where client_key = ${clientKey}`);
    expect(await refusalOf(update(sql`row_count = 0`))).toMatchObject({
      code: "23514",
      constraint: "catalog_imports_row_count_check",
    });
    const fileName = { code: "23514", constraint: "catalog_imports_file_name_check" };
    expect(await refusalOf(update(sql`file_name = ' '`))).toMatchObject(fileName);
    expect(await refusalOf(update(sql`file_name = ${`${"ʻ".repeat(251)}.xlsx`}`))).toMatchObject(
      fileName,
    );
    expect(await refusalOf(update(sql`client_key = ${taken}`))).toMatchObject({
      code: "23505",
      constraint: "catalog_imports_client_key_key",
    });
    expect(await refusalOf(update(sql`created_by = ${randomUUID()}`))).toMatchObject({
      code: "23503",
      constraint: "catalog_imports_created_by_users_id_fk",
    });
    // Beside the refusals, an update within the rules passes.
    await update(sql`file_name = 'boshqa.xlsx', row_count = 1`);
  });
});
