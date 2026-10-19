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
import { startCount } from "./count";
import { issueStock } from "./issue";

// The stock at the start of a count against an issue at the same moment (09-warehouse.md, Other
// documents, Stock count: "If an item moved between the start of the count and the approval, the
// system asks the Manager to count that item again"; plan of 7.3, decided item 2, Look first;
// review of the plan, must fix 1). Both sides are the real actions, started in a fixed order while
// a third transaction holds the item's balance row (.claude/rules/tests.md): the issue waits for
// it FOR UPDATE, the count's FOR SHARE queues behind the issue, so the issue is in the stock at
// start and its movement is the line's `start_seq`. An issue after the start has a larger `seq`.

describe("a count started while an issue holds the item (plan of 7.3, decided item 2)", () => {
  it("waits for the issue: its stock at start holds the issue, and a later issue has a larger seq", async () => {
    setClock("2031-05-05T07:00:00Z");
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const department = await insertDepartment(branch.id);
    const { variantId } = await insertItem();
    await receive(branch.id, variantId, "10", 1_000n, manager.id);

    const issueOf = (qty: string) => () =>
      runAction(issueStock, manager.id, {
        clientKey: randomUUID(),
        branchId: branch.id,
        docDate: "2031-05-05",
        departmentId: department.id,
        receivedByName: "Sinov Qabulqiluvchi",
        comment: null,
        lines: [{ variantId, qty }],
      });
    const start = () =>
      runAction(startCount, manager.id, {
        clientKey: randomUUID(),
        branchId: branch.id,
        categoryId: null,
        comment: null,
      });
    const [issued, counted] = await heldWhile(
      "select 1 from stock_balances where branch_id = $1 and variant_id = $2 for update",
      [branch.id, variantId],
      [issueOf("3"), start],
    );
    expect(issued).toMatchObject({ ok: true });
    expect(counted).toMatchObject({ ok: true });
    const documentId = counted?.ok ? (counted.data as { documentId: string }).documentId : "";

    const seqOf = async () => {
      const found = await db.execute<{ seq: string }>(sql`
        select max(seq)::text as seq from stock_movements
        where branch_id = ${branch.id} and variant_id = ${variantId}`);
      return found.rows[0]!.seq;
    };
    const lineOf = async () => {
      const found = await db.execute<{ qty: string; start_seq: string }>(sql`
        select qty::text as qty, start_seq::text as start_seq from stock_document_lines
        where document_id = ${documentId}`);
      return found.rows[0]!;
    };
    const issueSeq = await seqOf();
    expect(await lineOf()).toEqual({ qty: "7.000", start_seq: issueSeq });

    expect(await issueOf("2")()).toMatchObject({ ok: true });
    expect(BigInt(await seqOf())).toBeGreaterThan(BigInt((await lineOf()).start_seq));
  });
});
