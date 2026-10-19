import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { heldWhile } from "../../../../tests/helpers/held-while";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { saveCountedQuantities, startCount } from "./count";
import { decideCount } from "./count-decision";
import { issueStock } from "./issue";

// The approval of a count against an issue at the same moment (09-warehouse.md, first paragraph,
// and Other documents, Stock count: "If an item moved between the start of the count and the
// approval, the system asks the Manager to count that item again"; developer-rules.md rule 3; plan
// of 7.4, decided item 9). Both sides are the real actions, started in a fixed order while a third
// transaction holds the item's balance row (.claude/rules/tests.md): the side started first waits
// for it FOR UPDATE and commits first. Issue first: the approval's moved-check runs after its
// balance lock and sees the issue, so nothing is corrected. Approval first: the issue takes from
// the corrected stock. Run once with the approval's balance FOR UPDATE left out: the issue-first
// case then posted −2 against the stock of 7 and left 5 (seen to fail, D46).

async function scene() {
  setClock("2031-05-05T07:00:00Z");
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  const department = await insertDepartment(branch.id);
  const { variantId } = await insertItem();
  await receive(branch.id, variantId, "10", 1_000n, manager.id);
  const started = await runAction(startCount, manager.id, {
    clientKey: randomUUID(),
    branchId: branch.id,
    categoryId: null,
    comment: null,
  });
  if (!started.ok) throw new Error(`fixture: ${started.error.code}`);
  const documentId = started.data.documentId;
  const line = await db.execute<{ id: string }>(
    sql`select id from stock_document_lines where document_id = ${documentId}`,
  );
  const lineId = line.rows[0]!.id;
  const saved = await runAction(saveCountedQuantities, manager.id, {
    documentId,
    lines: [{ lineId, countedQty: "8" }],
  });
  if (!saved.ok) throw new Error(`fixture: ${saved.error.code}`);

  const issue = () =>
    runAction(issueStock, manager.id, {
      clientKey: randomUUID(),
      branchId: branch.id,
      docDate: "2031-05-05",
      departmentId: department.id,
      receivedByName: "Sinov Qabulqiluvchi",
      comment: null,
      lines: [{ variantId, qty: "3" }],
    });
  const approve = () =>
    runAction(decideCount, head.id, {
      documentId,
      outcome: "APPROVE",
      seen: [{ lineId, countedQty: "8" }],
    });
  const stock = async () => {
    const found = await db.execute<{ qty: string }>(sql`
      select qty::text as qty from stock_balances
      where branch_id = ${branch.id} and variant_id = ${variantId}`);
    return found.rows[0]!.qty;
  };
  const hold = [
    "select 1 from stock_balances where branch_id = $1 and variant_id = $2 for update",
    [branch.id, variantId],
  ] as const;
  return { issue, approve, stock, hold };
}

describe("a count approved while an issue holds the item (plan of 7.4, decided item 9)", () => {
  it("issue first: the approval sees the issue and sends the item back; nothing is corrected", async () => {
    const { issue, approve, stock, hold } = await scene();
    const [issued, decided] = await heldWhile(hold[0], [...hold[1]], [issue, approve]);
    expect(issued).toMatchObject({ ok: true });
    expect(decided).toMatchObject({ ok: true, data: { outcome: "RECOUNT", recount: 1 } });
    expect(await stock()).toBe("7.000");
  });

  it("approval first: the stock is corrected to the count, and the issue takes from it", async () => {
    const { issue, approve, stock, hold } = await scene();
    const [decided, issued] = await heldWhile(hold[0], [...hold[1]], [approve, issue]);
    expect(decided).toMatchObject({ ok: true, data: { outcome: "APPROVE" } });
    expect(issued).toMatchObject({ ok: true });
    expect(await stock()).toBe("5.000");
  });
});
