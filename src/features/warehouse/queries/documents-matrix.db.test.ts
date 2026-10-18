import { AuthorizationError } from "@/server/authorize";
import { expect } from "vitest";

import { insertItem, insertDepartment } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { postDocument, receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { documentDepartmentChoices, listStockDocuments } from "./documents";

// The queries of the documents list in the permission matrix (15-quality-and-acceptance.md, Test
// layers: "each action × each role × own branch and other branch"; 03-roles-and-permissions.md,
// Permission matrix "See orders, stock and reports": Head all branches, Manager own branches,
// Principal own branch, Finance own branches; rule 1: another branch is "Not found"; plan of
// 5.12). A list that leaves the other branch's rows out answers "not_found" here.

/** A posted issue in the branch, by a Manager of it. */
async function issueIn(branchId: string) {
  const maker = await insertUser("MANAGER", { branches: [branchId] });
  const item = await insertItem();
  await receive(branchId, item.variantId, "3", 1000n, maker.id);
  const department = await insertDepartment(branchId);
  const issue = await postDocument({
    type: "ISSUE",
    branchId,
    departmentId: department.id,
    createdBy: maker.id,
    lines: [{ variantId: item.variantId, qty: "1" }],
  });
  return { ...issue, department };
}

describePermissionMatrix("listStockDocuments", {
  permission: "data.view",
  async run({ user, branchId }) {
    const issue = await issueIn(branchId);
    // With the branch filter: another branch is refused by authorize().
    const page = await listStockDocuments(user.id, {
      branch: branchId,
      department: issue.department.id,
    });
    expect(page.rows.map((row) => row.id)).toEqual([issue.documentId]);
  },
});

describePermissionMatrix("listStockDocuments, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const issue = await issueIn(branchId);
    const page = await listStockDocuments(user.id, { department: issue.department.id });
    if (!page.rows.some((row) => row.id === issue.documentId)) {
      throw new AuthorizationError("not_found");
    }
  },
});

describePermissionMatrix("documentDepartmentChoices", {
  permission: "data.view",
  async run({ user, branchId }) {
    const department = await insertDepartment(branchId);
    const choices = await documentDepartmentChoices(user.id, branchId);
    expect(choices.map((choice) => choice.id)).toContain(department.id);
  },
});

describePermissionMatrix("documentDepartmentChoices, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const department = await insertDepartment(branchId);
    const choices = await documentDepartmentChoices(user.id);
    if (!choices.some((choice) => choice.id === department.id)) {
      throw new AuthorizationError("not_found");
    }
  },
});
