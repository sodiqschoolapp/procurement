import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import {
  issueFormChoices,
  searchIssueItems,
  searchTransferItems,
  searchWriteOffItems,
} from "./issue-form";

// The issue form's choices (plan of 5.4). 09-warehouse.md, Issue to a department: "Department …
// from this branch", "Received by … prefilled with the department's responsible person", "Current
// stock is shown beside each line"; 04-catalogs.md rule 2 ("Inactive entries leave the pickers");
// A7 (services are not stocked). Each row kept out has every other value that would let it in
// (.claude/rules/tests.md).

let branch: { id: string };
let other: { id: string };
let head: string;

beforeEach(async () => {
  setClock("2031-05-03T06:00:00Z");
  branch = await insertBranch();
  other = await insertBranch();
  head = (await insertUser("HEAD")).id;
});

async function stock(branchId: string, variantId: string, qty: string) {
  await db.transaction((tx) =>
    postMovement(tx, {
      branchId,
      variantId,
      type: "RECEIPT",
      qtyDelta: qty,
      unitCost: 1000n,
      createdBy: head,
    }),
  );
}

async function out(branchId: string, variantId: string, qty: string) {
  await db.transaction((tx) =>
    postMovement(tx, {
      branchId,
      variantId,
      type: "WRITE_OFF",
      qtyDelta: `-${qty}`,
      unitCost: null,
      createdBy: head,
    }),
  );
}

describe("searchIssueItems: what can be issued from the branch", () => {
  it("lists active goods subtypes with stock above 0 in that branch, with that stock", async () => {
    const product = await insertProduct({ name: "Sinov daftar" });
    const [blue, black, red] = await insertSubtypes(product.id, [
      { name: "Ko'k" },
      { name: "Qora" },
      { name: "Qizil" },
    ]);
    await stock(branch.id, blue!, "7");
    // At 0 in the branch: in stock once, issued since.
    await stock(branch.id, black!, "2");
    await out(branch.id, black!, "2");
    // Only another branch holds it.
    await stock(other.id, red!, "9");

    const items = await searchIssueItems(head, { branchId: branch.id, q: "sinov daftar" });
    expect(items).toEqual([
      {
        id: product.id,
        name: "Sinov daftar",
        unitShortName: expect.any(String),
        allowsDecimals: expect.any(Boolean),
        subtypes: [{ id: blue!, name: "Ko'k", inStock: "7.000", inactive: false }],
      },
    ]);
  });

  it("lists an inactive subtype and an inactive product held, marked, in the issue, write-off and transfer pickers; leaves out one at 0 (04 rule 2; plan of 7.4b, decided items 3 and 6)", async () => {
    const product = await insertProduct({ name: "Sinov qalam" });
    const [kept, dropped] = await insertSubtypes(product.id, [{ name: "A" }, { name: "B" }]);
    await stock(branch.id, kept!, "1");
    await stock(branch.id, dropped!, "1");
    await db.execute(sql`update product_variants set is_active = false where id = ${dropped!}`);
    const closed = await insertItem();
    await stock(branch.id, closed.variantId, "3");
    await db.execute(
      sql`update products set is_active = false where id = (select product_id from product_variants where id = ${closed.variantId})`,
    );

    // An inactive item at 0 in the branch, given every other value that would list it (D46).
    const emptied = await insertItem();
    await stock(branch.id, emptied.variantId, "2");
    await out(branch.id, emptied.variantId, "2");
    await db.execute(
      sql`update products set is_active = false where id = (select product_id from product_variants where id = ${emptied.variantId})`,
    );

    for (const search of [searchIssueItems, searchWriteOffItems, searchTransferItems]) {
      const items = await search(head, { branchId: branch.id });
      const subtypes = items.flatMap((each) => each.subtypes);
      const marks = (id: string) => subtypes.find((subtype) => subtype.id === id)?.inactive;
      expect(marks(kept!)).toBe(false);
      expect(marks(dropped!)).toBe(true);
      expect(marks(closed.variantId)).toBe(true);
      expect(marks(emptied.variantId)).toBeUndefined();
    }
  });
});

describe("issueFormChoices: the branch's departments", () => {
  it("lists the branch's active departments with their responsible person; not another branch's or an inactive one", async () => {
    const listed = await insertDepartment(branch.id, {
      name: "Sinov A",
      responsibleName: "Sinov Mas'ul",
    });
    await insertDepartment(branch.id, { name: "Sinov B", isActive: false });
    await insertDepartment(other.id, { name: "Sinov C" });
    expect(await issueFormChoices(head, { branchId: branch.id })).toEqual([
      { id: listed.id, name: "Sinov A", responsibleName: "Sinov Mas'ul" },
    ]);
  });
});
