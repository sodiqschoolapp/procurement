import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { type CatalogKind, CATALOGS } from "@/domain/catalogs";
import { ROLES } from "@/domain/permissions";
import { type ActionDefinition, runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";

import { setClock } from "../../../../tests/helpers/clock";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { runTogether } from "../../../../tests/helpers/together";
import { insertUser } from "../../../../tests/helpers/users";
import { createCategory, setCategoryActive, updateCategory } from "./categories";
import { createCompany, setCompanyActive, updateCompany } from "./companies";
import {
  createExtraCostType,
  setExtraCostTypeActive,
  updateExtraCostType,
} from "./extra-cost-types";
import { createMeasure, setMeasureActive, updateMeasure } from "./measures";

// build-plan 1.5, Done when: "' Paper ' and 'paper' clash; … only the Head can write".
// 04-catalogs.md, Catalogs table (Measures, Categories, Extra cost types, Companies and brands);
// rule 2 (deactivate, never delete); rule 3 (names unique ignoring capital letters and extra
// spaces); rule 9 (change history); developer-rules.md rules 8 and 13; plan of 1.5 and its review
// (correction 4: the literal Done-when pair). Every fixture is asserted (D38).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAction = ActionDefinition<any, any, any>;

type Catalog = {
  kind: CatalogKind;
  create: AnyAction;
  update: AnyAction;
  setActive: AnyAction;
  /** The other fields of a new entry, unique to the call. */
  rest(): Record<string, unknown>;
};

let made = 0;
function n(): number {
  made += 1;
  return made;
}

const CATALOG_CASES: readonly Catalog[] = [
  {
    kind: "measures",
    create: createMeasure,
    update: updateMeasure,
    setActive: setMeasureActive,
    rest: () => ({ shortName: `m${n()}`, allowDecimal: false }),
  },
  {
    kind: "categories",
    create: createCategory,
    update: updateCategory,
    setActive: setCategoryActive,
    rest: () => ({}),
  },
  {
    kind: "extra-costs",
    create: createExtraCostType,
    update: updateExtraCostType,
    setActive: setExtraCostTypeActive,
    rest: () => ({}),
  },
  {
    kind: "companies",
    create: createCompany,
    update: updateCompany,
    setActive: setCompanyActive,
    rest: () => ({ kind: "SUPPLIER", taxId: "", phone: "", note: "" }),
  },
];

type Entry = { id: string; name: string; isActive: boolean } & Record<string, unknown>;

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

const TAKEN = (field: string) => ({
  ok: false,
  error: { code: "invalid_input", fields: { [field]: "errors.field.taken" } },
});

function entityOf(catalog: Catalog): string {
  return CATALOGS[catalog.kind].entity;
}

async function auditRowsOf(catalog: Catalog, entityId: string) {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, entityOf(catalog)), eq(auditLog.entityId, entityId)))
    .orderBy(auditLog.createdAt, auditLog.id);
}

async function auditRowsBy(catalog: Catalog, actorId: string) {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, entityOf(catalog)), eq(auditLog.actorId, actorId)));
}

/** How many rows of the catalog's table hold this name, compared as the unique index does. */
async function rowsNamed(catalog: Catalog, name: string): Promise<number> {
  const found = await db.execute<{ count: number }>(sql`
    select count(*)::int as count from ${sql.identifier(entityOf(catalog))}
    where lower(regexp_replace(btrim(name), '\\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(${name}), '\\s+', ' ', 'g'))`);
  return found.rows[0]!.count;
}

async function create(catalog: Catalog, headId: string, name: string, rest = catalog.rest()) {
  return expectOk(
    (await runAction(catalog.create, headId, {
      clientKey: newClientKey(),
      name,
      ...rest,
    })) as ActionResult<Entry>,
  );
}

describe.each(CATALOG_CASES)("$kind (build-plan 1.5)", (catalog) => {
  const k = catalog.kind;

  it('Done when: " Paper " and "paper" clash (04 rule 3); nothing is written by the refused one', async () => {
    const head = await insertUser("HEAD");
    const saved = await create(catalog, head.id, ` Paper ${k} `);
    expect(saved.name).toBe(`Paper ${k}`);
    expect(
      await runAction(catalog.create, head.id, {
        clientKey: newClientKey(),
        name: `paper ${k}`,
        ...catalog.rest(),
      }),
    ).toMatchObject(TAKEN("name"));
    expect(await rowsNamed(catalog, `paper ${k}`)).toBe(1);
    expect(await auditRowsBy(catalog, head.id)).toHaveLength(1);
  });

  it("with 'Paper' saved, ' Paper ' and 'PAPER  ' are taken; 'БУМАГА ' clashes with 'Бумага'; 'Paper towels' passes (D40)", async () => {
    const head = await insertUser("HEAD");
    await create(catalog, head.id, `Paper ${k} x`);
    await create(catalog, head.id, `Бумага ${k}`);
    for (const name of [` Paper ${k} x `, `PAPER  ${k.toUpperCase()} X`, `БУМАГА ${k} `]) {
      expect(
        await runAction(catalog.create, head.id, {
          clientKey: newClientKey(),
          name,
          ...catalog.rest(),
        }),
        name,
      ).toMatchObject(TAKEN("name"));
    }
    expect(await auditRowsBy(catalog, head.id)).toHaveLength(2);
    await create(catalog, head.id, `Paper towels ${k} x`);
  });

  it("creates an active entry with one <prefix>.create row holding every field (04 rule 9)", async () => {
    setClock("2026-10-15T08:00:00Z");
    const head = await insertUser("HEAD");
    const entry = await create(catalog, head.id, `  Yangi   yozuv ${k} `);
    expect(entry).toMatchObject({ name: `Yangi yozuv ${k}`, isActive: true });
    const audits = await auditRowsOf(catalog, entry.id);
    expect(audits).toHaveLength(1);
    const fields = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "id"));
    expect(audits[0]).toMatchObject({
      actorId: head.id,
      action: expect.stringMatching(/\.create$/),
      before: null,
      after: fields,
      createdAt: new Date("2026-10-15T08:00:00Z"),
    });
  });

  it("on update: another entry's name in other case is taken; the own name in other case passes (04 rule 3; D40)", async () => {
    const head = await insertUser("HEAD");
    await create(catalog, head.id, `Daftar ${k}`);
    const own = await create(catalog, head.id, `Ruchka ${k}`);
    expect(
      await runAction(catalog.update, head.id, { id: own.id, name: ` DAFTAR ${k} ` }),
    ).toMatchObject(TAKEN("name"));
    const renamed = expectOk(
      (await runAction(catalog.update, head.id, {
        id: own.id,
        name: `RUCHKA ${k}`,
      })) as ActionResult<{
        entry: Entry;
        changed: string[];
      }>,
    );
    expect(renamed.entry.name).toBe(`RUCHKA ${k}`);
    expect(renamed.changed).toEqual(["name"]);
  });

  it("an update writes only the changed fields to the history; nothing changed writes no row (04 rule 9)", async () => {
    const head = await insertUser("HEAD");
    const entry = await create(catalog, head.id, `Tarix ${k}`);
    expectOk(await runAction(catalog.update, head.id, { id: entry.id, name: `Tarix ${k} 2` }));
    expectOk(await runAction(catalog.update, head.id, { id: entry.id, name: `Tarix ${k} 2` }));
    const audits = await auditRowsOf(catalog, entry.id);
    expect(audits.map((row) => row.action.split(".")[1])).toEqual(["create", "update"]);
    expect(audits[1]).toMatchObject({
      actorId: head.id,
      before: { name: `Tarix ${k}` },
      after: { name: `Tarix ${k} 2` },
    });
  });

  it("deactivate keeps the row; the same move twice is wrong_status; activate brings it back (04 rule 2)", async () => {
    const head = await insertUser("HEAD");
    const entry = await create(catalog, head.id, `Faol ${k}`);
    const off = expectOk(
      (await runAction(catalog.setActive, head.id, {
        id: entry.id,
        active: false,
      })) as ActionResult<Entry>,
    );
    expect(off).toMatchObject({ id: entry.id, isActive: false, name: `Faol ${k}` });
    expect(
      await runAction(catalog.setActive, head.id, { id: entry.id, active: false }),
    ).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    expectOk(await runAction(catalog.setActive, head.id, { id: entry.id, active: true }));
    const audits = await auditRowsOf(catalog, entry.id);
    expect(audits.map((row) => [row.action.split(".")[1], row.before, row.after])).toEqual([
      ["create", null, expect.anything()],
      ["deactivate", { isActive: true }, { isActive: false }],
      ["activate", { isActive: false }, { isActive: true }],
    ]);
  });

  it("a name held by an inactive entry is taken; renaming the inactive entry frees it (D41)", async () => {
    const head = await insertUser("HEAD");
    const old = await create(catalog, head.id, `Eski ${k}`);
    expectOk(await runAction(catalog.setActive, head.id, { id: old.id, active: false }));
    expect(
      await runAction(catalog.create, head.id, {
        clientKey: newClientKey(),
        name: `eski ${k}`,
        ...catalog.rest(),
      }),
    ).toMatchObject(TAKEN("name"));
    expectOk(await runAction(catalog.update, head.id, { id: old.id, name: `Eski ${k} (2025)` }));
    await create(catalog, head.id, `eski ${k}`);
  });

  it("an unknown id is not_found for update and deactivate", async () => {
    const head = await insertUser("HEAD");
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(await runAction(catalog.update, head.id, { id: missing, name: "Yo'q" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(
      await runAction(catalog.setActive, head.id, { id: missing, active: false }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("the same client key twice returns the first entry; one row, one audit row; another Head gets not_found (developer-rules.md rule 8)", async () => {
    const head = await insertUser("HEAD");
    const input = { clientKey: newClientKey(), name: `Takror ${k}`, ...catalog.rest() };
    const first = expectOk(
      (await runAction(catalog.create, head.id, input)) as ActionResult<Entry>,
    );
    const second = expectOk(
      (await runAction(catalog.create, head.id, input)) as ActionResult<Entry>,
    );
    expect(second).toEqual(first);
    expect(await rowsNamed(catalog, `Takror ${k}`)).toBe(1);
    expect(await auditRowsOf(catalog, first.id)).toHaveLength(1);
    const other = await insertUser("HEAD");
    expect(await runAction(catalog.create, other.id, input)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("two creates at once with the same name: one success, one taken (the table's advisory lock)", async () => {
    const head = await insertUser("HEAD");
    const outcomes = await runTogether(
      [1, 2].map(() => async (meet: () => Promise<void>) => {
        const input = { clientKey: newClientKey(), name: `Bir vaqtda ${k}`, ...catalog.rest() };
        await meet();
        return runAction(catalog.create, head.id, input);
      }),
    );
    const answers = outcomes.map((outcome) => {
      expect(outcome.status).toBe("fulfilled");
      return (outcome as PromiseFulfilledResult<ActionResult<Entry>>).value;
    });
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.find((answer) => !answer.ok)).toMatchObject(TAKEN("name"));
    expect(await rowsNamed(catalog, `Bir vaqtda ${k}`)).toBe(1);
  });

  it.each(ROLES.filter((role) => role !== "HEAD"))(
    "Done when: %s cannot write; no row and no audit row (03, Permission matrix)",
    async (role) => {
      const user = await insertUser(role);
      expect(
        await runAction(catalog.create, user.id, {
          clientKey: newClientKey(),
          name: `Rad ${role} ${k}`,
          ...catalog.rest(),
        }),
      ).toMatchObject({ ok: false, error: { code: "forbidden" } });
      expect(await rowsNamed(catalog, `Rad ${role} ${k}`)).toBe(0);
      expect(await auditRowsBy(catalog, user.id)).toEqual([]);
    },
  );
});

describe("measures: the short name and decimals (plan of 1.5, decisions 3 and 4)", () => {
  const measures = CATALOG_CASES[0]!;

  it("a short name another measure holds, in other case and spaces, is taken on create and on update", async () => {
    const head = await insertUser("HEAD");
    await create(measures, head.id, "Kilogramm", { shortName: "kg", allowDecimal: true });
    expect(
      await runAction(createMeasure, head.id, {
        clientKey: newClientKey(),
        name: "Kilo",
        shortName: " KG ",
        allowDecimal: true,
      }),
    ).toMatchObject(TAKEN("shortName"));
    const piece = await create(measures, head.id, "Dona", {
      shortName: "pcs",
      allowDecimal: false,
    });
    expect(
      await runAction(updateMeasure, head.id, { id: piece.id, shortName: "Kg" }),
    ).toMatchObject(TAKEN("shortName"));
    expectOk(await runAction(updateMeasure, head.id, { id: piece.id, shortName: "dona" }));
  });

  it("a name and a short name both taken are named together", async () => {
    const head = await insertUser("HEAD");
    await create(measures, head.id, "Litr", { shortName: "l", allowDecimal: true });
    expect(
      await runAction(createMeasure, head.id, {
        clientKey: newClientKey(),
        name: "LITR",
        shortName: "L",
        allowDecimal: true,
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: { name: "errors.field.taken", shortName: "errors.field.taken" },
      },
    });
  });

  it("'Allows decimals' can be changed while no product uses the measure (decision 3)", async () => {
    const head = await insertUser("HEAD");
    const metre = await create(measures, head.id, "Metr", { shortName: "m", allowDecimal: false });
    const changed = expectOk(
      (await runAction(updateMeasure, head.id, {
        id: metre.id,
        allowDecimal: true,
      })) as ActionResult<{
        entry: Entry;
      }>,
    );
    expect(changed.entry.allowDecimal).toBe(true);
  });
});

describe("companies: kind, tax ID, phone, note (plan of 1.5, decisions 5 and 6)", () => {
  it("a bad tax ID and a bad phone are refused on their fields; nothing is written", async () => {
    const head = await insertUser("HEAD");
    expect(
      await runAction(createCompany, head.id, {
        clientKey: newClientKey(),
        name: "Sinov Savdo MChJ",
        kind: "SUPPLIER",
        taxId: "12345678",
        phone: "telefon",
        note: "",
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: { taxId: "errors.field.wrongFormat", phone: "errors.field.wrongFormat" },
      },
    });
    expect(await auditRowsBy(CATALOG_CASES[3]!, head.id)).toEqual([]);
  });

  it("a missing kind is required; empty optional fields are stored as null; filled ones trimmed", async () => {
    const head = await insertUser("HEAD");
    expect(
      await runAction(createCompany, head.id, { clientKey: newClientKey(), name: "Tursiz" }),
    ).toMatchObject({ ok: false, error: { fields: { kind: "errors.field.required" } } });
    const company = await create(CATALOG_CASES[3]!, head.id, "Sinov Brend", {
      kind: "BRAND",
      taxId: "  ",
      phone: "",
      note: " Faqat ulgurji ",
    });
    expect(company).toMatchObject({
      kind: "BRAND",
      taxId: null,
      phone: null,
      note: "Faqat ulgurji",
    });
    const filled = expectOk(
      (await runAction(updateCompany, head.id, {
        id: company.id,
        kind: "BOTH",
        taxId: "12345678901234",
        phone: " +998 90 000 00 00 ",
        note: "",
      })) as ActionResult<{ entry: Entry; changed: string[] }>,
    );
    expect(filled.entry).toMatchObject({
      kind: "BOTH",
      taxId: "12345678901234",
      phone: "+998 90 000 00 00",
      note: null,
    });
    expect(filled.changed).toEqual(["kind", "taxId", "phone", "note"]);
  });
});

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

for (const catalog of CATALOG_CASES) {
  const label = catalog.create.name.replace(/^create/, "");

  describePermissionMatrix(`create${label}`, {
    permission: "catalog.manage",
    async run({ user }) {
      asMatrixAnswer(
        await runAction(catalog.create, user.id, {
          clientKey: newClientKey(),
          name: `Matritsa ${newClientKey()}`,
          ...catalog.rest(),
        }),
      );
    },
  });

  describePermissionMatrix(`update${label}`, {
    permission: "catalog.manage",
    async run({ user }) {
      const head = await insertUser("HEAD");
      const entry = await create(catalog, head.id, `Matritsa ${newClientKey()}`);
      asMatrixAnswer(
        await runAction(catalog.update, user.id, {
          id: entry.id,
          name: `Matritsa ${newClientKey()}`,
        }),
      );
    },
  });

  describePermissionMatrix(`set${label}Active`, {
    permission: "catalog.manage",
    async run({ user }) {
      const head = await insertUser("HEAD");
      const entry = await create(catalog, head.id, `Matritsa ${newClientKey()}`);
      asMatrixAnswer(await runAction(catalog.setActive, user.id, { id: entry.id, active: false }));
    },
  });
}
