import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import { ROLES } from "@/domain/permissions";
import { approveOrders } from "@/features/orders/actions/approve";
import { newestMoves } from "@/features/orders/queries/newest-moves";
import { submittedNumbers } from "@/features/orders/queries/submitted";
import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";

import { REASON } from "../../../../tests/helpers/moves";
import {
  type TickedOrder,
  type TickedResult,
  describeTickedWall,
} from "../../../../tests/helpers/ticked-wall";
import { insertOrder } from "../../../../tests/helpers/orders";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";

// Every order action on ticked orders, through the page's own export, with an order of the own
// branch and one of another branch ticked together (build-plan 2.15: "each order action × each
// role × own branch and other branch, alone and mixed"; 03-roles-and-permissions.md rules 1 and
// 8; 06-approval-workflow.md rule 8; 15-quality-and-acceptance.md, Test layers: Database). The
// alone half is actions-matrix.db.test.ts. A move is refused behind the wall by two layers,
// guardOrders() of src/server/order-action.ts and the state machine's judge() of
// src/domain/order-moves.ts: where the own order is allowed, either alone keeps these cells green;
// the guard alone is proved by the drafts and copy cells, which share it and have no state-machine
// check, and judge() by src/domain/order-moves.test.ts (permission review of 2.15, Should fix 1).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const {
  approveOrdersAction,
  cancelOrdersAction,
  copyOrdersAsNewAction,
  rejectOrdersAction,
  sendBackOrdersAction,
  setDraftsNeededByAction,
  submitAgainOrdersAction,
  submitDraftsAction,
  takeBackOrdersAction,
  tickedSummaryAction,
} = await import("./actions");

function signedIn(user: InsertedUser): void {
  store.user = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    locale: "uz",
    sessionToken: "invented-token",
  };
}

beforeEach(() => {
  store.user = null;
});

/** The page answer as the wall reads it. */
function wall(result: ActionResult<unknown>): TickedResult {
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

const versions = (ticked: TickedOrder[]) => ticked.map(({ id, version }) => ({ id, version }));

describeTickedWall("submitDraftsAction", {
  permission: "request.edit",
  status: "DRAFT",
  owned: true,
  async run(user, ticked) {
    signedIn(user);
    return wall(await submitDraftsAction({ clientKey: newClientKey(), orders: versions(ticked) }));
  },
});

const NEEDED_BY = "2031-06-01";

describeTickedWall("setDraftsNeededByAction", {
  permission: "request.edit",
  status: "DRAFT",
  owned: true,
  async run(user, ticked) {
    signedIn(user);
    return wall(await setDraftsNeededByAction({ orders: versions(ticked), neededBy: NEEDED_BY }));
  },
  async saved(_user, ticked) {
    const rows = await db
      .select({ neededBy: orders.neededBy })
      .from(orders)
      .where(
        inArray(
          orders.id,
          ticked.map(({ id }) => id),
        ),
      );
    expect(rows).toEqual([{ neededBy: NEEDED_BY }, { neededBy: NEEDED_BY }]);
  },
});

const STEPS = [
  ["PENDING_HEAD", "request.approve_step1"],
  ["PENDING_PRINCIPAL", "request.approve_step2"],
  ["PENDING_FINANCE", "request.approve_step3"],
] as const;

for (const [status, permission] of STEPS) {
  describeTickedWall("approveOrdersAction", {
    permission,
    status,
    owned: false,
    async run(user, ticked) {
      signedIn(user);
      return wall(
        await approveOrdersAction({ clientKey: newClientKey(), orders: versions(ticked) }),
      );
    },
  });
  for (const [name, action] of [
    ["sendBackOrdersAction", sendBackOrdersAction],
    ["rejectOrdersAction", rejectOrdersAction],
  ] as const) {
    describeTickedWall(name, {
      permission,
      status,
      owned: false,
      async run(user, ticked) {
        signedIn(user);
        return wall(
          await action({ clientKey: newClientKey(), orders: versions(ticked), reason: REASON }),
        );
      },
    });
  }
}

// Cancel from a waiting step and from Sent back (06 Allowed moves: "Any 'Waiting for' step,
// Sent back").
for (const status of ["PENDING_HEAD", "RETURNED"] as const) {
  describeTickedWall("cancelOrdersAction", {
    permission: "request.edit",
    status,
    owned: true,
    async run(user, ticked) {
      signedIn(user);
      return wall(
        await cancelOrdersAction({
          clientKey: newClientKey(),
          orders: versions(ticked),
          reason: REASON,
        }),
      );
    },
  });
}

describeTickedWall("takeBackOrdersAction", {
  permission: "request.edit",
  status: "PENDING_HEAD",
  owned: true,
  async run(user, ticked) {
    signedIn(user);
    return wall(
      await takeBackOrdersAction({ clientKey: newClientKey(), orders: versions(ticked) }),
    );
  },
});

describeTickedWall("submitAgainOrdersAction", {
  permission: "request.edit",
  status: "RETURNED",
  owned: true,
  async run(user, ticked) {
    signedIn(user);
    return wall(
      await submitAgainOrdersAction({ clientKey: newClientKey(), orders: versions(ticked) }),
    );
  },
});

// Copy as new of a waiting order and of a Rejected one (05 Ticking and filters: "any order").
// The source is not written, so "saved" is the copier's two new drafts.
for (const status of ["PENDING_HEAD", "REJECTED"] as const) {
  describeTickedWall("copyOrdersAsNewAction", {
    permission: "request.create",
    status,
    owned: true,
    async run(user, ticked) {
      signedIn(user);
      return wall(
        await copyOrdersAsNewAction({
          orders: ticked.map(({ id, version }) => ({ id, version, clientKey: newClientKey() })),
        }),
      );
    },
    async saved(user: InsertedUser) {
      const drafts = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.ownerId, user.id), eq(orders.status, "DRAFT")));
      expect(drafts).toHaveLength(2);
    },
  });
}

// The reads that take ticked ids (plan of 2.15, decided item 1, Look first): another branch's
// order is left out, as an unknown id would be, and the read is not refused (03 rule 1: "Not
// found"). The other branch's order has every other value that would let it in: the same status,
// subtype and owner, a number, and a Head approval event (.claude/rules/tests.md).
describe("the reads of ticked ids leave another branch's order out (03 rule 1; plan of 2.15, decided item 1)", () => {
  async function scene() {
    const own = await insertBranch();
    const other = await insertBranch();
    const owner = await insertUser("MANAGER", { branches: [own.id, other.id] });
    const first = await insertOrder({
      branchId: own.id,
      ownerId: owner.id,
      status: "PENDING_HEAD",
    });
    const mine = { id: first.id, version: first.version };
    const second = await insertOrder({
      branchId: other.id,
      ownerId: owner.id,
      status: "PENDING_HEAD",
      variantId: first.variantId,
    });
    const theirs = { id: second.id, version: second.version };
    // The fixture must succeed, or a refusal here would read as the expected leaving out (D38).
    expect(
      await runOrdersAction(approveOrders, (await insertUser("HEAD")).id, {
        clientKey: randomUUID(),
        orders: [mine, theirs],
      }),
    ).toMatchObject({ ok: true });
    return { own, other, mine, theirs };
  }

  for (const role of ROLES) {
    const both = role === "HEAD";
    it(`${role}: ${both ? "both orders are read" : "only the own branch's order is read"}`, async () => {
      const { own, other, mine, theirs } = await scene();
      // The other branch has its own user of the role (D40).
      if (role !== "HEAD") await insertUser(role, { branches: [other.id] });
      const user = await insertUser(role, { branches: both ? [] : [own.id] });
      const seen = both ? [mine.id, theirs.id].sort() : [mine.id];

      signedIn(user);
      // An unknown id beside it: the other branch's order is missing exactly as it is
      // (permission review of 2.15, Should fix 4).
      const unknown = randomUUID();
      const summary = await tickedSummaryAction({ ids: [mine.id, theirs.id, unknown] });
      expect(summary).toMatchObject({
        ok: true,
        data: {
          count: seen.length,
          missing: both ? [unknown] : [theirs.id, unknown],
          totals: { grand: String(50_000 * seen.length) },
        },
      });

      expect([...(await newestMoves(user.id, [mine.id, theirs.id])).keys()].sort()).toEqual(seen);
      expect([...(await submittedNumbers(user.id, [mine.id, theirs.id])).keys()].sort()).toEqual(
        seen,
      );
    });
  }
});

// A repeat answers from the stored first result, but the ids the browser sends pass the branch
// wall and the draft wall again: a known key sent with another branch's order id is "Not found"
// (.claude/rules/server-actions.md, last line; permission review of 2.15, Should fix 2).
describe("a repeated client key sent with another branch's order id (developer-rules.md rules 4 and 8)", () => {
  it("the Principal's own repeat answers as the first time; with the other branch's id it is not_found", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const owner = await insertUser("MANAGER", { branches: [own.id, other.id] });
    await insertUser("PRINCIPAL", { branches: [other.id] });
    const principal = await insertUser("PRINCIPAL", { branches: [own.id] });
    const mine = await insertOrder({
      branchId: own.id,
      ownerId: owner.id,
      status: "PENDING_PRINCIPAL",
    });
    const theirs = await insertOrder({
      branchId: other.id,
      ownerId: owner.id,
      status: "PENDING_PRINCIPAL",
    });
    signedIn(principal);
    const clientKey = newClientKey();
    expect(
      await approveOrdersAction({ clientKey, orders: [{ id: mine.id, version: 1 }] }),
    ).toMatchObject({ ok: true });
    expect(
      await approveOrdersAction({ clientKey, orders: [{ id: mine.id, version: 1 }] }),
    ).toMatchObject({ ok: true });
    expect(
      await approveOrdersAction({ clientKey, orders: [{ id: theirs.id, version: 1 }] }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(
      await approveOrdersAction({
        clientKey,
        orders: [
          { id: mine.id, version: 1 },
          { id: theirs.id, version: 1 },
        ],
      }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    const [row] = await db
      .select({ status: orders.status, version: orders.version })
      .from(orders)
      .where(eq(orders.id, theirs.id));
    expect(row).toEqual({ status: "PENDING_PRINCIPAL", version: 1 });
  });
});
