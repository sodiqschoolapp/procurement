import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { createCategory, setCategoryActive } from "../actions/categories";
import { createCompany, setCompanyActive } from "../actions/companies";
import { createMeasure } from "../actions/measures";
import {
  countActiveCatalogEntries,
  getCatalogEntry,
  listCatalogChoices,
  listCatalogEntries,
} from "./catalog-entries";

// build-plan 1.5, Done when: "a deactivated entry is absent from the picker query and present in
// the list". 04-catalogs.md rule 2 ("Inactive entries leave the pickers but stay visible in old
// records"); Companies and brands ("One list serves both the brand … and the supplier");
// 11-screens-and-ux.md rule 8 (25 a page); plan of 1.5, decisions 2 and 13. Every fixture is
// asserted (D38).

function data<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

async function category(headId: string, name: string, active = true) {
  const entry = data(
    await runAction(createCategory, headId, { clientKey: newClientKey(), name }),
  ) as { id: string };
  if (!active) data(await runAction(setCategoryActive, headId, { id: entry.id, active: false }));
  return entry.id;
}

async function company(headId: string, name: string, kind: string, active = true) {
  const entry = data(
    await runAction(createCompany, headId, {
      clientKey: newClientKey(),
      name,
      kind,
      taxId: "123456789",
      phone: "+998 71 000 00 00",
      note: "",
    }),
  ) as { id: string };
  if (!active) data(await runAction(setCompanyActive, headId, { id: entry.id, active: false }));
  return entry.id;
}

describe("listCatalogChoices and listCatalogEntries (04 rule 2)", () => {
  it("Done when: a deactivated entry is absent from the picker query and present in the list; an active one beside it is in both (D40)", async () => {
    const head = await insertUser("HEAD");
    const manager = await insertUser("MANAGER");
    const kept = await category(head.id, "Kantselyariya tovarlari");
    const dropped = await category(head.id, "Eski toifa", false);

    const choices = await listCatalogChoices(manager.id, "categories");
    expect(choices.map((choice) => choice.id)).toContain(kept);
    expect(choices.map((choice) => choice.id)).not.toContain(dropped);

    const list = await listCatalogEntries(head.id, "categories");
    expect(list.rows.find((row) => row.id === dropped)).toMatchObject({ isActive: false });
    expect(list.rows.find((row) => row.id === kept)).toMatchObject({ isActive: true });
  });

  it("a brand picker lists BRAND and BOTH; a supplier picker SUPPLIER and BOTH; an inactive BOTH in neither", async () => {
    const head = await insertUser("HEAD");
    const finance = await insertUser("FINANCE");
    const brand = await company(head.id, "Sinov Brend A", "BRAND");
    const supplier = await company(head.id, "Sinov Taminot B", "SUPPLIER");
    const both = await company(head.id, "Sinov Ikkalasi C", "BOTH");
    const gone = await company(head.id, "Sinov Yopilgan D", "BOTH", false);

    const ids = async (companyKind?: "BRAND" | "SUPPLIER") =>
      (await listCatalogChoices(finance.id, "companies", { q: "Sinov", companyKind })).map(
        (choice) => choice.id,
      );
    expect(await ids("BRAND")).toEqual([brand, both]);
    expect(await ids("SUPPLIER")).toEqual([both, supplier]);
    expect(await ids()).toEqual([brand, both, supplier]);
    expect(await ids()).not.toContain(gone);
  });

  it("a picker finds part of the name in any case, and a typed % is matched as itself (decision 13)", async () => {
    const head = await insertUser("HEAD");
    const principal = await insertUser("PRINCIPAL");
    const cleaning = await category(head.id, "Tozalash vositalari");
    const percent = await category(head.id, "Chegirma 100% mahsulot");
    await category(head.id, "Mebel");

    expect(
      (await listCatalogChoices(principal.id, "categories", { q: "TOZALASH" })).map((c) => c.id),
    ).toEqual([cleaning]);
    expect(
      (await listCatalogChoices(principal.id, "categories", { q: "0%" })).map((c) => c.id),
    ).toEqual([percent]);
    expect(await listCatalogChoices(principal.id, "categories", { q: "_" })).toEqual([]);
  });

  it("a measure's choice carries its short name and whether it allows decimals", async () => {
    const head = await insertUser("HEAD");
    const measure = data(
      await runAction(createMeasure, head.id, {
        clientKey: newClientKey(),
        name: "Kilogramm",
        shortName: "kg",
        allowDecimal: true,
      }),
    ) as { id: string };
    expect(await listCatalogChoices(head.id, "measures", { q: "kg" })).toEqual([
      { id: measure.id, name: "Kilogramm", shortName: "kg", allowDecimal: true },
    ]);
  });
});

describe("listCatalogEntries (11-screens-and-ux.md rule 8; decision 13)", () => {
  it("orders active first, then by name; 25 a page with the totals; a page past the last gives the last", async () => {
    const head = await insertUser("HEAD");
    for (let index = 1; index <= 27; index += 1) {
      await category(head.id, `Sahifa ${String(index).padStart(2, "0")}`, index !== 1);
    }
    const first = await listCatalogEntries(head.id, "categories", { q: "sahifa" });
    expect(first).toMatchObject({ page: 1, pages: 2, found: 27 });
    expect(first.rows).toHaveLength(25);
    expect(first.rows[0]!.name).toBe("Sahifa 02");
    const last = await listCatalogEntries(head.id, "categories", { q: "sahifa", page: 9 });
    expect(last.page).toBe(2);
    expect(last.rows.map((row) => row.name)).toEqual(["Sahifa 27", "Sahifa 01"]);
    expect(last.rows[1]!.isActive).toBe(false);
  });

  it("a company is found by part of its tax ID or phone; the counts are the whole catalog's", async () => {
    const head = await insertUser("HEAD");
    const found = await company(head.id, "Qidiruv MChJ", "SUPPLIER");
    const list = await listCatalogEntries(head.id, "companies", { q: "998 71" });
    expect(list.rows.map((row) => row.id)).toContain(found);
    expect(list.active + list.inactive).toBeGreaterThanOrEqual(list.found);
    expect(
      (await listCatalogEntries(head.id, "companies", { q: "1234567" })).rows.map((r) => r.id),
    ).toContain(found);
  });

  it("getCatalogEntry: an unknown or malformed id is null; a known one has every field", async () => {
    const head = await insertUser("HEAD");
    const id = await company(head.id, "Bitta MChJ", "BRAND");
    expect(
      await getCatalogEntry(head.id, "companies", "00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
    expect(await getCatalogEntry(head.id, "companies", "abc")).toBeNull();
    expect(await getCatalogEntry(head.id, "categories", id)).toBeNull();
    expect(await getCatalogEntry(head.id, "companies", id)).toEqual({
      id,
      name: "Bitta MChJ",
      kind: "BRAND",
      taxId: "123456789",
      phone: "+998 71 000 00 00",
      note: null,
      isActive: true,
    });
  });

  it("countActiveCatalogEntries counts active entries only, per catalog", async () => {
    const head = await insertUser("HEAD");
    const before = await countActiveCatalogEntries(head.id);
    await category(head.id, "Sanoq faol");
    await category(head.id, "Sanoq nofaol", false);
    const after = await countActiveCatalogEntries(head.id);
    expect(after.categories).toBe(before.categories + 1);
    expect(after.measures).toBe(before.measures);
  });
});

describePermissionMatrix("listCatalogEntries", {
  permission: "catalog.manage",
  run: ({ user }) => listCatalogEntries(user.id, "measures"),
});

describePermissionMatrix("getCatalogEntry", {
  permission: "catalog.manage",
  run: ({ user }) => getCatalogEntry(user.id, "companies", newClientKey()),
});

describePermissionMatrix("countActiveCatalogEntries", {
  permission: "catalog.manage",
  run: ({ user }) => countActiveCatalogEntries(user.id),
});

describePermissionMatrix("listCatalogChoices", {
  permission: "catalog.pick",
  run: ({ user }) => listCatalogChoices(user.id, "extra-costs"),
});
