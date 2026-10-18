import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { postDocument, receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { askWriteOff } from "../actions/write-off";
import { decideWriteOff } from "../actions/write-off-decision";
import { getWriteOff } from "./write-off";

// A write-off's page (plan of 5.11, decided item 11). 03-roles-and-permissions.md, Permission
// matrix "See orders, stock and reports" and rule 1 (another branch is "Not found"); 09 Other
// documents, Write-off; developer-rules.md rule 2 (`canDecide` asks writeOffDecisionMove()).

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

describePermissionMatrix("getWriteOff", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { documentId } = await waiting(branchId);
    const found = await getWriteOff(user.id, documentId);
    if (!found) throw new AuthorizationError("not_found");
    expect(found.id).toBe(documentId);
  },
});

describe("getWriteOff (plan of 5.11)", () => {
  it("shows the header and the lines with the stock of now; the Head may decide while it waits", async () => {
    const branch = await insertBranch();
    const head = await insertUser("HEAD");
    const w = await waiting(branch.id);
    const found = await getWriteOff(head.id, w.documentId);
    expect(found).toMatchObject({
      number: w.number,
      status: "PENDING_APPROVAL",
      docDate: "2031-05-03",
      branchCode: branch.code,
      reason: "EXPIRED",
      comment: "Sinov izoh",
      askedBy: w.asker.fullName,
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
    const after = await getWriteOff(head.id, w.documentId);
    expect(after).toMatchObject({
      status: "POSTED",
      decidedBy: head.fullName,
      decidedAt: new Date("2031-05-04T09:00:00Z"),
      canDecide: false,
      lines: [{ inStock: "3.000" }],
    });
  });

  it("a Principal and the Manager who asked see it, read only (canDecide false)", async () => {
    const branch = await insertBranch();
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const w = await waiting(branch.id);
    for (const userId of [principal.id, w.asker.id]) {
      expect(await getWriteOff(userId, w.documentId)).toMatchObject({
        status: "PENDING_APPROVAL",
        canDecide: false,
      });
    }
  });

  it("answers Not found for another branch's write-off, a document of another type, and an id that is no uuid (03 rule 1)", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [own.id] });
    // Another branch's write-off, waiting like an own one would be.
    const theirs = await waiting(other.id);
    expect(await getWriteOff(manager.id, theirs.documentId)).toBeNull();
    // An own branch's issue: every value but the type would let it in.
    const item = await insertItem();
    await receive(own.id, item.variantId, "5", 1000n, manager.id);
    const issue = await postDocument({
      type: "ISSUE",
      branchId: own.id,
      departmentId: (await insertDepartment(own.id)).id,
      createdBy: manager.id,
      lines: [{ variantId: item.variantId, qty: "1" }],
    });
    expect(await getWriteOff(manager.id, issue.documentId)).toBeNull();
    expect(await getWriteOff(manager.id, "not-an-id")).toBeNull();
    const own2 = await waiting(own.id);
    expect((await getWriteOff(manager.id, own2.documentId))?.id).toBe(own2.documentId);
    const count = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from stock_documents where branch_id = ${own.id}`,
    );
    expect(count.rows[0]!.n).toBe(2);
  });
});
