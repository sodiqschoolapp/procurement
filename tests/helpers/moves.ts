import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { expect } from "vitest";

import type { RequestStatus } from "@/domain/request-status";
import { db } from "@/server/db/client";
import { notifications, orderActions, orderEvents, orders } from "@/server/db/schema";

import { insertBranch } from "./branches";
import { insertOrder } from "./orders";
import { insertUser } from "./users";

// What the database tests of the moves of 2.11 share (06-approval-workflow.md, Allowed moves;
// rule 8): a branch with its people, orders waiting at a status, the ticked input, and the checks
// that nothing was saved. Names are invented.

export const REASON = "Invented reason for the test";

/** A branch with a Manager, a Principal, a Finance user and a Head. */
export async function moveScene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  return { branch, manager, principal, finance, head };
}

/** `count` orders of an owner at a status, each with its number. */
export async function ordersAt(
  branchId: string,
  ownerId: string,
  status: RequestStatus,
  count = 1,
) {
  const made = [];
  for (let at = 0; at < count; at += 1) made.push(await insertOrder({ branchId, ownerId, status }));
  return made;
}

/** The input of a move on ticked orders, a reason unless `null`, with a fresh client key. */
export function tickedInput(
  ticked: readonly { id: string; version: number }[],
  extra: Record<string, unknown> = { reason: REASON },
) {
  return {
    clientKey: randomUUID(),
    orders: ticked.map(({ id, version }) => ({ id, version })),
    ...extra,
  };
}

/** Every order's status and version, by id. */
export async function statusesOf(ids: readonly string[]) {
  const rows = await db
    .select({ id: orders.id, status: orders.status, version: orders.version })
    .from(orders)
    .where(inArray(orders.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row]));
}

/** How many notifications exist now. */
export async function noticeCount(): Promise<number> {
  return (await db.select({ id: notifications.id }).from(notifications)).length;
}

/** No action row, no event and no notification came from a refused action (06 rule 8). */
export async function nothingSaved(
  clientKey: string,
  ids: readonly string[],
  noticesBefore: number,
) {
  expect(await noticeCount()).toBe(noticesBefore);
  expect(await db.select().from(orderActions).where(eq(orderActions.clientKey, clientKey))).toEqual(
    [],
  );
  expect(
    await db
      .select()
      .from(orderEvents)
      .where(inArray(orderEvents.orderId, [...ids])),
  ).toEqual([]);
}

/** The notifications of one type a user got; `params.branch` names the branch by its code. */
export async function noticesOf(userId: string, type: (typeof notifications.$inferSelect)["type"]) {
  return db
    .select({ params: notifications.params })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));
}

/** The events of an order, oldest first. */
export async function eventsOf(orderId: string) {
  return db
    .select({
      type: orderEvents.type,
      from: orderEvents.fromStatus,
      to: orderEvents.toStatus,
      comment: orderEvents.comment,
      note: orderEvents.note,
    })
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(orderEvents.createdAt, orderEvents.id);
}
