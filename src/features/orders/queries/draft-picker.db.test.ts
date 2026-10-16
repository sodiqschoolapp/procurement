import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { stockBalances } from "@/server/db/schema";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertCompany, insertSubtypes } from "../../../../tests/helpers/catalog";
import {
  insertDepartment,
  insertExtraCostType,
  insertItem,
  setDefaultPaymentType,
} from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { listDraftChoices, searchDraftProducts } from "./draft-picker";

// The product picker and the choices of the drafts grid (build plan 2.5a): 05-order-request-
// form.md (Order fields 2 to 7, 11 to 13), 04-catalogs.md rules 1 and 2 (inactive entries leave
// the pickers), 03-roles-and-permissions.md rule 1; plan of 2.5a, decided item 9 (Look first).
// Every entry shown stands beside the one left out (D40).

async function scene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  return { branch, manager };
}

describe("searchDraftProducts (05 field 2: search by name, shows photo, category, type and stock)", () => {
  it("finds active products by part of the name in any case, with subtypes, stock of the branch and the suggestion", async () => {
    const { branch, manager } = await scene();
    const tag = randomUUID().slice(0, 6);
    const pen = await insertItem({ referencePrice: 1_500n, lastPurchasePrice: 1_800n });
    await db.execute(
      // A searchable name (the helper's names are random).
      sql`update products set name = ${`Ruchka ${tag}`} where id = ${pen.id}`,
    );
    const [blue, , inactive] = await insertSubtypes(pen.id, [
      { name: "Ko'k", referencePrice: 1_600n },
      { name: "Qora" },
      { name: "Yashil", isActive: false },
    ]);
    await db.insert(stockBalances).values([
      { branchId: branch.id, variantId: blue!, qty: "40.000", createdAt: now(), updatedAt: now() },
      {
        branchId: (await insertBranch()).id,
        variantId: blue!,
        qty: "7.000",
        createdAt: now(),
        updatedAt: now(),
      },
    ]);
    const closed = await insertItem({ isActive: false });
    await db.execute(
      sql`update products set name = ${`Ruchka eski ${tag}`} where id = ${closed.id}`,
    );

    const found = await searchDraftProducts(manager.id, {
      branchId: branch.id,
      q: `RUCHKA ${tag.toUpperCase()}`,
    });
    expect(found.map((product) => product.id)).toEqual([pen.id]);
    const [product] = found;
    expect(product).toMatchObject({ type: "GOODS", allowsDecimals: false });
    expect(product!.subtypes.map((subtype) => subtype.id)).not.toContain(inactive);
    const byName = new Map(product!.subtypes.map((subtype) => [subtype.name, subtype]));
    expect(byName.get("Ko'k")).toMatchObject({
      inStock: "40",
      referencePrice: 1_600n,
      suggestedPrice: 1_600n,
    });
    expect(byName.get("Qora")).toMatchObject({ inStock: "0", referencePrice: null });
  });

  it("a product without subtypes shows its hidden default as the product alone; a service has no stock", async () => {
    const { branch, manager } = await scene();
    const service = await insertItem({
      type: "SERVICE",
      referencePrice: null,
      lastPurchasePrice: 300n,
    });
    const found = await searchDraftProducts(manager.id, { branchId: branch.id, q: "" });
    const shown = found.find((product) => product.id === service.id);
    // The list holds at most 20; this file made few enough products that it is among them.
    expect(shown?.subtypes).toEqual([
      expect.objectContaining({
        id: service.variantId,
        name: null,
        inStock: null,
        suggestedPrice: 300n,
      }),
    ]);
  });

  it("another branch is not_found (03 rule 1)", async () => {
    const { manager } = await scene();
    const other = await insertBranch();
    await expect(
      searchDraftProducts(manager.id, { branchId: other.id, q: "" }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });
});

describe("listDraftChoices (05 fields 6, 7, 12, 13; 04 rule 2)", () => {
  it("active departments of the branch only, active companies and extra cost types, and the settings", async () => {
    const { branch, manager } = await scene();
    const open = await insertDepartment(branch.id, { responsibleName: "Jasur Toshev" });
    const closed = await insertDepartment(branch.id, { isActive: false });
    const foreign = await insertDepartment((await insertBranch()).id);
    const company = await insertCompany();
    const oldCompany = await insertCompany({ isActive: false });
    const type = await insertExtraCostType();
    const oldType = await insertExtraCostType({ isActive: false });
    await setDefaultPaymentType("TRANSFER");

    const choices = await listDraftChoices(manager.id, { branchId: branch.id });
    expect(choices.departments).toEqual([
      expect.objectContaining({ id: open.id, responsibleName: "Jasur Toshev" }),
    ]);
    const departmentIds = choices.departments.map((department) => department.id);
    expect(departmentIds).not.toContain(closed.id);
    expect(departmentIds).not.toContain(foreign.id);
    const companyIds = choices.companies.map((entry) => entry.id);
    expect(companyIds).toContain(company.id);
    expect(companyIds).not.toContain(oldCompany.id);
    const typeIds = choices.extraCostTypes.map((entry) => entry.id);
    expect(typeIds).toContain(type.id);
    expect(typeIds).not.toContain(oldType.id);
    expect(choices).toMatchObject({ defaultPaymentType: "TRANSFER", priceHintPercent: 20 });
  });

  it("another branch is not_found (03 rule 1)", async () => {
    const { manager } = await scene();
    const other = await insertBranch();
    await expect(listDraftChoices(manager.id, { branchId: other.id })).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});
