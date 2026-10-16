import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";

import { insertBranch } from "../../tests/helpers/branches";
import { insertOrder } from "../../tests/helpers/orders";
import { insertUser } from "../../tests/helpers/users";
import { readSnapshot } from "./read-snapshot";

// The one snapshot of a multi-statement list (spec review of 2.8, Must fix 1; 05 Group rows 1;
// 08: the totals of a group row are the sums of its orders).

describe("readSnapshot", () => {
  it("every statement sees the moment of the first, though another write commits between them", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
    });
    const seen = await readSnapshot(async (executor) => {
      const [before] = await executor
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, order.id));
      // Committed by another connection while the snapshot is open.
      await db.update(orders).set({ status: "PENDING_PRINCIPAL" }).where(eq(orders.id, order.id));
      const [after] = await executor
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, order.id));
      return [before!.status, after!.status];
    });
    expect(seen).toEqual(["PENDING_HEAD", "PENDING_HEAD"]);
    const [now] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(now!.status).toBe("PENDING_PRINCIPAL");
  });

  it("writes nothing: a write through it is refused", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
    });
    await expect(
      readSnapshot((executor) =>
        executor.update(orders).set({ status: "CANCELLED" }).where(eq(orders.id, order.id)),
      ),
    ).rejects.toThrow();
    const [row] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(row!.status).toBe("PENDING_HEAD");
  });
});
