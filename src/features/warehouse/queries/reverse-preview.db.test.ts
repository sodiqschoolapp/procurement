import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { createDocument } from "@/server/stock-documents";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes, insertUnit } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import { postDocument, receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { askWriteOff } from "../actions/write-off";
import { decideWriteOff } from "../actions/write-off-decision";
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

describe("getReversePreview of a direct entry (plan of 5.8, decided item 2; Decided ahead, question 19)", () => {
  it("the Head gets it; a Manager of the branch with RETURN_REVERSE on is refused, even as its recorded creator", async () => {
    const branch = await insertBranch();
    const head = await insertUser("HEAD");
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const pens = (await insertItem()).variantId;
    const entry = await db.transaction((tx) =>
      createDocument(tx, {
        type: "DIRECT_ENTRY",
        branchId: branch.id,
        docDate: "2031-05-03",
        status: "POSTED",
        reason: "GIFT",
        clientKey: randomUUID(),
        createdBy: manager.id,
        lines: [{ variantId: pens, qty: "3", unitCost: 0n }],
      }),
    );
    const preview = await getReversePreview(head.id, entry.documentId);
    expect(preview).toMatchObject({
      number: entry.number,
      type: "DIRECT_ENTRY",
      status: "POSTED",
      departmentName: null,
    });
    expect(preview.lines).toEqual([
      expect.objectContaining({ variantId: pens, qty: "3.000", held: null }),
    ]);
    await expect(getReversePreview(manager.id, entry.documentId)).rejects.toMatchObject({
      kind: "forbidden",
    });
  });
});

describe("getReversePreview of an approved write-off (plan of 5.11; Decided ahead, question 19)", () => {
  it("the Head gets it; the Manager who asked, with RETURN_REVERSE on, is refused", async () => {
    const branch = await insertBranch();
    const head = await insertUser("HEAD");
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const pens = (await insertItem()).variantId;
    await receive(branch.id, pens, "5", 1000n, head.id);
    const asked = await runAction(askWriteOff, manager.id, {
      clientKey: randomUUID(),
      branchId: branch.id,
      docDate: "2031-05-03",
      reason: "EXPIRED",
      comment: "Sinov izoh",
      lines: [{ variantId: pens, qty: "3" }],
    });
    if (!asked.ok) throw new Error(`fixture: ${asked.error.code}`);
    const decided = await runAction(decideWriteOff, head.id, {
      documentId: asked.data.documentId,
      outcome: "APPROVE",
    });
    expect(decided.ok).toBe(true);
    const preview = await getReversePreview(head.id, asked.data.documentId);
    expect(preview).toMatchObject({
      number: asked.data.number,
      type: "WRITE_OFF",
      status: "POSTED",
      departmentName: null,
    });
    expect(preview.lines).toEqual([
      expect.objectContaining({ variantId: pens, qty: "3.000", held: null }),
    ]);
    await expect(getReversePreview(manager.id, asked.data.documentId)).rejects.toMatchObject({
      kind: "forbidden",
    });
  });
});
