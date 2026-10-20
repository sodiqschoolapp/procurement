import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { enterStockDirectly } from "../actions/direct-entry";
import { issueStock } from "../actions/issue";
import { returnStock } from "../actions/return";
import { receiveTransfer } from "../actions/receive-transfer";
import { reverseStockDocument } from "../actions/reverse";
import { sendTransfer } from "../actions/transfer";
import { askWriteOff } from "../actions/write-off";
import { decideWriteOff } from "../actions/write-off-decision";
import { getStockDocument } from "./document";

// A document's page (plan of 5.11, decided item 11; opened to every type by 5.12, decided item 3).
// 03-roles-and-permissions.md, Permission matrix "See orders, stock and reports" and rule 1
// (another branch is "Not found"); 09 Other documents, Write-off; developer-rules.md rule 2
// (`canDecide` asks writeOffDecisionMove(), `canReverse` reverseAllows()); Decided ahead,
// question 19 (who reverses which type).

beforeEach(() => {
  setClock("2031-05-03T06:00:00Z");
});

/** A Manager's waiting write-off of 2 out of 5 in the branch; asserted (D38). */
async function waiting(branchId: string) {
  const item = await insertItem();
  const asker = await insertUser("MANAGER", { branches: [branchId] });
  await receive(branchId, item.variantId, "5", 1000n, asker.id);
  const asked = await runAction(askWriteOff, asker.id, {
    clientKey: randomUUID(),
    branchId,
    docDate: "2031-05-03",
    reason: "EXPIRED",
    comment: "Sinov izoh",
    lines: [{ variantId: item.variantId, qty: "2" }],
  });
  if (!asked.ok) throw new Error(`fixture: ${asked.error.code}`);
  return { ...asked.data, asker, item };
}

describePermissionMatrix("getStockDocument", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { documentId } = await waiting(branchId);
    const found = await getStockDocument(user.id, documentId);
    if (!found) throw new AuthorizationError("not_found");
    expect(found.id).toBe(documentId);
  },
});

describe("getStockDocument: a write-off (plan of 5.11)", () => {
  it("shows the header and the lines with the stock of now; the Head may decide while it waits", async () => {
    const branch = await insertBranch();
    const head = await insertUser("HEAD");
    const w = await waiting(branch.id);
    const found = await getStockDocument(head.id, w.documentId);
    expect(found).toMatchObject({
      number: w.number,
      status: "PENDING_APPROVAL",
      docDate: "2031-05-03",
      branchCode: branch.code,
      reason: "EXPIRED",
      comment: "Sinov izoh",
      createdBy: w.asker.fullName,
      decidedBy: null,
      decidedAt: null,
      canDecide: true,
      lines: [
        {
          productName: w.item.name,
          subtypeName: null,
          qty: "2.000",
          inStock: "5.000",
        },
      ],
    });

    setClock("2031-05-04T09:00:00Z");
    const decided = await runAction(decideWriteOff, head.id, {
      documentId: w.documentId,
      outcome: "APPROVE",
    });
    expect(decided.ok).toBe(true);
    const after = await getStockDocument(head.id, w.documentId);
    expect(after).toMatchObject({
      status: "POSTED",
      decidedBy: head.fullName,
      decidedAt: new Date("2031-05-04T09:00:00Z"),
      canDecide: false,
      canReverse: true,
      lines: [{ inStock: "3.000" }],
    });
    // An approved write-off is reversed by the Head only, not by its asker (Decided ahead,
    // question 19; permission review of 5.12, must fix 2).
    expect(await getStockDocument(w.asker.id, w.documentId)).toMatchObject({
      status: "POSTED",
      canReverse: false,
    });
  });

  it("a Principal and the Manager who asked see it, read only (canDecide false)", async () => {
    const branch = await insertBranch();
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const w = await waiting(branch.id);
    for (const userId of [principal.id, w.asker.id]) {
      expect(await getStockDocument(userId, w.documentId)).toMatchObject({
        status: "PENDING_APPROVAL",
        canDecide: false,
      });
    }
  });

  it("answers Not found for another branch's write-off and an id that is no uuid (03 rule 1)", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [own.id] });
    // Another branch's write-off, waiting like an own one would be.
    const theirs = await waiting(other.id);
    expect(await getStockDocument(manager.id, theirs.documentId)).toBeNull();
    expect(await getStockDocument(manager.id, "not-an-id")).toBeNull();
    const own2 = await waiting(own.id);
    expect((await getStockDocument(manager.id, own2.documentId))?.id).toBe(own2.documentId);
    const count = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from stock_documents where branch_id = ${own.id}`,
    );
    expect(count.rows[0]!.n).toBe(1);
  });
});

/** An issue of 2 out of 5 by a Manager of the branch, to a department; asserted (D38). */
async function issued(branchId: string) {
  const item = await insertItem();
  const maker = await insertUser("MANAGER", { branches: [branchId] });
  await receive(branchId, item.variantId, "5", 1000n, maker.id);
  const department = await insertDepartment(branchId, {
    name: `Kimyo ${randomUUID().slice(0, 6)}`,
  });
  const made = await runAction(issueStock, maker.id, {
    clientKey: randomUUID(),
    branchId,
    docDate: "2031-05-03",
    departmentId: department.id,
    receivedByName: "Sinov Qabulqiluvchi",
    comment: "Sinov izoh",
    lines: [{ variantId: item.variantId, qty: "2" }],
  });
  if (!made.ok) throw new Error(`fixture: ${made.error.code}`);
  return { ...made.data, maker, item, department };
}

describe("getStockDocument: every type (plan of 5.12, decided item 3)", () => {
  it("an issue: its department, who received, who made it; the maker and the Head may reverse it and download its note; a Principal reads only", async () => {
    const branch = await insertBranch();
    const head = await insertUser("HEAD");
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const other = await insertUser("MANAGER", { branches: [branch.id] });
    const doc = await issued(branch.id);

    expect(await getStockDocument(doc.maker.id, doc.documentId)).toMatchObject({
      number: doc.number,
      type: "ISSUE",
      status: "POSTED",
      departmentName: doc.department.name,
      receivedByName: "Sinov Qabulqiluvchi",
      reason: null,
      comment: "Sinov izoh",
      imported: false,
      createdBy: doc.maker.fullName,
      reversedBy: null,
      lines: [{ productName: doc.item.name, qty: "2.000", inStock: "3.000" }],
      canDecide: false,
      canReverse: true,
      canDownloadNote: true,
    });
    expect(await getStockDocument(head.id, doc.documentId)).toMatchObject({
      canReverse: true,
      canDownloadNote: true,
    });
    // Another Manager of the branch did not make it (09 Issue 3: "its creator or the Head").
    expect(await getStockDocument(other.id, doc.documentId)).toMatchObject({
      canReverse: false,
      canDownloadNote: true,
    });
    expect(await getStockDocument(principal.id, doc.documentId)).toMatchObject({
      canReverse: false,
      canDecide: false,
    });
  });

  it("a reversed issue shows who reversed it, when and why, and offers Reverse to nobody", async () => {
    const branch = await insertBranch();
    const head = await insertUser("HEAD");
    const doc = await issued(branch.id);
    setClock("2031-05-04T09:00:00Z");
    const reversed = await runAction(reverseStockDocument, head.id, {
      documentId: doc.documentId,
      reason: "Xato kiritilgan",
    });
    expect(reversed.ok).toBe(true);
    expect(await getStockDocument(head.id, doc.documentId)).toMatchObject({
      status: "REVERSED",
      reversedBy: head.fullName,
      reversedAt: new Date("2031-05-04T09:00:00Z"),
      reverseReason: "Xato kiritilgan",
      canReverse: false,
      canDownloadNote: true,
    });
  });

  it("a direct entry: its reason; the Head may reverse it, its Manager may not (Decided ahead, question 19); no note", async () => {
    const branch = await insertBranch();
    const head = await insertUser("HEAD");
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const item = await insertItem();
    const made = await runAction(enterStockDirectly, head.id, {
      clientKey: randomUUID(),
      branchId: branch.id,
      docDate: "2031-05-03",
      reason: "GIFT",
      comment: null,
      lines: [{ variantId: item.variantId, qty: "4", unitCost: "1000" }],
    });
    if (!made.ok) throw new Error(`fixture: ${made.error.code}`);
    expect(await getStockDocument(head.id, made.data.documentId)).toMatchObject({
      type: "DIRECT_ENTRY",
      status: "POSTED",
      reason: "GIFT",
      departmentName: null,
      createdBy: head.fullName,
      canReverse: true,
      canDownloadNote: false,
    });
    expect(await getStockDocument(manager.id, made.data.documentId)).toMatchObject({
      type: "DIRECT_ENTRY",
      canReverse: false,
      canDownloadNote: false,
    });
  });

  it("a direct entry's cost per unit reaches the Head only, posted and reversed (09 Direct entry by the Head 4; plan of 7.4b, decided item 5)", async () => {
    const branch = await insertBranch();
    const head = await insertUser("HEAD");
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    const item = await insertItem({ referencePrice: 9000n });
    const made = await runAction(enterStockDirectly, head.id, {
      clientKey: randomUUID(),
      branchId: branch.id,
      docDate: "2031-05-03",
      reason: "EXISTING_STOCK",
      comment: null,
      lines: [{ variantId: item.variantId, qty: "4", unitCost: "1250" }],
    });
    if (!made.ok) throw new Error(`fixture: ${made.error.code}`);

    const seen = async (userId: string) =>
      (await getStockDocument(userId, made.data.documentId))!.lines.map((line) => line.unitCost);
    expect(await seen(head.id)).toEqual([1250n]);
    for (const reader of [manager, principal, finance])
      expect(await seen(reader.id)).toEqual([null]);

    const reversed = await runAction(reverseStockDocument, head.id, {
      documentId: made.data.documentId,
      reason: "Xato kiritilgan",
    });
    expect(reversed.ok).toBe(true);
    expect(await seen(head.id)).toEqual([1250n]);
    expect(await seen(manager.id)).toEqual([null]);
  });

  it("no other type carries a cost per unit, not even to the Head: an issue, and a return whose lines store one (plan of 7.4b, decided item 5)", async () => {
    const branch = await insertBranch();
    const head = await insertUser("HEAD");
    const doc = await issued(branch.id);
    expect(
      (await getStockDocument(head.id, doc.documentId))!.lines.map((line) => line.unitCost),
    ).toEqual([null]);
    const back = await runAction(returnStock, doc.maker.id, {
      clientKey: randomUUID(),
      branchId: branch.id,
      docDate: "2031-05-03",
      departmentId: doc.department.id,
      comment: null,
      lines: [{ variantId: doc.item.variantId, qty: "1" }],
    });
    if (!back.ok) throw new Error(`fixture: ${back.error.code}`);
    const stored = await db.execute<{ unit_cost: string | null }>(sql`
      select unit_cost::text as unit_cost from stock_document_lines
      where document_id = ${back.data.documentId}`);
    expect(stored.rows[0]!.unit_cost).not.toBeNull();
    expect(
      (await getStockDocument(head.id, back.data.documentId))!.lines.map((line) => line.unitCost),
    ).toEqual([null]);
  });

  it("a return: its department, reversible by its maker; no note", async () => {
    const branch = await insertBranch();
    const doc = await issued(branch.id);
    const made = await runAction(returnStock, doc.maker.id, {
      clientKey: randomUUID(),
      branchId: branch.id,
      docDate: "2031-05-03",
      departmentId: doc.department.id,
      comment: null,
      lines: [{ variantId: doc.item.variantId, qty: "1" }],
    });
    if (!made.ok) throw new Error(`fixture: ${made.error.code}`);
    expect(await getStockDocument(doc.maker.id, made.data.documentId)).toMatchObject({
      type: "RETURN",
      departmentName: doc.department.name,
      canReverse: true,
      canDownloadNote: false,
    });
    // Another Manager of the branch did not make it (09 Issue 3; question 19).
    const other = await insertUser("MANAGER", { branches: [branch.id] });
    expect(await getStockDocument(other.id, made.data.documentId)).toMatchObject({
      type: "RETURN",
      canReverse: false,
    });
  });

  it("the maker with RETURN_REVERSE switched off may not reverse their issue; the Head still may (03 Manager rights; permission review of 5.12, must fix 1)", async () => {
    const branch = await insertBranch();
    const head = await insertUser("HEAD");
    const doc = await issued(branch.id);
    await setManagerRight(doc.maker.id, "RETURN_REVERSE", false);
    expect(await getStockDocument(doc.maker.id, doc.documentId)).toMatchObject({
      status: "POSTED",
      canReverse: false,
    });
    expect(await getStockDocument(head.id, doc.documentId)).toMatchObject({ canReverse: true });
  });

  it("another branch's issue is Not found, an own one beside it is read (03 rule 1; D40)", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [own.id] });
    const theirs = await issued(other.id);
    const mine = await issued(own.id);
    expect(await getStockDocument(manager.id, theirs.documentId)).toBeNull();
    expect((await getStockDocument(manager.id, mine.documentId))?.type).toBe("ISSUE");
    // Another branch's direct entry too: the query reads every type (permission review, should fix 2).
    const head = await insertUser("HEAD");
    const item = await insertItem();
    const entry = await runAction(enterStockDirectly, head.id, {
      clientKey: randomUUID(),
      branchId: other.id,
      docDate: "2031-05-03",
      reason: "GIFT",
      comment: null,
      lines: [{ variantId: item.variantId, qty: "1", unitCost: "1000" }],
    });
    if (!entry.ok) throw new Error(`fixture: ${entry.error.code}`);
    expect(await getStockDocument(manager.id, entry.data.documentId)).toBeNull();
    expect(await getStockDocument(head.id, entry.data.documentId)).not.toBeNull();
  });
});

describe("getStockDocument: a transfer (plans of 7.1 and 7.2; 7.2 decided item 3)", () => {
  async function sent(from: string, to: string) {
    const item = await insertItem();
    const sender = await insertUser("MANAGER", { branches: [from] });
    await receive(from, item.variantId, "5", 1000n, sender.id);
    const made = await runAction(sendTransfer, sender.id, {
      clientKey: randomUUID(),
      branchId: from,
      toBranchId: to,
      docDate: "2031-05-03",
      receivedByName: "Sinov Haydovchi",
      comment: null,
      lines: [{ variantId: item.variantId, qty: "2" }],
    });
    if (!made.ok) throw new Error(`fixture: ${made.error.code}`);
    return { ...made.data, sender, item };
  }

  it("shows both branches, who sent it and In transit, and no stock; its note may be downloaded; nobody may reverse, decide or receive it from the sending side", async () => {
    const from = await insertBranch();
    const to = await insertBranch();
    const head = await insertUser("HEAD");
    const t = await sent(from.id, to.id);
    expect(await getStockDocument(t.sender.id, t.documentId)).toMatchObject({
      number: t.number,
      type: "TRANSFER",
      status: "IN_TRANSIT",
      branchCode: from.code,
      toBranchCode: to.code,
      toBranchName: to.name,
      departmentName: null,
      receivedByName: "Sinov Haydovchi",
      createdBy: t.sender.fullName,
      // A transfer's lines read no stock (7.2, review of the plan, must fix 1).
      lines: [
        {
          productName: t.item.name,
          qty: "2.000",
          inStock: null,
          receivedQty: null,
          shortQty: null,
        },
      ],
      canDecide: false,
      canReverse: false,
      canDownloadNote: true,
      canReceive: false,
    });
    expect(await getStockDocument(head.id, t.documentId)).toMatchObject({
      canReverse: false,
      canDownloadNote: true,
      canReceive: true,
    });
  });

  // 7.1 kept the transfer from the receiving branch until 7.2 (its decided item 5); 7.2 opens it
  // (decided item 3, Look first), so this test changed with the requirement.
  it("is read by every role of the receiving branch, holding no stock of the sender; only its Managers and the Head may receive; a third branch gets Not found (03 rule 1; 7.2 decided items 2 and 3)", async () => {
    const from = await insertBranch();
    const to = await insertBranch();
    const third = await insertBranch();
    const t = await sent(from.id, to.id);
    const there = await insertUser("MANAGER", { branches: [to.id] });
    const both = await insertUser("MANAGER", { branches: [from.id, to.id] });
    const seen = await getStockDocument(there.id, t.documentId);
    expect(seen).toMatchObject({
      type: "TRANSFER",
      branchCode: from.code,
      toBranchCode: to.code,
      canReceive: true,
      canReverse: false,
      canDownloadNote: true,
    });
    expect(seen!.lines.map((line) => line.inStock)).toEqual([null]);
    expect(await getStockDocument(both.id, t.documentId)).toMatchObject({ canReceive: true });
    for (const role of ["PRINCIPAL", "FINANCE"] as const) {
      const user = await insertUser(role, { branches: [to.id] });
      expect(await getStockDocument(user.id, t.documentId)).toMatchObject({
        canReceive: false,
        canDownloadNote: true,
      });
    }
    // A Manager of a third branch, with a transfer of their own to the same receiver beside it.
    const elsewhere = await insertUser("MANAGER", { branches: [third.id] });
    await sent(third.id, to.id);
    expect(await getStockDocument(elsewhere.id, t.documentId)).toBeNull();
  });

  it("once received, shows what arrived and what was short, and nobody may receive it again", async () => {
    const from = await insertBranch();
    const to = await insertBranch();
    const t = await sent(from.id, to.id);
    const there = await insertUser("MANAGER", { branches: [to.id] });
    const [line] = (
      await db.execute<{ id: string }>(
        sql`select id from stock_document_lines where document_id = ${t.documentId}`,
      )
    ).rows;
    const received = await runAction(receiveTransfer, there.id, {
      documentId: t.documentId,
      receivedByName: null,
      lines: [{ lineId: line!.id, receivedQty: "1.5" }],
    });
    expect(received.ok).toBe(false);
    const done = await runAction(receiveTransfer, there.id, {
      documentId: t.documentId,
      receivedByName: null,
      lines: [{ lineId: line!.id, receivedQty: "1" }],
    });
    if (!done.ok) throw new Error(`fixture: ${done.error.code}`);
    const head = await insertUser("HEAD");
    expect(await getStockDocument(there.id, t.documentId)).toMatchObject({
      status: "RECEIVED",
      decidedBy: there.fullName,
      lines: [{ qty: "2.000", receivedQty: "1.000", shortQty: "1", inStock: null }],
      canReceive: false,
      canReverse: false,
    });
    expect(await getStockDocument(head.id, t.documentId)).toMatchObject({
      canReceive: false,
      canReverse: true,
    });
  });
});
