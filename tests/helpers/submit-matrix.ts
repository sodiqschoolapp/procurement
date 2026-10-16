import { describe, expect, it } from "vitest";

import type { Role } from "@/domain/permissions";
import type { ActionResult } from "@/server/action-result";

import { insertBranch, setManagerRight } from "./branches";
import { insertOrder, orderRow } from "./orders";
import { type InsertedUser, insertUser } from "./users";

// The permission matrix of Submit, written by hand (plan of 2.7, Tests; 03-roles-and-
// permissions.md, Permission matrix "Add, edit, submit, cancel orders": Head any branch, Manager
// own branches, Principal and Finance no; Manager rights: CREATE_REQUESTS; rule 8; 06 Statuses:
// a Draft is visible to its owner and the Head only). The generated matrix of
// permission-matrix.ts expects `forbidden` on a colleague's order, but a colleague's DRAFT is
// behind the draft wall: `not_found`, as for deleteDraft (2.5a decided items 7 and 9, Look
// first). Used for the feature definition and for the page's own export (permission review of
// 2.5b).

type Submit = (
  user: InsertedUser,
  orders: { id: string; version: number }[],
) => Promise<ActionResult<unknown>>;

/** The code the action refused with, the first order's when it names orders; "allow" for ok. */
function answer(result: ActionResult<unknown>): string {
  if (result.ok) return "allow";
  return result.error.orders?.[0]?.code ?? result.error.code;
}

async function draftOf(branchId: string, ownerId: string) {
  return insertOrder({ branchId, ownerId });
}

export function describeSubmitMatrix(name: string, submit: Submit): void {
  const once = (user: InsertedUser, orders: { id: string; version: number }[]) =>
    submit(user, orders).then(answer);

  describe(`${name}: permission matrix by hand, "Add, edit, submit, cancel orders" (03; 06 Statuses: Draft)`, () => {
    it("HEAD: allow on his own draft and on a Manager's, in any branch", async () => {
      const own = await insertBranch();
      const other = await insertBranch();
      const head = await insertUser("HEAD");
      const manager = await insertUser("MANAGER", { branches: [other.id] });
      expect(await once(head, [await draftOf(own.id, head.id)])).toBe("allow");
      expect(await once(head, [await draftOf(other.id, manager.id)])).toBe("allow");
    });

    it("MANAGER: allow on his own draft of an own branch; not_found in another branch", async () => {
      const own = await insertBranch();
      const other = await insertBranch();
      const manager = await insertUser("MANAGER", { branches: [own.id] });
      const there = await insertUser("MANAGER", { branches: [other.id] });
      expect(await once(manager, [await draftOf(own.id, manager.id)])).toBe("allow");
      expect(await once(manager, [await draftOf(other.id, there.id)])).toBe("not_found");
    });

    for (const role of ["PRINCIPAL", "FINANCE"] as const satisfies readonly Role[]) {
      it(`${role}: a Manager's draft of the own branch and of another is not_found; a draft of his own is forbidden`, async () => {
        const own = await insertBranch();
        const other = await insertBranch();
        const user = await insertUser(role, { branches: [own.id] });
        const manager = await insertUser("MANAGER", { branches: [own.id, other.id] });
        expect(await once(user, [await draftOf(own.id, manager.id)])).toBe("not_found");
        expect(await once(user, [await draftOf(other.id, manager.id)])).toBe("not_found");
        // Past the draft wall the matrix answers: no Submit for this role.
        expect(await once(user, [await draftOf(own.id, user.id)])).toBe("forbidden");
      });
    }

    it("MANAGER with CREATE_REQUESTS off: forbidden in each own branch; HEAD still allowed", async () => {
      const first = await insertBranch();
      const second = await insertBranch();
      const manager = await insertUser("MANAGER", { branches: [first.id, second.id] });
      const drafts = [await draftOf(first.id, manager.id), await draftOf(second.id, manager.id)];
      await setManagerRight(manager.id, "CREATE_REQUESTS", false);
      for (const draft of drafts) expect(await once(manager, [draft])).toBe("forbidden");
      const head = await insertUser("HEAD");
      for (const draft of drafts) expect(await once(head, [draft])).toBe("allow");
    });

    it("a colleague's draft of the own branch: not_found (the draft wall); the Head on it: allow", async () => {
      const own = await insertBranch();
      const manager = await insertUser("MANAGER", { branches: [own.id] });
      const colleague = await insertUser("MANAGER", { branches: [own.id] });
      const draft = await draftOf(own.id, colleague.id);
      expect(await once(manager, [draft])).toBe("not_found");
      expect(await once(await insertUser("HEAD"), [draft])).toBe("allow");
    });

    // The branch wall alone, the draft wall passed: the user's own draft in a branch he is not
    // assigned to (03 rule 1; permission review of 2.7, Must fix 2).
    it("MANAGER: his own draft in a branch he is no longer assigned to is not_found", async () => {
      const own = await insertBranch();
      const left = await insertBranch();
      const manager = await insertUser("MANAGER", { branches: [own.id] });
      expect(await once(manager, [await draftOf(left.id, manager.id)])).toBe("not_found");
    });

    for (const role of ["PRINCIPAL", "FINANCE"] as const satisfies readonly Role[]) {
      it(`${role}: a draft of his own in another branch is not_found, not forbidden`, async () => {
        const own = await insertBranch();
        const other = await insertBranch();
        const user = await insertUser(role, { branches: [own.id] });
        expect(await once(user, [await draftOf(other.id, user.id)])).toBe("not_found");
      });
    }

    it("one order of another branch among his own refuses the whole submit (03 rule 8; 06 rule 8)", async () => {
      const own = await insertBranch();
      const other = await insertBranch();
      const manager = await insertUser("MANAGER", { branches: [own.id] });
      const mine = await draftOf(own.id, manager.id);
      const theirs = await draftOf(
        other.id,
        (await insertUser("MANAGER", { branches: [other.id] })).id,
      );
      const result = await submit(manager, [mine, theirs]);
      expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
      expect(await orderRow(mine.id)).toMatchObject({ status: "DRAFT", number: null });
    });
  });
}
