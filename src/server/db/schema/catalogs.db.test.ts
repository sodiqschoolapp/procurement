import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { refusalOf } from "../../../../tests/helpers/database-error";

// The constraints of migration 0010_catalogs (developer-rules.md rule 5: "Database tests that try
// the forbidden write directly"; D39: every guard on INSERT and on UPDATE, plain SQL with nothing
// in front; D40: each refused write beside an accepted one). 14-data-model.md: units, categories,
// extra_cost_types, companies; 04-catalogs.md rule 3 (names unique ignoring capital letters and
// extra spaces); plan of 1.5 and its review (Must fix 1, Should fix 2).

const AT = "2031-04-11T05:00:00Z";
let made = 0;

function count(): number {
  made += 1;
  return made;
}

type Table = "units" | "categories" | "extra_cost_types" | "companies";
const TABLES: readonly Table[] = ["units", "categories", "extra_cost_types", "companies"];

type Row = {
  name?: string;
  shortName?: string;
  clientKey?: string | null;
  kind?: string;
  taxId?: string | null;
  phone?: string | null;
  note?: string | null;
};

/** One row of a table with plain SQL; what is not given is unique to the row. */
async function insert(table: Table, row: Row = {}): Promise<string> {
  const n = count();
  const name = row.name ?? `Sinov ${table} ${n}`;
  const clientKey = row.clientKey === undefined ? null : row.clientKey;
  let found;
  if (table === "units") {
    found = await db.execute<{ id: string }>(sql`
      insert into units (name, short_name, allow_decimal, client_key, created_at)
      values (${name}, ${row.shortName ?? `u${n}`}, false, ${clientKey}, ${AT}) returning id`);
  } else if (table === "companies") {
    found = await db.execute<{ id: string }>(sql`
      insert into companies (name, kind, tax_id, phone, note, client_key, created_at)
      values (${name}, ${row.kind ?? "SUPPLIER"}::company_kind, ${row.taxId ?? null},
              ${row.phone ?? null}, ${row.note ?? null}, ${clientKey}, ${AT}) returning id`);
  } else {
    found = await db.execute<{ id: string }>(sql`
      insert into ${sql.identifier(table)} (name, client_key, created_at)
      values (${name}, ${clientKey}, ${AT}) returning id`);
  }
  return found.rows[0]!.id;
}

function update(table: Table, id: string, column: string, value: string | null) {
  return db.execute(
    sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${value} where id = ${id}`,
  );
}

function updateKind(id: string, kind: string) {
  return db.execute(sql`update companies set kind = ${kind}::company_kind where id = ${id}`);
}

async function nameOf(table: Table, id: string): Promise<string> {
  const found = await db.execute<{ name: string }>(
    sql`select name from ${sql.identifier(table)} where id = ${id}`,
  );
  return found.rows[0]!.name;
}

describe.each(TABLES)(
  "%s: the name is unique ignoring capital letters and extra spaces (04 rule 3)",
  (table) => {
    it("on INSERT: ' PAPER  ' and 'БУМАГА ' clash with 'Paper' and 'Бумага'; a distinct name is taken", async () => {
      await insert(table, { name: `Paper ${table}` });
      await insert(table, { name: `Бумага ${table}` });
      expect(
        await refusalOf(insert(table, { name: ` PAPER   ${table.toUpperCase()} ` })),
      ).toMatchObject({
        code: "23505",
        constraint: `${table}_name_key`,
      });
      expect(await refusalOf(insert(table, { name: `БУМАГА ${table} ` }))).toMatchObject({
        code: "23505",
        constraint: `${table}_name_key`,
      });
      await insert(table, { name: `Paper towels ${table}` });
    });

    it("on UPDATE: renaming to another entry's name in other case and spaces is refused; to a distinct name is taken", async () => {
      await insert(table, { name: `Daftar ${table}` });
      const other = await insert(table, { name: `Ruchka ${table}` });
      expect(await refusalOf(update(table, other, "name", ` DAFTAR  ${table} `))).toMatchObject({
        code: "23505",
        constraint: `${table}_name_key`,
      });
      await insert(table, { name: `Бумага ${table} u` });
      expect(await refusalOf(update(table, other, "name", `БУМАГА  ${table} U `))).toMatchObject({
        code: "23505",
        constraint: `${table}_name_key`,
      });
      await update(table, other, "name", `Qalam ${table}`);
      expect(await nameOf(table, other)).toBe(`Qalam ${table}`);
    });

    it("a blank name is refused on INSERT and on UPDATE (name_check)", async () => {
      expect(await refusalOf(insert(table, { name: "   " }))).toMatchObject({
        code: "23514",
        constraint: `${table}_name_check`,
      });
      const id = await insert(table);
      expect(await refusalOf(update(table, id, "name", " "))).toMatchObject({
        code: "23514",
        constraint: `${table}_name_check`,
      });
      await update(table, id, "name", `Yangi nom ${table}`);
    });

    it("client_key is unique on INSERT and on UPDATE; rows without a key are taken (developer-rules.md rule 8)", async () => {
      const key = randomUUID();
      await insert(table, { clientKey: key });
      expect(await refusalOf(insert(table, { clientKey: key }))).toMatchObject({
        code: "23505",
        constraint: `${table}_client_key_key`,
      });
      const keyless = await insert(table);
      await insert(table);
      expect(await refusalOf(update(table, keyless, "client_key", key))).toMatchObject({
        code: "23505",
        constraint: `${table}_client_key_key`,
      });
      await update(table, keyless, "client_key", randomUUID());
    });
  },
);

describe("units: the short name (plan of 1.5, decision 4)", () => {
  it("is unique ignoring case and spaces, on INSERT and on UPDATE", async () => {
    await insert("units", { shortName: "kg" });
    expect(await refusalOf(insert("units", { shortName: " KG " }))).toMatchObject({
      code: "23505",
      constraint: "units_short_name_key",
    });
    const other = await insert("units", { shortName: "pcs" });
    expect(await refusalOf(update("units", other, "short_name", "Kg"))).toMatchObject({
      code: "23505",
      constraint: "units_short_name_key",
    });
    await update("units", other, "short_name", "dona");
    await insert("units", { shortName: "кг" });
  });

  it("a blank short name is refused on INSERT and on UPDATE (units_short_name_check)", async () => {
    expect(await refusalOf(insert("units", { shortName: "  " }))).toMatchObject({
      code: "23514",
      constraint: "units_short_name_check",
    });
    const id = await insert("units");
    expect(await refusalOf(update("units", id, "short_name", ""))).toMatchObject({
      code: "23514",
      constraint: "units_short_name_check",
    });
    await update("units", id, "short_name", "l");
  });
});

describe("companies: kind, tax ID, phone, note (14-data-model.md, companies; plan of 1.5, decision 5)", () => {
  it("a kind outside BRAND, SUPPLIER, BOTH is refused on INSERT and on UPDATE", async () => {
    expect(await refusalOf(insert("companies", { kind: "SHOP" }))).toMatchObject({
      code: "22P02",
    });
    const id = await insert("companies", { kind: "BRAND" });
    expect(await refusalOf(updateKind(id, "brand"))).toMatchObject({ code: "22P02" });
    await updateKind(id, "BOTH");
  });

  it.each([
    ["tax_id", "taxId", "123456789"],
    ["phone", "phone", "+998 90 000 00 00"],
    ["note", "note", "Ulgurji narxlar"],
  ] as const)(
    "a blank %s is refused on INSERT and on UPDATE; null and a filled value are taken",
    async (column, field, filled) => {
      expect(await refusalOf(insert("companies", { [field]: "  " }))).toMatchObject({
        code: "23514",
        constraint: `companies_${column}_check`,
      });
      const id = await insert("companies", { [field]: filled });
      expect(await refusalOf(update("companies", id, column, ""))).toMatchObject({
        code: "23514",
        constraint: `companies_${column}_check`,
      });
      await update("companies", id, column, null);
      await insert("companies", { [field]: null });
    },
  );
});
