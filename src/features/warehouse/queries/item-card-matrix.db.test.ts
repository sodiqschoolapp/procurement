import { expect } from "vitest";

import { insertProduct } from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { getItemCard } from "./item-card";

// The item card in the permission matrix (15-quality-and-acceptance.md, Test layers: "each
// action × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission
// matrix "See orders, stock and reports": Head all branches, Manager own branches, Principal own
// branch, Finance own branches; rule 1: another branch is "Not found"; plan of 5.3).

describePermissionMatrix("getItemCard", {
  permission: "data.view",
  async run({ user, branchId }) {
    const product = await insertProduct();
    const card = await getItemCard(user.id, product.defaultVariantId, branchId);
    expect(card?.variantId).toBe(product.defaultVariantId);
  },
});
