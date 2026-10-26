import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { expect } from "vitest";

import { approveOrders } from "@/features/orders/actions/approve";
import { submitDrafts } from "@/features/orders/actions/submit";
import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import type { ActionResult } from "@/server/action-result";
import { db } from "@/server/db/client";
import { orders, settings } from "@/server/db/schema";
import { type OrdersResult, runOrdersAction } from "@/server/order-action";
import { now } from "@/server/clock";

import { insertBranch } from "./branches";
import { insertExtraCostType, insertOrder, insertOrderExtra } from "./orders";
import { insertUser } from "./users";

// The scenes of the Finance step switch (06-approval-workflow.md, Finance step switched off; plan
// of 4.10c): every order goes from Draft through the real actions, every fixture asserts its own
// success (D38). The plan is 08's worked example unless given: 100 notebooks × 5 000 in cash plus
// 20 000 delivery, 520 000.

export const DAY = "2031-04-01";

export function expectOk(result: ActionResult<unknown>): OrdersResult {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: OrdersResult }).data;
}

/** A branch with a Manager, a Principal and a Finance user; and a Head of every branch. */
export async function stepScene(head?: { id: string }) {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  return { branch, manager, principal, finance, head: head ?? (await insertUser("HEAD")) };
}

export type StepScene = Awaited<ReturnType<typeof stepScene>>;

/** The setting `finance_step` written straight, for a test whose subject is not the switch. */
export async function setFinanceStep(on: boolean) {
  await db
    .insert(settings)
    .values({ key: "finance_step", value: on, createdAt: now() })
    .onConflictDoUpdate({ target: settings.key, set: { value: on } });
}

export async function versionOf(id: string): Promise<number> {
  const [row] = await db.select({ version: orders.version }).from(orders).where(eq(orders.id, id));
  return row!.version;
}

/** The ticked orders with the versions they stand at now, and a fresh client key. */
export async function ticked(ids: readonly string[], extra: Record<string, unknown> = {}) {
  return {
    clientKey: randomUUID(),
    orders: await Promise.all(ids.map(async (id) => ({ id, version: await versionOf(id) }))),
    ...extra,
  };
}

export type PlanOptions = {
  qty?: string;
  /** `null`: an order without a planned price (05 Fields the Head sets 3). */
  price?: bigint | null;
  extra?: bigint;
  paymentType?: "CASH" | "TRANSFER" | "CARD";
  variantId?: string;
};

/** An order of the scene's Manager submitted and approved by the Head: Waiting for Principal. */
export async function atPrincipal(s: StepScene, plan: PlanOptions = {}) {
  const draft = await insertOrder({
    branchId: s.branch.id,
    ownerId: s.manager.id,
    variantId: plan.variantId,
    plannedQty: plan.qty ?? "100",
    plannedPrice: plan.price === undefined ? 5_000n : plan.price,
    paymentType: plan.paymentType ?? "CASH",
    neededBy: "2031-05-01",
  });
  const extra = plan.extra ?? 20_000n;
  if (extra > 0n) await insertOrderExtra(draft.id, extra);
  expectOk(await runOrdersAction(submitDrafts, s.manager.id, await ticked([draft.id])));
  expectOk(await runOrdersAction(approveOrders, s.head.id, await ticked([draft.id])));
  return { id: draft.id, variantId: draft.variantId };
}

export type Planned = Awaited<ReturnType<typeof atPrincipal>>;

/** The Principal approves; with the step off the order opens and skips Finance (06). */
export async function principalApproves(s: StepScene, list: readonly Planned[]) {
  return expectOk(
    await runOrdersAction(
      approveOrders,
      s.principal.id,
      await ticked(list.map((order) => order.id)),
    ),
  );
}

/** An order Open that skipped Finance: the step is switched off for its approval. */
export async function openedSkipped(s: StepScene, plan: PlanOptions = {}) {
  const order = await atPrincipal(s, plan);
  await setFinanceStep(false);
  await principalApproves(s, [order]);
  return order;
}

/** An order Open through Finance, who gives `cash` (none unless given). */
export async function openedThroughFinance(s: StepScene, plan: PlanOptions = {}, cash?: string) {
  const order = await atPrincipal(s, plan);
  await setFinanceStep(true);
  await principalApproves(s, [order]);
  expectOk(
    await runOrdersAction(
      approveOrders,
      s.finance.id,
      await ticked([order.id], cash ? { cash: { [order.id]: cash } } : {}),
    ),
  );
  return order;
}

/** One trip of the scene's Manager on `DAY`, each order with its line (07 One trip 1). */
export async function buy(
  s: StepScene,
  lines: readonly {
    order: Planned;
    qty?: string;
    unitPrice?: string;
    variantId?: string;
    extra?: string | null;
    comment?: string | null;
  }[],
  paymentType: "CASH" | "TRANSFER" | "CARD" = "CASH",
  purchasedOn = DAY,
) {
  const delivery = await insertExtraCostType();
  return runOrdersAction(
    recordPurchase,
    s.manager.id,
    await ticked(
      lines.map(({ order }) => order.id),
      {
        purchasedOn,
        paymentType,
        supplierId: null,
        receiptFileIds: [],
        lines: lines.map((line) => ({
          orderId: line.order.id,
          variantId: line.variantId ?? line.order.variantId,
          qty: line.qty ?? "100",
          unitPrice: line.unitPrice ?? "5000",
          extras:
            line.extra === null
              ? []
              : [
                  {
                    extraCostTypeId: delivery.id,
                    amount: line.extra ?? "20000",
                    paymentType,
                  },
                ],
          comment: line.comment ?? null,
        })),
      },
    ),
  );
}

/** Status, mark, approval time and close time of the orders, by id. */
export async function ordersNow(ids: readonly string[]) {
  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      skippedFinance: orders.skippedFinance,
      approvedAt: orders.approvedAt,
      closedAt: orders.closedAt,
      progress: orders.progress,
    })
    .from(orders)
    .where(inArray(orders.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row]));
}
