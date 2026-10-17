import { and, eq } from "drizzle-orm";
import { vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { managerRights } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { setClock } from "../../../../tests/helpers/clock";
import { insertMoneyAction, insertMoneyRow } from "../../../../tests/helpers/money";
import { insertOrder } from "../../../../tests/helpers/orders";
import {
  type MatrixCase,
  describePermissionMatrix,
} from "../../../../tests/helpers/permission-matrix";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import type { InsertedUser } from "../../../../tests/helpers/users";
import { randomUUID } from "node:crypto";
import { closeExactOrders } from "./close-exact";
import { sendToSettlementOrders } from "./send-to-settlement";

// Close (exact match) and Send to settlement (build plan 4.4) in the permission matrix: each
// feature definition and each page export of `src/app/(app)/orders/actions.ts`, called directly
// (15-quality-and-acceptance.md, Test layers; 03-roles-and-permissions.md, Permission matrix
// "Close an order that matches exactly"; Manager rights: CLOSE_ALONE; 06 Allowed moves, "Open |
// Send to settlement | Owner or Head"; decisions 2.3 item 4, Look first). The case generator also
// runs the Manager on a colleague's order of the own branch, and, for Close, the Manager with
// CLOSE_ALONE off. The expected answers come from tests/permission-matrix-expected.ts. Each order
// is an exact match (08 Exact match: 10 × 5 000 in cash bought as planned, 50 000 given), so only
// the permission can refuse it.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { closeExactOrdersAction, sendToSettlementOrdersAction } =
  await import("@/app/(app)/orders/actions");

function signedIn(user: InsertedUser): void {
  store.user = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    locale: "uz",
  } as CurrentUser;
}

/**
 * The answer as the matrix reads it: a refusal of the wall or the matrix is thrown. `notReady`
 * counts as passing the permission only in the generator's "HEAD still allowed" case, the Head on
 * the order of a Manager whose CLOSE_ALONE is off: the permission lets the Head reach it and the
 * state machine sends it to settlement (08 Closing 1; plan of 4.4, decided item 2, Look first;
 * close-exact.db.test.ts proves that refusal). Every other allowed cell must close.
 */
function asMatrixAnswer(result: ActionResult<unknown>, notReady = false): void {
  if (result.ok) return;
  const code = result.error.orders?.[0]?.code ?? result.error.code;
  if (notReady && code === "not_ready") return;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

/** The generator's Head case on the order of a Manager whose CLOSE_ALONE is off. */
async function headOnSwitchedOff({ user, ownerId }: MatrixCase): Promise<boolean> {
  if (user.role !== "HEAD") return false;
  const off = await db
    .select({ enabled: managerRights.enabled })
    .from(managerRights)
    .where(
      and(
        eq(managerRights.userId, ownerId),
        eq(managerRights.right, "CLOSE_ALONE"),
        eq(managerRights.enabled, false),
      ),
    );
  return off.length > 0;
}

/** A finished Open order of the case's branch and owner that matches exactly. */
async function exactOrder({ branchId, ownerId }: MatrixCase) {
  setClock("2031-05-10T07:00:00Z");
  const order = await insertOrder({
    branchId,
    ownerId,
    status: "PURCHASING",
    progress: "DONE",
    paymentType: "CASH",
  });
  const tripId = (await insertTrip(branchId, ownerId)).rows[0]!.id;
  await insertPurchaseRow({
    tripId,
    orderId: order.id,
    branchId,
    variantId: order.variantId,
    createdBy: ownerId,
    qty: "10",
    unitPrice: "5000",
  });
  const action = (await insertMoneyAction({ managerId: ownerId, createdBy: ownerId })).rows[0]!;
  await insertMoneyRow({ moneyActionId: action.id, orderId: order.id, amount: "50000" });
  return order;
}

function input(order: { id: string; version: number }) {
  return { clientKey: randomUUID(), orders: [{ id: order.id, version: order.version }] };
}

const MOVES = [
  {
    permission: "request.close_exact",
    definition: closeExactOrders,
    name: "closeExactOrders",
    exported: () => closeExactOrdersAction,
  },
  {
    permission: "request.send_to_settlement",
    definition: sendToSettlementOrders,
    name: "sendToSettlementOrders",
    exported: () => sendToSettlementOrdersAction,
  },
] as const;

for (const move of MOVES) {
  describePermissionMatrix(move.name, {
    permission: move.permission,
    async run(each) {
      const order = await exactOrder(each);
      asMatrixAnswer(
        await runOrdersAction(move.definition, each.user.id, input(order)),
        move.name === "closeExactOrders" && (await headOnSwitchedOff(each)),
      );
    },
  });

  describePermissionMatrix(`${move.name} (the page export)`, {
    permission: move.permission,
    async run(each) {
      const order = await exactOrder(each);
      signedIn(each.user);
      asMatrixAnswer(
        await move.exported()(input(order)),
        move.name === "closeExactOrders" && (await headOnSwitchedOff(each)),
      );
    },
  });
}
