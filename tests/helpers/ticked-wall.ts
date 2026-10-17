import { asc, count, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { type Permission, ROLES } from "@/domain/permissions";
import type { RequestStatus } from "@/domain/request-status";
import { db } from "@/server/db/client";
import {
  notifications,
  numberCounters,
  orderActions,
  orderDraftAdds,
  orderEvents,
  orderRevisions,
  orders,
} from "@/server/db/schema";

import { type Answer, expectedAnswer } from "../permission-matrix-expected";
import { insertBranch } from "./branches";
import { type OrderRow, insertOrder } from "./orders";
import { type InsertedUser, insertUser } from "./users";

// The mixed half of the permission matrix (15-quality-and-acceptance.md, Test layers: "each
// action × each role × own branch and other branch"; build-plan 2.15: "alone and mixed";
// 03-roles-and-permissions.md rules 1 and 8; 06-approval-workflow.md rule 8). An order of the
// actor's own branch and one of another branch, at one status, ticked together. The answer each
// order expects comes from the hand-written tests/permission-matrix-expected.ts: both "allow" and
// both orders are saved together; anything else and the whole action is refused, each order named
// with its own code, and nothing at all is saved.

export type TickedOrder = { id: string; version: number };

/** The answer of a page action, as far as the wall reads it. */
export type TickedResult =
  | { ok: true }
  | { ok: false; error: { code: string; orders?: readonly { orderId: string; code: string }[] } };

export type TickedWallOptions = {
  permission: Permission;
  status: RequestStatus;
  /**
   * The actor owns both orders (an owner's move, a draft, Cancel, Copy as new): then neither the
   * draft wall nor the owner rule refuses the other branch's order, only the branch wall does
   * (.claude/rules/tests.md, "gives the row every other value"). Otherwise a Manager of both
   * branches owns them.
   */
  owned: boolean;
  run: (user: InsertedUser, ticked: TickedOrder[]) => Promise<TickedResult>;
  /** What "saved" means for an action that does not raise the ticked orders' version. */
  saved?: (user: InsertedUser, ticked: TickedOrder[]) => Promise<void>;
  /** More facts of each ticked order (a purchase needs its approval date). */
  order?: Partial<OrderRow>;
  /**
   * The action is one branch by its own rule (a trip, 07 One trip, many orders; plan of 3.4,
   * decided item 14): where the matrix lets both orders through, the answer is this whole refusal
   * with nothing saved, and the allowed counterpart puts both orders in one branch.
   */
  oneBranch?: { code: string; fields: Record<string, string> };
  /** Rows the action writes beyond the order tables, read before and after a refusal. */
  unchanged?: () => Promise<unknown>;
};

/** Every row an order action may write, counted, and the ticked orders as they stand. */
async function snapshot(ids: readonly string[], unchanged?: () => Promise<unknown>) {
  const counted: Record<string, number> = {};
  for (const [name, table] of Object.entries({
    orders,
    orderActions,
    orderEvents,
    orderRevisions,
    orderDraftAdds,
    notifications,
  })) {
    counted[name] = (await db.select({ n: count() }).from(table))[0]!.n;
  }
  return {
    counted,
    more: unchanged ? await unchanged() : null,
    // S14 "no gap": a refused Submit must not move a counter.
    counters: await db
      .select()
      .from(numberCounters)
      .orderBy(asc(numberCounters.branchId), asc(numberCounters.year)),
    ticked: await db
      .select()
      .from(orders)
      .where(inArray(orders.id, [...ids]))
      .orderBy(asc(orders.id)),
  };
}

async function versionsRose(ticked: readonly TickedOrder[]): Promise<void> {
  for (const { id, version } of ticked) {
    const [row] = await db
      .select({ version: orders.version })
      .from(orders)
      .where(eq(orders.id, id));
    expect(row!.version).toBeGreaterThan(version);
  }
}

/** The orders a refusal names, each with its code, in the order sent. */
function named(ticked: readonly TickedOrder[], answers: readonly Answer[]) {
  return ticked.flatMap(({ id }, at) =>
    answers[at] === "allow" ? [] : [{ orderId: id, code: answers[at] }],
  );
}

export function describeTickedWall(name: string, options: TickedWallOptions): void {
  const { permission, status, owned, run, oneBranch, unchanged } = options;
  const saved = options.saved ?? ((_user, ticked) => versionsRose(ticked));

  const orderOf = (branchId: string, ownerId: string) =>
    insertOrder({ ...options.order, branchId, ownerId, status }).then(({ id, version }) => ({
      id,
      version,
    }));

  describe(`${name} at ${status}: ticked orders of two branches (03 rules 1 and 8; 06 rule 8; 15 Test layers)`, () => {
    for (const role of ROLES) {
      const own = expectedAnswer(permission, role, "own");
      const other = expectedAnswer(permission, role, "other");
      const together = own === "allow" && other === "allow";
      const title = together
        ? `${role}: own and other branch ticked together are both allowed, and both are saved`
        : `${role}: own (${own}) and other branch (${other}) ticked together: refused whole, nothing saved`;

      it(title, async () => {
        const ownBranch = await insertBranch();
        const otherBranch = await insertBranch();
        // The other branch has its own user of this role, so it is a branch where the role
        // does act (D40).
        if (role !== "HEAD") await insertUser(role, { branches: [otherBranch.id] });
        const user = await insertUser(role, {
          branches: role === "HEAD" ? [] : [ownBranch.id],
        });
        const owner = owned
          ? user
          : await insertUser("MANAGER", { branches: [ownBranch.id, otherBranch.id] });
        const mine = await orderOf(ownBranch.id, owner.id);
        const theirs = await orderOf(otherBranch.id, owner.id);

        if (together && oneBranch) {
          const before = await snapshot([mine.id, theirs.id], unchanged);
          const result = await run(user, [mine, theirs]);
          expect(result).toMatchObject({ ok: false, error: oneBranch });
          expect(await snapshot([mine.id, theirs.id], unchanged)).toEqual(before);
          return;
        }
        if (together) {
          expect(await run(user, [mine, theirs])).toMatchObject({ ok: true });
          await saved(user, [mine, theirs]);
          return;
        }
        for (const [ticked, answers] of [
          [
            [mine, theirs],
            [own, other],
          ],
          [
            [theirs, mine],
            [other, own],
          ],
        ] as const) {
          const before = await snapshot([mine.id, theirs.id], unchanged);
          const result = await run(user, [...ticked]);
          expect(result.ok).toBe(false);
          expect(result.ok ? [] : result.error.orders).toEqual(named(ticked, answers));
          expect(await snapshot([mine.id, theirs.id], unchanged)).toEqual(before);
        }
      });
    }

    // The allowed counterpart of every refused case (D40): two orders the role may act on, in
    // one call, are saved together. A Principal has one branch (03 rule 2), so both are of it.
    for (const role of ROLES) {
      if (role === "HEAD" || expectedAnswer(permission, role, "own") !== "allow") continue;
      it(`${role}: two orders it may act on, ticked together, are both saved`, async () => {
        const first = await insertBranch();
        const second = role === "PRINCIPAL" || oneBranch ? first : await insertBranch();
        const user = await insertUser(role, { branches: [...new Set([first.id, second.id])] });
        const owner = owned
          ? user
          : await insertUser("MANAGER", { branches: [...new Set([first.id, second.id])] });
        const ticked = [await orderOf(first.id, owner.id), await orderOf(second.id, owner.id)];
        expect(await run(user, ticked)).toMatchObject({ ok: true });
        await saved(user, ticked);
      });
    }
  });
}
