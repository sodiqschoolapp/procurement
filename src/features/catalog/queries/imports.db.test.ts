import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { products } from "@/server/db/schema";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertCategory, insertUnit } from "../../../../tests/helpers/catalog";
import { importSheet, productRow } from "../../../../tests/helpers/imports";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { authorizeImportKind, previewImport } from "./imports";

// The preview query of an Excel import, called directly (permission review of 1.10, Must fix 3):
// 03-roles-and-permissions.md, "Manage catalogs, users, branches, settings": the Head only. It
// writes nothing (04 rule 7: the preview saves nothing).

async function sheet() {
  const refs = { category: (await insertCategory()).name, measure: (await insertUnit()).name };
  return importSheet("products", [productRow(`Koʻrish ${randomUUID().slice(0, 8)}`, refs)]);
}

describePermissionMatrix("previewImport", {
  permission: "catalog.manage",
  async run({ user }) {
    await previewImport(user.id, "products", await sheet());
  },
});

describe("previewImport", () => {
  it("gives the Head the rows with no error and saves no product", async () => {
    const head = await insertUser("HEAD");
    const before = (await db.select().from(products)).length;
    const preview = await previewImport(head.id, "products", await sheet());
    expect(preview.errors).toEqual([]);
    expect(preview.rows).toHaveLength(1);
    expect((await db.select().from(products)).length).toBe(before);
  });
});

// The page and the template of every kind ask authorizeImportKind() (plan of 5.9; permission
// review of 5.9, should fix 2): a global permission by authorize(), the branch permission of
// stock by authorizeList(), since they name no branch yet. 03 Permission matrix: "Manage
// catalogs …", "Add a new price …" and "Enter stock directly, without an order" are the Head's.
describe("authorizeImportKind: who may open an import page (03 matrix; plan of 5.9)", () => {
  it("the Head every kind; a Manager with every right, a Principal and Finance none", async () => {
    const own = await insertBranch();
    const head = await insertUser("HEAD");
    for (const kind of ["products", "departments", "prices", "stock"] as const) {
      await expect(authorizeImportKind(head.id, kind)).resolves.toBeUndefined();
    }
    for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      const user = await insertUser(role, { branches: [own.id] });
      for (const kind of ["products", "departments", "prices", "stock"] as const) {
        await expect(authorizeImportKind(user.id, kind), `${role} ${kind}`).rejects.toMatchObject({
          kind: "forbidden",
        });
      }
    }
  });
});
