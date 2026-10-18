import { beforeEach, describe, expect, it } from "vitest";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes, insertUnit } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import { postDocument, receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { getReversePreview } from "./reverse-preview";

// The Reverse dialog's preview (plan of 5.7, decided item 6; 11-screens-and-ux.md rule 6, "state
// the result"; 09 Other documents, Return: "Returning more than that department ever received
// shows a warning", which a reverse of an issue follows: review of the plan, correction 1, Look
// first; 03 rule 1). Every fixture is asserted (D38).

beforeEach(() => setClock("2031-05-03T06:00:00Z"));

describe("getReversePreview", () => {
  it("names the number, the department and every line; an issue's line over what the department holds carries that amount", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const department = await insertDepartment(branch.id, { name: "Sinov bo'lim" });
    const pens = (await insertItem()).variantId;
    const unit = await insertUnit({ allowDecimal: false });
    const product = await insertProduct({ unitId: unit.id });
    const [blueId] = await insertSubtypes(product.id, [{ name: "Ko'k" }]);
    const blue = { id: blueId!, name: "Ko'k" };
    await receive(branch.id, pens, "10", 1000n, manager.id);
    await receive(branch.id, blue!.id, "10", 1000n, manager.id);
    const issue = await postDocument({
      type: "ISSUE",
      branchId: branch.id,
      departmentId: department.id,
      createdBy: manager.id,
      lines: [
        { variantId: pens, qty: "5" },
        { variantId: blue!.id, qty: "3" },
      ],
    });
    // The department gave 2 pens back: it holds 3, less than the issue's 5. The subtype's line
    // stays within what it holds (D40).
    await postDocument({
      type: "RETURN",
      branchId: branch.id,
      departmentId: department.id,
      createdBy: manager.id,
      lines: [{ variantId: pens, qty: "2" }],
    });

    const preview = await getReversePreview(manager.id, issue.documentId);
    expect(preview).toMatchObject({
      id: issue.documentId,
      number: issue.number,
      type: "ISSUE",
      status: "POSTED",
      departmentName: "Sinov bo'lim",
    });
    const byVariant = new Map(preview.lines.map((line) => [line.variantId, line]));
    expect(byVariant.get(pens)).toMatchObject({ qty: "5.000", subtypeName: null, held: "3.000" });
    expect(byVariant.get(blue!.id)).toMatchObject({
      qty: "3.000",
      subtypeName: blue!.name,
      held: null,
    });
    expect(preview.lines.map((line) => line.id).sort()).toEqual([...issue.lineIds].sort());
  });

  it("a return's lines carry no warning", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const department = await insertDepartment(branch.id);
    const pens = (await insertItem()).variantId;
    // Nothing was ever issued: the return was over, its reverse is not warned about.
    const back = await postDocument({
      type: "RETURN",
      branchId: branch.id,
      departmentId: department.id,
      createdBy: manager.id,
      lines: [{ variantId: pens, qty: "2" }],
    });
    const preview = await getReversePreview(manager.id, back.documentId);
    expect(preview.lines).toEqual([expect.objectContaining({ variantId: pens, held: null })]);
  });

  it("another branch's document is Not found for a Manager; an unknown or malformed id too (03 rule 1)", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [own.id] });
    const theirs = await insertUser("MANAGER", { branches: [other.id] });
    const department = await insertDepartment(other.id);
    const pens = (await insertItem()).variantId;
    await receive(other.id, pens, "5", 1000n, theirs.id);
    const issue = await postDocument({
      type: "ISSUE",
      branchId: other.id,
      departmentId: department.id,
      createdBy: theirs.id,
      lines: [{ variantId: pens, qty: "1" }],
    });
    await expect(getReversePreview(manager.id, issue.documentId)).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(
      getReversePreview(manager.id, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(getReversePreview(manager.id, "nope")).rejects.toMatchObject({
      kind: "not_found",
    });
    expect((await getReversePreview(theirs.id, issue.documentId)).number).toBe(issue.number);
  });

  it("a Manager who did not make the issue is refused, as the action would (permission review of 5.7, should-fix 1)", async () => {
    const branch = await insertBranch();
    const maker = await insertUser("MANAGER", { branches: [branch.id] });
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const department = await insertDepartment(branch.id);
    const pens = (await insertItem()).variantId;
    await receive(branch.id, pens, "5", 1000n, maker.id);
    const issue = await postDocument({
      type: "ISSUE",
      branchId: branch.id,
      departmentId: department.id,
      createdBy: maker.id,
      lines: [{ variantId: pens, qty: "1" }],
    });
    await expect(getReversePreview(colleague.id, issue.documentId)).rejects.toMatchObject({
      kind: "forbidden",
    });
    expect((await getReversePreview(maker.id, issue.documentId)).number).toBe(issue.number);
  });
});
