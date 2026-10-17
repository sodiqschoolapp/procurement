import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ROLES } from "@/domain/permissions";

import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertCategory, insertProduct } from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { listStockOnHand, stockCategoryChoices } from "./stock-on-hand";

// The queries of Stock on hand in the permission matrix (15-quality-and-acceptance.md, Test
// layers: "each action × each role × own branch and other branch"; 03-roles-and-permissions.md,
// Permission matrix "See orders, stock and reports": Head all branches, Manager own branches,
// Principal own branch, Finance own branches; rule 1: another branch is "Not found"; plan of 5.2).
// A list that leaves the other branch's stock out answers "not_found" here.

async function stockIn(branchId: string) {
  const product = await insertProduct();
  await db.execute(sql`
    insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
    values (${branchId}, ${product.defaultVariantId}, 2, 10, now(), now())`);
  return product;
}

describePermissionMatrix("listStockOnHand", {
  permission: "data.view",
  async run({ user, branchId }) {
    const product = await stockIn(branchId);
    // With the branch filter: another branch is refused by authorize().
    const page = await listStockOnHand(user.id, { branch: branchId, q: product.name });
    expect(page.rows.map((row) => row.variantId)).toEqual([product.defaultVariantId]);
  },
});

describePermissionMatrix("listStockOnHand, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const product = await stockIn(branchId);
    const page = await listStockOnHand(user.id, { q: product.name });
    if (!page.rows.some((row) => row.variantId === product.defaultVariantId)) {
      throw new AuthorizationError("not_found");
    }
  },
});

// The category choices have no branch (a catalog is one list for the school): every active role
// reads them, an inactive user is refused (03 matrix "See orders, stock and reports"; decided
// item 6).
describe("stockCategoryChoices (03 matrix: See orders, stock and reports)", () => {
  it.each(ROLES)("a %s reads every category", async (role) => {
    const branch = await insertBranch();
    const user = await insertUser(role, { branches: role === "HEAD" ? [] : [branch.id] });
    const category = await insertCategory();
    const choices = await stockCategoryChoices(user.id);
    expect(choices.map((choice) => choice.id)).toContain(category.id);
  });

  it("an inactive user is refused", async () => {
    const branch = await insertBranch();
    const user = await insertUser("MANAGER", { branches: [branch.id], isActive: false });
    await expect(stockCategoryChoices(user.id)).rejects.toEqual(
      new AuthorizationError("forbidden"),
    );
  });
});
