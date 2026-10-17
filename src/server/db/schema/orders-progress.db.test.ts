import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";

// The two CHECKs of migration 0026_finish_buying (plan of 3.5, decided item 5, Look first;
// 07-purchasing.md, Order progress; 06-approval-workflow.md, Statuses and rule 3;
// developer-rules.md rule 5). Each forbidden write goes straight to the table with nothing in front,
// on insert and on update (D39), beside the write the guard must let through (D40).

const CHECK = "23514";
const REASON = "Not in any shop this week";

let branchId: string;
let ownerId: string;

beforeAll(async () => {
  branchId = (await insertBranch()).id;
  ownerId = (await insertUser("MANAGER", { branches: [branchId] })).id;
});

const order = (row: Partial<Parameters<typeof insertOrder>[0]> = {}) =>
  insertOrder({ branchId, ownerId, status: "PURCHASING", ...row });

function setProgress(id: string, progress: string, finishReason: string | null) {
  return db.execute(
    sql`update orders set progress = ${progress}, finish_reason = ${finishReason} where id = ${id}`,
  );
}

const reasonRefused = { code: CHECK, constraint: "orders_finish_reason_check" };
const statusRefused = { code: CHECK, constraint: "orders_progress_status_check" };

describe("orders_finish_reason_check: Done short and Not bought carry their reason, no other progress", () => {
  it("on insert: Done short or Not bought without a reason, Open or Done with one, are refused", async () => {
    for (const progress of ["DONE_SHORT", "NOT_BOUGHT"] as const) {
      expect(await refusalOf(order({ progress, finishReason: null }))).toMatchObject(reasonRefused);
    }
    for (const progress of ["OPEN", "DONE"] as const) {
      expect(await refusalOf(order({ progress, finishReason: REASON }))).toMatchObject(
        reasonRefused,
      );
    }
  });

  it("on insert: a reason of 4 or 501 characters is refused; 5 and 500 pass", async () => {
    for (const finishReason of ["abcd", "x".repeat(501)]) {
      expect(await refusalOf(order({ progress: "DONE_SHORT", finishReason }))).toMatchObject(
        reasonRefused,
      );
    }
    await order({ progress: "DONE_SHORT", finishReason: "abcde" });
    await order({ progress: "NOT_BOUGHT", finishReason: "x".repeat(500) });
  });

  it("on update: each refused case, and the writes of Finish, Not bought and Reopen pass", async () => {
    const one = await order();
    expect(await refusalOf(setProgress(one.id, "DONE_SHORT", null))).toMatchObject(reasonRefused);
    expect(await refusalOf(setProgress(one.id, "NOT_BOUGHT", null))).toMatchObject(reasonRefused);
    expect(await refusalOf(setProgress(one.id, "OPEN", REASON))).toMatchObject(reasonRefused);
    expect(await refusalOf(setProgress(one.id, "DONE", REASON))).toMatchObject(reasonRefused);
    expect(await refusalOf(setProgress(one.id, "DONE_SHORT", "x".repeat(501)))).toMatchObject(
      reasonRefused,
    );
    await setProgress(one.id, "DONE_SHORT", REASON);
    // Reopen clears the reason in the same update.
    await setProgress(one.id, "OPEN", null);
    await setProgress(one.id, "NOT_BOUGHT", REASON);
    await setProgress(one.id, "DONE", null);
  });
});

describe("orders_progress_status_check: a finished progress exists only from Open on", () => {
  it("on insert: a Draft with Done is refused; Waiting for settlement and Closed with one pass", async () => {
    expect(await refusalOf(order({ status: "DRAFT", progress: "DONE" }))).toMatchObject(
      statusRefused,
    );
    expect(
      await refusalOf(
        order({ status: "PENDING_FINANCE", progress: "NOT_BOUGHT", finishReason: REASON }),
      ),
    ).toMatchObject(statusRefused);
    await order({ status: "SETTLEMENT", progress: "DONE_SHORT", finishReason: REASON });
    await order({ status: "CLOSED", progress: "DONE", closedAt: new Date() });
  });

  it("on update: a finished progress on a Waiting-for-Finance order is refused; on an Open one it passes", async () => {
    const waiting = await order({ status: "PENDING_FINANCE" });
    expect(await refusalOf(setProgress(waiting.id, "DONE", null))).toMatchObject(statusRefused);
    expect(await refusalOf(setProgress(waiting.id, "NOT_BOUGHT", REASON))).toMatchObject(
      statusRefused,
    );
    const open = await order();
    await setProgress(open.id, "DONE", null);
  });
});
