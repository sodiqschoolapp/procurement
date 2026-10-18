import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { heldWhile } from "../../../../tests/helpers/held-while";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { issueStock } from "./issue";
import { returnStock } from "./return";

// Two returns of one department at the same moment (09-warehouse.md, Other documents: "Returning
// more than that department ever received shows a warning and needs a comment"; 15 Test layers:
// "Actions run two at a time to prove the locks work"; plan of 5.6, decided item 3). The
// department received 5; two Managers return 3 each without a comment. Both real actions start
// while a third transaction holds the department row; the first takes it next, the second waits
// on the first and then counts its return, so it is refused. With the department read FOR SHARE
// both would count 5 and both would post (seen to fail so during the build).

const DAY = "2031-05-05";

describe("two returns of one department at the same moment (plan of 5.6, decided item 3)", () => {
  it("the second counts the first: refused with 2 received left, stock raised once", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const branch = await insertBranch();
    const first = await insertUser("MANAGER", { branches: [branch.id] });
    const second = await insertUser("MANAGER", { branches: [branch.id] });
    const department = await insertDepartment(branch.id);
    const notebook = (await insertItem()).variantId;
    await db.transaction((tx) =>
      postMovement(tx, {
        branchId: branch.id,
        variantId: notebook,
        type: "RECEIPT",
        qtyDelta: "5",
        unitCost: 5_000n,
        createdBy: first.id,
      }),
    );
    const issued = await runAction(issueStock, first.id, {
      clientKey: randomUUID(),
      branchId: branch.id,
      docDate: DAY,
      departmentId: department.id,
      receivedByName: "Sinov Mas'ul",
      comment: null,
      lines: [{ variantId: notebook, qty: "5" }],
    });
    expect(issued.ok).toBe(true);

    const giveBack = (userId: string) => () =>
      runAction(returnStock, userId, {
        clientKey: randomUUID(),
        branchId: branch.id,
        docDate: DAY,
        departmentId: department.id,
        comment: null,
        lines: [{ variantId: notebook, qty: "3" }],
      });
    const [one, two] = await heldWhile(
      "select 1 from departments where id = $1 for update",
      [department.id],
      [giveBack(first.id), giveBack(second.id)],
    );
    expect(one).toMatchObject({ ok: true });
    expect(two).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: {
          "lines.0.qty": "errors.field.overReturn",
          comment: "errors.field.overReturnComment",
        },
        available: { "lines.0.qty": "2.000" },
      },
    });
    const balance = await db.execute<{ qty: string }>(sql`
      select qty::text as qty from stock_balances
      where branch_id = ${branch.id} and variant_id = ${notebook}`);
    expect(balance.rows[0]!.qty).toBe("3.000");
  });
});
