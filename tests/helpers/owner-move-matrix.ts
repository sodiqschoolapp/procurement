import { describe, expect, it } from "vitest";

import type { RequestStatus } from "@/domain/request-status";
import type { ActionResult } from "@/server/action-result";

import { insertBranch, setManagerRight } from "./branches";
import { insertOrder, orderRow } from "./orders";
import { type InsertedUser, insertUser } from "./users";

// The permission matrix of a move only the order's owner makes: Take back and Submit again,
// written by hand (06-approval-workflow.md, Allowed moves: "Owner"; 03-roles-and-permissions.md,
// Permission matrix "Add, edit, submit, cancel orders"; Manager rights: CREATE_REQUESTS; decisions
// 2.3 item 5, Look first: the Head only as the owner; plan of 2.11). The generated matrix of
// permission-matrix.ts expects the Head allowed on a Manager's order, which the "Owner" rows
// refuse as `forbidden`. Used for the feature definitions and for the page's own exports.

type Move = (
  user: InsertedUser,
  orders: { id: string; version: number }[],
) => Promise<ActionResult<unknown>>;

/** The code the action refused with, the first order's when it names orders; "allow" for ok. */
function answer(result: ActionResult<unknown>): string {
  if (result.ok) return "allow";
  return result.error.orders?.[0]?.code ?? result.error.code;
}

export function describeOwnerMoveMatrix(name: string, status: RequestStatus, move: Move): void {
  const at = (branchId: string, ownerId: string) => insertOrder({ branchId, ownerId, status });
  const once = (user: InsertedUser, orders: { id: string; version: number }[]) =>
    move(user, orders).then(answer);

  describe(`${name}: permission matrix by hand, the owner's move (03; 06 Allowed moves; decisions 2.3 item 5)`, () => {
    it("MANAGER: allow on his own order of an own branch; not_found in another branch; forbidden on a colleague's", async () => {
      const own = await insertBranch();
      const other = await insertBranch();
      const manager = await insertUser("MANAGER", { branches: [own.id] });
      const colleague = await insertUser("MANAGER", { branches: [own.id] });
      const there = await insertUser("MANAGER", { branches: [other.id] });
      expect(await once(manager, [await at(own.id, manager.id)])).toBe("allow");
      expect(await once(manager, [await at(other.id, there.id)])).toBe("not_found");
      expect(await once(manager, [await at(own.id, colleague.id)])).toBe("forbidden");
    });

    it("HEAD: allow on his own order in any branch; forbidden on a Manager's", async () => {
      const own = await insertBranch();
      const other = await insertBranch();
      const head = await insertUser("HEAD");
      const manager = await insertUser("MANAGER", { branches: [other.id] });
      expect(await once(head, [await at(own.id, head.id)])).toBe("allow");
      expect(await once(head, [await at(other.id, head.id)])).toBe("allow");
      expect(await once(head, [await at(other.id, manager.id)])).toBe("forbidden");
    });

    for (const role of ["PRINCIPAL", "FINANCE"] as const) {
      it(`${role}: forbidden on an order of the own branch; not_found in another`, async () => {
        const own = await insertBranch();
        const other = await insertBranch();
        const user = await insertUser(role, { branches: [own.id] });
        const manager = await insertUser("MANAGER", { branches: [own.id, other.id] });
        expect(await once(user, [await at(own.id, manager.id)])).toBe("forbidden");
        expect(await once(user, [await at(other.id, manager.id)])).toBe("not_found");
      });
    }

    it("MANAGER with CREATE_REQUESTS off: forbidden in each own branch (A13)", async () => {
      const first = await insertBranch();
      const second = await insertBranch();
      const manager = await insertUser("MANAGER", { branches: [first.id, second.id] });
      const orders = [await at(first.id, manager.id), await at(second.id, manager.id)];
      await setManagerRight(manager.id, "CREATE_REQUESTS", false);
      for (const order of orders) expect(await once(manager, [order])).toBe("forbidden");
    });

    it("one order of another branch among his own refuses the whole action (03 rule 8; 06 rule 8)", async () => {
      const own = await insertBranch();
      const other = await insertBranch();
      const manager = await insertUser("MANAGER", { branches: [own.id] });
      const mine = await at(own.id, manager.id);
      const theirs = await at(other.id, (await insertUser("MANAGER", { branches: [other.id] })).id);
      expect(await move(manager, [mine, theirs])).toMatchObject({
        ok: false,
        error: { code: "not_found" },
      });
      expect(await orderRow(mine.id)).toMatchObject({ status, version: 1 });
    });
  });
}
