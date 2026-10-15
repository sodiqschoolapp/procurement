import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { products } from "@/server/db/schema";

import { insertCategory, insertUnit } from "../../../../tests/helpers/catalog";
import { importSheet, productRow } from "../../../../tests/helpers/imports";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { previewImport } from "./imports";

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
