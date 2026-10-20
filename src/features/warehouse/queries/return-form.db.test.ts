import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { issueStock } from "../actions/issue";
import { returnStock } from "../actions/return";
import { searchReturnItems } from "./return-form";

// The search of the return form (09-warehouse.md, Other documents: Return from a department; plan
// of 5.6, Server actions and queries). Unlike the issue's, it lists items without stock, and each
// subtype carries what the chosen department received, from the one reader the action uses
// (departmentReceived(), decided item 2): a value read in a new way is tested at every reader.

let branch: { id: string };
let manager: string;
let department: string;
let neighbour: string;

beforeEach(async () => {
  setClock("2031-05-03T06:00:00Z");
  branch = await insertBranch();
  manager = (await insertUser("MANAGER", { branches: [branch.id] })).id;
  department = (await insertDepartment(branch.id)).id;
  neighbour = (await insertDepartment(branch.id)).id;
});

async function receive(variantId: string, qty: string) {
  await db.transaction((tx) =>
    postMovement(tx, {
      branchId: branch.id,
      variantId,
      type: "RECEIPT",
      qtyDelta: qty,
      unitCost: 1000n,
      createdBy: manager,
    }),
  );
}

async function issue(variantId: string, qty: string, to: string) {
  const result = await runAction(issueStock, manager, {
    clientKey: randomUUID(),
    branchId: branch.id,
    docDate: "2031-05-03",
    departmentId: to,
    receivedByName: "Sinov Qabulqiluvchi",
    comment: null,
    lines: [{ variantId, qty }],
  });
  expect(result.ok).toBe(true);
}

describe("searchReturnItems (09 Other documents, Return; plan of 5.6)", () => {
  it("lists an item with no stock at 0, and the department's received amount of each subtype", async () => {
    const tag = randomUUID().slice(0, 8);
    const never = await insertProduct({ name: `Qaytar ${tag} B` });
    const held = await insertProduct({ name: `Qaytar ${tag} A` });
    const [blue, red] = await insertSubtypes(held.id, [{ name: "Ko'k" }, { name: "Qizil" }]);
    await receive(blue!, "10");
    await receive(red!, "10");
    await issue(blue!, "4", department);
    await issue(red!, "6", neighbour);

    const items = await searchReturnItems(manager, {
      branchId: branch.id,
      departmentId: department,
      q: `Qaytar ${tag}`,
    });
    // The product the department holds first, then by name.
    expect(items.map((item) => item.id)).toEqual([held.id, never.id]);
    expect(items[0]!.subtypes).toEqual([
      { id: blue!, name: "Ko'k", inStock: "6.000", received: "4.000", inactive: false },
      { id: red!, name: "Qizil", inStock: "4.000", received: "0", inactive: false },
    ]);
    expect(items[1]!.subtypes).toEqual([
      { id: never.defaultVariantId, name: null, inStock: "0", received: "0", inactive: false },
    ]);
  });

  it("puts a product the department holds first even when its name comes later", async () => {
    const tag = randomUUID().slice(0, 8);
    const first = await insertProduct({ name: `Tartib ${tag} A` });
    const later = await insertProduct({ name: `Tartib ${tag} B` });
    await receive(later.defaultVariantId, "5");
    await issue(later.defaultVariantId, "1", department);
    await receive(first.defaultVariantId, "5");
    await issue(first.defaultVariantId, "1", neighbour);
    const items = await searchReturnItems(manager, {
      branchId: branch.id,
      departmentId: department,
      q: `Tartib ${tag}`,
    });
    expect(items.map((item) => item.id)).toEqual([later.id, first.id]);
  });

  it("leaves out services and inactive products and subtypes (A7; 04 rule 2)", async () => {
    const tag = randomUUID().slice(0, 8);
    await insertProduct({ name: `Chiqar ${tag} xizmat`, type: "SERVICE" });
    await insertProduct({ name: `Chiqar ${tag} eski`, isActive: false });
    const kept = await insertProduct({ name: `Chiqar ${tag} bor` });
    const [, dropped] = await insertSubtypes(kept.id, [
      { name: "Bor" },
      { name: "Yo'q", isActive: false },
    ]);
    const items = await searchReturnItems(manager, {
      branchId: branch.id,
      departmentId: department,
      q: `Chiqar ${tag}`,
    });
    expect(items.map((item) => item.id)).toEqual([kept.id]);
    expect(items[0]!.subtypes.map((subtype) => subtype.id)).not.toContain(dropped);
  });

  it("lists an inactive product or subtype, marked, only for a department that holds it (04 rule 2; plan of 7.4b, decided item 4)", async () => {
    const tag = randomUUID().slice(0, 8);
    const closed = await insertProduct({ name: `Chiqar ${tag} yopiq` });
    const open = await insertProduct({ name: `Chiqar ${tag} ochiq` });
    const [kept, off] = await insertSubtypes(open.id, [{ name: "Bor" }, { name: "Eski" }]);
    for (const variantId of [closed.defaultVariantId, off!]) {
      await receive(variantId, "10");
      await issue(variantId, "4", department);
    }
    // The neighbour received the closed product and gave it all back: it holds none.
    await issue(closed.defaultVariantId, "2", neighbour);
    const back = await runAction(returnStock, manager, {
      clientKey: randomUUID(),
      branchId: branch.id,
      docDate: "2031-05-03",
      departmentId: neighbour,
      comment: null,
      lines: [{ variantId: closed.defaultVariantId, qty: "2" }],
    });
    expect(back.ok).toBe(true);
    await db.execute(sql`update products set is_active = false where id = ${closed.id}`);
    await db.execute(sql`update product_variants set is_active = false where id = ${off!}`);

    const held = await searchReturnItems(manager, {
      branchId: branch.id,
      departmentId: department,
      q: `Chiqar ${tag}`,
    });
    const marks = (items: typeof held, id: string) =>
      items.flatMap((item) => item.subtypes).find((subtype) => subtype.id === id)?.inactive;
    expect(marks(held, closed.defaultVariantId)).toBe(true);
    expect(marks(held, off!)).toBe(true);

    const none = await searchReturnItems(manager, {
      branchId: branch.id,
      departmentId: neighbour,
      q: `Chiqar ${tag}`,
    });
    expect(none.map((item) => item.id)).toEqual([open.id]);
    expect(marks(none, closed.defaultVariantId)).toBeUndefined();
    expect(marks(none, off!)).toBeUndefined();
    expect(marks(none, kept!)).toBe(false);
  });
});
