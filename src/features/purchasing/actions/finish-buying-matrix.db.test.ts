import { randomUUID } from "node:crypto";

import { vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { runOrdersAction } from "@/server/order-action";

import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder } from "../../../../tests/helpers/orders";
import {
  type MatrixCase,
  describePermissionMatrix,
} from "../../../../tests/helpers/permission-matrix";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import type { InsertedUser } from "../../../../tests/helpers/users";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { finishOrders, markNotBought, reopenBuying } from "./finish-buying";

// Finish order, Not bought and Reopen buying (build plan 3.5) in the permission matrix: each
// feature definition and each page export of `src/app/(app)/orders/actions.ts`, called directly
// (15-quality-and-acceptance.md, Test layers; 03-roles-and-permissions.md, Permission matrix
// "Record purchases"; Manager rights: RECORD_PURCHASES; plan of 3.5, decided item 2, Look first).
// The case generator also runs the Manager on a colleague's order of the own branch, and the
// Manager with RECORD_PURCHASES off. The expected answers come from
// tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { finishOrdersAction, markNotBoughtAction, reopenBuyingAction } =
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

/** The answer as the matrix reads it: a refusal of the wall or the matrix is thrown. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.orders?.[0]?.code ?? result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

type Kind = "FINISH" | "NOT_BOUGHT" | "REOPEN";

/** An Open order of the case's branch and owner, at the progress the action starts from. */
async function orderFor(kind: Kind, { branchId, ownerId }: MatrixCase) {
  setClock("2031-05-10T07:00:00Z");
  const order = await insertOrder({ branchId, ownerId, status: "PURCHASING" });
  if (kind === "FINISH") {
    const tripId = (await insertTrip(branchId, ownerId)).rows[0]!.id;
    await insertPurchaseRow({
      tripId,
      orderId: order.id,
      branchId,
      variantId: order.variantId,
      createdBy: ownerId,
      qty: "1",
    });
  }
  if (kind === "REOPEN") {
    await db
      .update(orders)
      .set({ progress: "NOT_BOUGHT", finishReason: "Not in any shop" })
      .where(eq(orders.id, order.id));
  }
  return order;
}

function input(kind: Kind, order: { id: string; version: number }) {
  return {
    clientKey: randomUUID(),
    orders: [{ id: order.id, version: order.version }],
    ...(kind === "REOPEN" ? {} : { reason: "The shop has no more" }),
  };
}

const DEFINITIONS = { FINISH: finishOrders, NOT_BOUGHT: markNotBought, REOPEN: reopenBuying };
const EXPORTS = {
  FINISH: finishOrdersAction,
  NOT_BOUGHT: markNotBoughtAction,
  REOPEN: reopenBuyingAction,
};

for (const kind of ["FINISH", "NOT_BOUGHT", "REOPEN"] as const) {
  describePermissionMatrix(`${DEFINITIONS[kind].name}`, {
    permission: "purchase.record",
    async run(each) {
      const order = await orderFor(kind, each);
      const definition = DEFINITIONS[kind] as typeof finishOrders;
      asMatrixAnswer(await runOrdersAction(definition, each.user.id, input(kind, order)));
    },
  });

  describePermissionMatrix(`${DEFINITIONS[kind].name} (the page export)`, {
    permission: "purchase.record",
    async run(each) {
      const order = await orderFor(kind, each);
      signedIn(each.user);
      asMatrixAnswer(await EXPORTS[kind](input(kind, order)));
    },
  });
}
