import { eq, inArray } from "drizzle-orm";

import { approveOrders } from "@/features/orders/actions/approve";
import { submitDrafts } from "@/features/orders/actions/submit";
import { db } from "@/server/db/client";
import { orders, settings } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";
import { now } from "@/server/clock";

import { type PlanOptions, type StepScene, expectOk, ticked } from "./finance-step";
import { insertOrder, insertOrderExtra } from "./orders";

// The scenes of the Principal step switch (06-approval-workflow.md, Principal step switched off;
// plan of 4.10d), beside those of the Finance step (./finance-step.ts): every order goes from
// Draft through the real actions, every fixture asserts its own success (D38). The plan is 08's
// worked example unless given: 100 notebooks × 5 000 in cash plus 20 000 delivery, 520 000.

/** The setting `principal_step` written straight, for a test whose subject is not the switch. */
export async function setPrincipalStep(on: boolean) {
  await db
    .insert(settings)
    .values({ key: "principal_step", value: on, createdAt: now() })
    .onConflictDoUpdate({ target: settings.key, set: { value: on } });
}

/** A draft of the scene's branch with the worked example's plan, owned by `ownerId`. */
async function draftOf(s: StepScene, ownerId: string, plan: PlanOptions) {
  const draft = await insertOrder({
    branchId: s.branch.id,
    ownerId,
    variantId: plan.variantId,
    plannedQty: plan.qty ?? "100",
    plannedPrice: plan.price === undefined ? 5_000n : plan.price,
    paymentType: plan.paymentType ?? "CASH",
    neededBy: "2031-05-01",
  });
  const extra = plan.extra ?? 20_000n;
  if (extra > 0n) await insertOrderExtra(draft.id, extra);
  return { id: draft.id, variantId: draft.variantId };
}

/** An order of the scene's Manager, submitted: Waiting for Head. */
export async function atHead(s: StepScene, plan: PlanOptions = {}) {
  const draft = await draftOf(s, s.manager.id, plan);
  expectOk(await runOrdersAction(submitDrafts, s.manager.id, await ticked([draft.id])));
  return draft;
}

/** A draft the scene's Head created and owns, never submitted (03 rule 6). */
export async function headDraft(s: StepScene, plan: PlanOptions = {}) {
  return draftOf(s, s.head.id, plan);
}

/** The Head approves the orders in one action. */
export async function headApproves(s: StepScene, ids: readonly string[]) {
  return expectOk(await runOrdersAction(approveOrders, s.head.id, await ticked(ids)));
}

/** Status, both marks and the approval time of the orders, by id. */
export async function marksNow(ids: readonly string[]) {
  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      skippedPrincipal: orders.skippedPrincipal,
      skippedFinance: orders.skippedFinance,
      approvedAt: orders.approvedAt,
    })
    .from(orders)
    .where(inArray(orders.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row]));
}

/** The order's number. */
export async function numberOf(id: string): Promise<string> {
  const [row] = await db.select({ number: orders.number }).from(orders).where(eq(orders.id, id));
  return row!.number!;
}
