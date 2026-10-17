import { randomUUID } from "node:crypto";

import { vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { runOrdersAction } from "@/server/order-action";

import { setClock } from "../../../../tests/helpers/clock";
import { insertItem, insertOrder } from "../../../../tests/helpers/orders";
import {
  type MatrixCase,
  describePermissionMatrix,
} from "../../../../tests/helpers/permission-matrix";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import type { InsertedUser } from "../../../../tests/helpers/users";
import { cancelPurchase, cancelTrip } from "./cancel-purchase";

// Cancel record and Cancel trip (build plan 3.7; Done when: "a Manager with CANCEL_PURCHASES off
// is refused") in the permission matrix: each feature definition and each page export of
// `src/app/(app)/orders/actions.ts`, called directly (15-quality-and-acceptance.md, Test layers;
// 03-roles-and-permissions.md, Manager rights: CANCEL_PURCHASES; plan of 3.7, decided item 5, Look
// first). The case generator also runs the Manager on a colleague's order of the own branch, and
// the Manager with CANCEL_PURCHASES off. The expected answers come from
// tests/permission-matrix-expected.ts. The records are services, so no stock is involved.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { cancelPurchaseAction, cancelTripAction } = await import("@/app/(app)/orders/actions");

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

type Kind = "RECORD" | "TRIP";

/** An Open order of the case's branch and owner with one record of a service, and its input. */
async function inputFor(kind: Kind, { branchId, ownerId }: MatrixCase) {
  setClock("2031-05-10T07:00:00Z");
  const service = await insertItem({ type: "SERVICE" });
  const order = await insertOrder({
    branchId,
    ownerId,
    status: "PURCHASING",
    variantId: service.variantId,
  });
  const tripId = (await insertTrip(branchId, ownerId)).rows[0]!.id;
  const purchaseId = (
    await insertPurchaseRow({
      tripId,
      orderId: order.id,
      branchId,
      variantId: order.variantId,
      createdBy: ownerId,
    })
  ).rows[0]!.id;
  return {
    clientKey: randomUUID(),
    orders: [{ id: order.id, version: order.version }],
    ...(kind === "RECORD" ? { purchaseId } : { tripId }),
    reason: "Typed the wrong quantity",
  };
}

const DEFINITIONS = { RECORD: cancelPurchase, TRIP: cancelTrip };
const EXPORTS = { RECORD: cancelPurchaseAction, TRIP: cancelTripAction };

for (const kind of ["RECORD", "TRIP"] as const) {
  describePermissionMatrix(`${DEFINITIONS[kind].name}`, {
    permission: "purchase.cancel",
    async run(each) {
      const definition = DEFINITIONS[kind] as typeof cancelPurchase;
      asMatrixAnswer(await runOrdersAction(definition, each.user.id, await inputFor(kind, each)));
    },
  });

  describePermissionMatrix(`${DEFINITIONS[kind].name} (the page export)`, {
    permission: "purchase.cancel",
    async run(each) {
      const input = await inputFor(kind, each);
      signedIn(each.user);
      asMatrixAnswer(await EXPORTS[kind](input));
    },
  });
}
