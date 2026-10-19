import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { saveCountedQuantities, startCount } from "../actions/count";
import { listCounts } from "./counts";
import { getStockDocument } from "./document";
import { listStockDocuments } from "./documents";

// The readers of a count (09-warehouse.md, Other documents, Stock count: "The system shows the
// differences"; Stock screens: Documents, "… write-offs and counts, with filters by type"; 11
// Screens: "Stock counts | /warehouse/counts"; plan of 7.3). Each reader of the new values is
// tested: the counts list, the documents list's type filter and the document's page (.claude/
// rules/tests.md). A count is of its own branch only (documentWall(); progress 7.2).

beforeEach(() => {
  setClock("2031-05-03T06:00:00Z");
});

/** A count of the branch started by a Head over one item of 10, and its one line's id. */
async function countIn(branchId: string) {
  const { variantId } = await insertItem();
  const keeper = await insertUser("HEAD");
  await receive(branchId, variantId, "10", 1000n, keeper.id);
  const started = await runAction(startCount, keeper.id, {
    clientKey: randomUUID(),
    branchId,
    categoryId: null,
    comment: null,
  });
  expect(started).toMatchObject({ ok: true });
  const documentId = started.ok ? started.data.documentId : "";
  const line = await db.execute<{ id: string }>(
    sql`select id from stock_document_lines where document_id = ${documentId}`,
  );
  return { documentId, keeper, variantId, lineId: line.rows[0]!.id };
}

describePermissionMatrix("listCounts", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { documentId } = await countIn(branchId);
    const page = await listCounts(user.id, { branch: branchId });
    expect(page.rows.map((row) => row.id)).toEqual([documentId]);
  },
});

describePermissionMatrix("listCounts, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { documentId } = await countIn(branchId);
    const page = await listCounts(user.id);
    if (!page.rows.some((row) => row.id === documentId)) throw new AuthorizationError("not_found");
  },
});

describe("listCounts (11 Screens: Stock counts; plan of 7.3)", () => {
  it("lists only counts, with how many lines are counted", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const first = await countIn(branch.id);
    expect(
      await runAction(saveCountedQuantities, manager.id, {
        documentId: first.documentId,
        lines: [{ lineId: first.lineId, countedQty: "9" }],
      }),
    ).toMatchObject({ ok: true });
    // The second count holds the same one item, not counted yet.
    const second = await runAction(startCount, manager.id, {
      clientKey: randomUUID(),
      branchId: branch.id,
      categoryId: null,
      comment: null,
    });
    expect(second).toMatchObject({ ok: true });
    const page = await listCounts(manager.id, { branch: branch.id });
    expect(page.rows.map((row) => [row.number, row.lines, row.counted])).toEqual([
      [`CNT-${branch.code}-31-0002`, 1, 0],
      [`CNT-${branch.code}-31-0001`, 1, 1],
    ]);
  });
});

describe("a count on its page (09 Stock count: the system shows the differences)", () => {
  it("carries the stock at start, the counted quantity and the difference, and no stock of now", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const { documentId, lineId } = await countIn(branch.id);
    expect(
      await runAction(saveCountedQuantities, manager.id, {
        documentId,
        lines: [{ lineId, countedQty: "8" }],
      }),
    ).toMatchObject({ ok: true });

    const document = await getStockDocument(manager.id, documentId);
    expect(document?.lines).toEqual([
      expect.objectContaining({
        id: lineId,
        qty: "10.000",
        countedQty: "8.000",
        difference: "-2",
        inStock: null,
      }),
    ]);
    expect(document?.canCount).toBe(true);
    expect(document?.canDecide).toBe(false);

    // The documents list's type filter finds it.
    const listed = await listStockDocuments(manager.id, { branch: branch.id, type: "COUNT" });
    expect(listed.rows.map((row) => row.id)).toEqual([documentId]);
  });

  it("canCount: no with WRITE_OFF_COUNT off, no for the Principal, no once decided; another branch Not found", async () => {
    const branch = await insertBranch();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const outsider = await insertUser("MANAGER", { branches: [other.id] });
    const { documentId } = await countIn(branch.id);

    expect((await getStockDocument(principal.id, documentId))?.canCount).toBe(false);
    expect(await getStockDocument(outsider.id, documentId)).toBeNull();
    await setManagerRight(manager.id, "WRITE_OFF_COUNT", false);
    expect((await getStockDocument(manager.id, documentId))?.canCount).toBe(false);
    await setManagerRight(manager.id, "WRITE_OFF_COUNT", true);
    expect((await getStockDocument(manager.id, documentId))?.canCount).toBe(true);
    await db.execute(sql`
      update stock_documents set status = 'REJECTED', decided_by = ${manager.id},
        decided_at = '2031-05-03T06:00:00Z'
      where id = ${documentId}`);
    expect((await getStockDocument(manager.id, documentId))?.canCount).toBe(false);
  });
});
