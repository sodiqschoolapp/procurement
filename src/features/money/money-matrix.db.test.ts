import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { moneyActions } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { fileForDownload } from "@/features/files/queries/file-for-download";

import { insertFileRow } from "../../../tests/helpers/catalog";
import { setClock } from "../../../tests/helpers/clock";
import { insertMoneyAction, insertMoneyRow } from "../../../tests/helpers/money";
import { insertOrder } from "../../../tests/helpers/orders";
import {
  type MatrixCase,
  describePermissionMatrix,
} from "../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser } from "../../../tests/helpers/users";
import { cancelMoney } from "./actions/cancel-money";
import { recordMoney } from "./actions/record-money";
import { moneyPrefillOrders } from "./queries/money-prefill";
import { getOrderMoney } from "./queries/order-money";

// Record money and Cancel a money action (build plan 4.3; Done when: "only Finance of the branch
// can add an action") in the permission matrix: each feature definition, each page export of
// `src/app/(app)/orders/actions.ts` and each query, called directly (15-quality-and-acceptance.md,
// Test layers: "each action × each role × own branch and other branch"; 03-roles-and-
// permissions.md, Permission matrix: "Record money given, returned, paid back", Finance of its own
// branches; "See orders, stock and reports"; .claude/rules/server-actions.md). The expected
// answers come from tests/permission-matrix-expected.ts. An allowed call writes, a refused one
// writes nothing (D38).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { cancelMoneyAction, moneyPrefillAction, recordMoneyAction } =
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

/** An Open order of a Manager of the case's branch. */
async function openOrder({ branchId }: MatrixCase) {
  setClock("2031-05-10T07:00:00Z");
  const owner = await insertUser("MANAGER", { branches: [branchId] });
  return insertOrder({ branchId, ownerId: owner.id, status: "PURCHASING" });
}

async function recordInput(each: MatrixCase) {
  const order = await openOrder(each);
  return {
    clientKey: randomUUID(),
    orders: [{ id: order.id, version: order.version }],
    kind: "CASH_GIVEN",
    occurredOn: "2031-05-10",
    comment: "Invented cash for the test",
    amounts: { [order.id]: "50000" },
  };
}

/** A live money action of Finance's on an Open order, and the cancel's input. */
async function cancelInput(each: MatrixCase) {
  const order = await openOrder(each);
  const finance = await insertUser("FINANCE", { branches: [each.branchId] });
  const action = (await insertMoneyAction({ managerId: order.ownerId, createdBy: finance.id }))
    .rows[0]!.id;
  await insertMoneyRow({ moneyActionId: action, orderId: order.id });
  return {
    input: {
      clientKey: randomUUID(),
      moneyActionId: action,
      orders: [{ id: order.id, version: order.version }],
      reason: "Typed the wrong amount",
    },
    action,
  };
}

async function written(clientKey: string): Promise<number> {
  return (
    await db
      .select({ id: moneyActions.id })
      .from(moneyActions)
      .where(eq(moneyActions.clientKey, clientKey))
  ).length;
}

async function cancelled(action: string): Promise<boolean> {
  const [row] = await db
    .select({ isCancelled: moneyActions.isCancelled })
    .from(moneyActions)
    .where(eq(moneyActions.id, action));
  return row!.isCancelled;
}

describePermissionMatrix("recordMoney", {
  permission: "money.record",
  async run(each) {
    const input = await recordInput(each);
    const result = await runOrdersAction(recordMoney, each.user.id, input);
    expect(await written(input.clientKey)).toBe(result.ok ? 1 : 0);
    asMatrixAnswer(result);
  },
});

describePermissionMatrix("recordMoney (the page export)", {
  permission: "money.record",
  async run(each) {
    const input = await recordInput(each);
    signedIn(each.user);
    const answer = await recordMoneyAction(input);
    expect(await written(input.clientKey)).toBe(answer.ok ? 1 : 0);
    asMatrixAnswer(answer.ok ? answer : { ok: false, error: answer.error });
  },
});

describePermissionMatrix("cancelMoney", {
  permission: "money.record",
  async run(each) {
    const { input, action } = await cancelInput(each);
    const result = await runOrdersAction(cancelMoney, each.user.id, input);
    expect(await cancelled(action)).toBe(result.ok);
    asMatrixAnswer(result);
  },
});

describePermissionMatrix("cancelMoney (the page export)", {
  permission: "money.record",
  async run(each) {
    const { input, action } = await cancelInput(each);
    signedIn(each.user);
    const answer = await cancelMoneyAction(input);
    expect(await cancelled(action)).toBe(answer.ok);
    asMatrixAnswer(answer.ok ? answer : { ok: false, error: answer.error });
  },
});

// The reads: "See orders", the branch and the draft wall inside the SQL. A missing order is the
// query's "not found".
describePermissionMatrix("getOrderMoney", {
  permission: "data.view",
  async run(each) {
    const order = await openOrder(each);
    if ((await getOrderMoney(each.user.id, order.id)) === null) {
      throw new AuthorizationError("not_found");
    }
  },
});

describePermissionMatrix("moneyPrefillOrders", {
  permission: "data.view",
  async run(each) {
    const order = await openOrder(each);
    if ((await moneyPrefillOrders(each.user.id, [order.id])).length === 0) {
      throw new AuthorizationError("not_found");
    }
  },
});

describePermissionMatrix("moneyPrefillAction (the page export)", {
  permission: "data.view",
  async run(each) {
    const order = await openOrder(each);
    signedIn(each.user);
    const answer = await moneyPrefillAction({ ids: [order.id] });
    if (!answer.ok) throw new AuthorizationError(answer.error.code as "not_found");
    if (answer.data.orders.length === 0) throw new AuthorizationError("not_found");
  },
});

// A money action's file, linked from the Money tab (plan of 4.3, decided item 6, Look first;
// progress 4.1, "For 4.3"): it downloads under `data.view` of the branch of the action's orders
// (`MONEY_FILES`), every role, own branch and another branch.
describePermissionMatrix("fileForDownload of a money action's file", {
  permission: "data.view",
  async run(each) {
    const order = await openOrder(each);
    const finance = await insertUser("FINANCE", { branches: [each.branchId] });
    const file = await insertFileRow(finance.id, "application/pdf");
    const saved = await runOrdersAction(recordMoney, finance.id, {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: order.version }],
      kind: "BANK_TRANSFER",
      occurredOn: "2031-05-10",
      comment: "Invented transfer",
      amounts: { [order.id]: "50000" },
      fileId: file.id,
    });
    expect(saved).toMatchObject({ ok: true });
    await fileForDownload(each.user.id, file.id);
  },
});
