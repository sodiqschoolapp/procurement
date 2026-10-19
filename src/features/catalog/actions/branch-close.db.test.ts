import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { issueStock } from "@/features/warehouse/actions/issue";
import { enterStockDirectly } from "@/features/warehouse/actions/direct-entry";
import { sendTransfer } from "@/features/warehouse/actions/transfer";
import { submitDrafts } from "@/features/orders/actions/submit";
import type { RequestStatus } from "@/domain/request-status";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { auditLog, branches } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { heldWhile } from "../../../../tests/helpers/held-while";
import { insertDepartment, insertItem, insertOrder } from "../../../../tests/helpers/orders";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { setBranchActive } from "./branches";

// The block on closing a branch (build-plan 5.12, from the former 5.13; Done when: "Database tests
// for both blocks and for the free case"). edge-cases/requests-and-approval.md, "The Head wants to
// close a branch": "Blocked while it has unfinished orders or stock above 0"; plan of 5.12, decided
// item 1 (unfinished: not Closed, Rejected or Cancelled, and not a draft never submitted), item 2
// (stock: the subtypes with a balance above 0, counted), item 4 (the branch row's lock), all Look
// first, with the plan review's worked examples. A transfer in transit from or to it blocks too
// (plan of 7.1, decided item 4, Look first). Every fixture is asserted (D38).

const DAY = "2031-04-20";

async function scene() {
  setClock(`${DAY}T07:00:00Z`);
  const head = await insertUser("HEAD");
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  return { head, branch, manager };
}

type Scene = Awaited<ReturnType<typeof scene>>;

function close(s: Scene) {
  return runAction(setBranchActive, s.head.id, { id: s.branch.id, active: false });
}

async function isActive(branchId: string) {
  const [row] = await db
    .select({ isActive: branches.isActive })
    .from(branches)
    .where(eq(branches.id, branchId));
  return row!.isActive;
}

async function deactivations(branchId: string) {
  return db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, "branches"),
        eq(auditLog.entityId, branchId),
        eq(auditLog.action, "branch.deactivate"),
      ),
    );
}

async function order(s: Scene, status: RequestStatus, number?: string | null) {
  return insertOrder({
    branchId: s.branch.id,
    ownerId: s.manager.id,
    status,
    ...(number === undefined ? {} : { number }),
  });
}

/** A balance of `qty` of a new item in the branch, by a receipt through the ledger. */
async function stocked(s: Scene, qty: string, allowDecimal = false) {
  const item = await insertItem({ allowDecimal });
  await receive(s.branch.id, item.variantId, qty, 5_000n, s.head.id);
  return item.variantId;
}

const refused = (fields: Record<string, string>, available: Record<string, string>) => ({
  ok: false,
  error: { code: "invalid_input", fields, available },
});

describe("closing a branch (edge-cases/requests-and-approval.md, The Head wants to close a branch)", () => {
  it("unfinished orders block: Sent back, Open, a taken-back draft count; a draft never submitted does not (decided item 1)", async () => {
    const s = await scene();
    await order(s, "RETURNED");
    await order(s, "PURCHASING");
    // A taken-back draft keeps its number (06 Allowed moves: Take back).
    await order(s, "DRAFT", "TST-31-9001");
    await order(s, "DRAFT", null);

    expect(await close(s)).toMatchObject(
      refused({ orders: "errors.field.unfinishedOrders" }, { orders: "3" }),
    );
    expect(await isActive(s.branch.id)).toBe(true);
    expect(await deactivations(s.branch.id)).toEqual([]);
  });

  it("one order of each unfinished status blocks on its own (06 Statuses)", async () => {
    for (const status of [
      "PENDING_HEAD",
      "PENDING_PRINCIPAL",
      "PENDING_FINANCE",
      "RETURNED",
      "PURCHASING",
      "SETTLEMENT",
    ] as const) {
      const s = await scene();
      await order(s, status);
      expect(await close(s), status).toMatchObject(
        refused({ orders: "errors.field.unfinishedOrders" }, { orders: "1" }),
      );
    }
  });

  it("stock above 0 blocks, counted in subtypes: balances 2.500, 10 and 0 give 2 (decided item 2)", async () => {
    const s = await scene();
    await stocked(s, "2.500", true);
    await stocked(s, "10");
    const emptied = await stocked(s, "4");
    const department = await insertDepartment(s.branch.id);
    expect(
      await runAction(issueStock, s.head.id, {
        clientKey: randomUUID(),
        branchId: s.branch.id,
        docDate: DAY,
        departmentId: department.id,
        receivedByName: "Sinov Qabulqiluvchi",
        comment: null,
        lines: [{ variantId: emptied, qty: "4" }],
      }),
    ).toMatchObject({ ok: true });

    expect(await close(s)).toMatchObject(
      refused({ stock: "errors.field.stockLeft" }, { stock: "2" }),
    );
    expect(await isActive(s.branch.id)).toBe(true);
    expect(await deactivations(s.branch.id)).toEqual([]);
  });

  it("both at once name both, each with its count", async () => {
    const s = await scene();
    await order(s, "PENDING_HEAD");
    await stocked(s, "1");
    const result = await close(s);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      code: "invalid_input",
      messageKey: "errors.invalidInput",
      fields: { orders: "errors.field.unfinishedOrders", stock: "errors.field.stockLeft" },
      available: { orders: "1", stock: "1" },
    });
  });

  it("the free case: only Closed, Rejected, Cancelled orders and a draft never submitted, stock back at 0, another branch busy beside it: deactivated, one audit row", async () => {
    const s = await scene();
    await order(s, "CLOSED");
    await order(s, "REJECTED");
    await order(s, "CANCELLED");
    await order(s, "DRAFT", null);
    // Stock came and went: its balance row is there, at 0.
    const emptied = await stocked(s, "3");
    const department = await insertDepartment(s.branch.id);
    expect(
      await runAction(issueStock, s.head.id, {
        clientKey: randomUUID(),
        branchId: s.branch.id,
        docDate: DAY,
        departmentId: department.id,
        receivedByName: "Sinov Qabulqiluvchi",
        comment: null,
        lines: [{ variantId: emptied, qty: "3" }],
      }),
    ).toMatchObject({ ok: true });
    // Another branch with an open order and stock is no reason (D40).
    const other = await insertBranch();
    await insertOrder({ branchId: other.id, ownerId: s.manager.id, status: "PURCHASING" });
    await receive(other.id, emptied, "7", 5_000n, s.head.id);

    expect(await close(s)).toMatchObject({ ok: true, data: { isActive: false } });
    expect(await isActive(s.branch.id)).toBe(false);
    expect(await deactivations(s.branch.id)).toHaveLength(1);
  });

  it("activating is never blocked, whatever the branch holds", async () => {
    const s = await scene();
    await order(s, "PENDING_HEAD");
    await stocked(s, "5");
    await db.update(branches).set({ isActive: false }).where(eq(branches.id, s.branch.id));
    expect(
      await runAction(setBranchActive, s.head.id, { id: s.branch.id, active: true }),
    ).toMatchObject({ ok: true, data: { isActive: true } });
  });
});

// The same moment (decided item 4; .claude/rules/tests.md: both sides real actions in a fixed
// order while a third transaction holds a row the first waits on; each side's one code).
describe("closing a branch at the same moment as a write in it (decided item 4)", () => {
  it("a direct entry into a branch at stock 0, waiting with the branch held FOR SHARE: the closing waits, then sees its stock", async () => {
    const s = await scene();
    const item = await insertItem();
    const [entry, closing] = await heldWhile(
      "select 1 from products where id = $1 for update",
      [item.id],
      [
        () =>
          runAction(enterStockDirectly, s.head.id, {
            clientKey: randomUUID(),
            branchId: s.branch.id,
            docDate: DAY,
            reason: "EXISTING_STOCK",
            comment: null,
            lines: [{ variantId: item.variantId, qty: "6", unitCost: "1000" }],
          }),
        () => close(s),
      ],
    );
    expect(entry).toMatchObject({ ok: true });
    expect(closing).toMatchObject(refused({ stock: "errors.field.stockLeft" }, { stock: "1" }));
    expect(await isActive(s.branch.id)).toBe(true);
  });

  it("a submit of a draft never submitted, waiting with the branch held FOR SHARE: the closing waits, then sees an unfinished order", async () => {
    const s = await scene();
    const item = await insertItem();
    const draft = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.manager.id,
      status: "DRAFT",
      number: null,
      variantId: item.variantId,
    });
    expect(draft.number).toBeNull();
    const [submitted, closing] = await heldWhile(
      "select 1 from products where id = $1 for update",
      [item.id],
      [
        () =>
          runOrdersAction(submitDrafts, s.manager.id, {
            clientKey: randomUUID(),
            orders: [{ id: draft.id, version: draft.version }],
          }),
        () => close(s),
      ],
    );
    expect(submitted).toMatchObject({ ok: true });
    expect(closing).toMatchObject(
      refused({ orders: "errors.field.unfinishedOrders" }, { orders: "1" }),
    );
    expect(await isActive(s.branch.id)).toBe(true);
  });

  it("the closing first, an issue waiting behind its lock: the branch closes, the issue is refused as inactive", async () => {
    const s = await scene();
    const department = await insertDepartment(s.branch.id);
    const item = await insertItem();
    const [closing, issue] = await heldWhile(
      "select 1 from branches where id = $1 for update",
      [s.branch.id],
      [
        () => close(s),
        () =>
          runAction(issueStock, s.manager.id, {
            clientKey: randomUUID(),
            branchId: s.branch.id,
            docDate: DAY,
            departmentId: department.id,
            receivedByName: "Sinov Qabulqiluvchi",
            comment: null,
            lines: [{ variantId: item.variantId, qty: "1" }],
          }),
      ],
    );
    expect(closing).toMatchObject({ ok: true, data: { isActive: false } });
    expect(issue).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { branchId: "errors.field.branchInactive" } },
    });
  });
});

// A transfer in transit (plan of 7.1, decided item 4, Look first; plan review, correction 1): the
// sender sends its whole stock, so neither branch has stock above 0 or an unfinished order, and
// the transfer alone is what refuses (.claude/rules/tests.md, one condition keeping a row out).
describe("a transfer in transit blocks closing either branch (plan of 7.1, decided item 4)", () => {
  // Exactly this refusal, no other field beside it.
  const onlyTransfers = {
    ok: false,
    error: {
      code: "invalid_input",
      messageKey: "errors.invalidInput",
      fields: { transfers: "errors.field.transfersInTransit" },
      available: { transfers: "1" },
    },
  };

  async function inTransit(s: Scene) {
    const receiver = await insertBranch();
    const item = await insertItem();
    await receive(s.branch.id, item.variantId, "3", 5_000n, s.head.id);
    const sent = await runAction(sendTransfer, s.manager.id, {
      clientKey: randomUUID(),
      branchId: s.branch.id,
      toBranchId: receiver.id,
      docDate: DAY,
      receivedByName: null,
      comment: null,
      lines: [{ variantId: item.variantId, qty: "3" }],
    });
    expect(sent).toMatchObject({ ok: true });
    return receiver;
  }

  it("the sender, its stock all sent: refused on transfers only, with the count", async () => {
    const s = await scene();
    await inTransit(s);
    expect(await close(s)).toEqual(onlyTransfers);
    expect(await isActive(s.branch.id)).toBe(true);
    expect(await deactivations(s.branch.id)).toEqual([]);
  });

  it("the receiver, with no stock and no order of its own: refused on transfers only", async () => {
    const s = await scene();
    const receiver = await inTransit(s);
    const closing = await runAction(setBranchActive, s.head.id, {
      id: receiver.id,
      active: false,
    });
    expect(closing).toEqual(onlyTransfers);
    expect(await isActive(receiver.id)).toBe(true);
  });

  it("a transfer between two other branches does not block", async () => {
    const s = await scene();
    const elsewhere = await scene();
    await inTransit(elsewhere);
    expect(await close(s)).toMatchObject({ ok: true });
  });

  it("a send waiting with both branches held FOR SHARE: the closing of the receiver waits, then sees the transfer", async () => {
    const s = await scene();
    const receiver = await insertBranch();
    const item = await insertItem();
    await receive(s.branch.id, item.variantId, "3", 5_000n, s.head.id);
    const [sent, closing] = await heldWhile(
      "select 1 from products where id = $1 for update",
      [item.id],
      [
        () =>
          runAction(sendTransfer, s.manager.id, {
            clientKey: randomUUID(),
            branchId: s.branch.id,
            toBranchId: receiver.id,
            docDate: DAY,
            receivedByName: null,
            comment: null,
            lines: [{ variantId: item.variantId, qty: "3" }],
          }),
        () => runAction(setBranchActive, s.head.id, { id: receiver.id, active: false }),
      ],
    );
    expect(sent).toMatchObject({ ok: true });
    expect(closing).toEqual(onlyTransfers);
    expect(await isActive(receiver.id)).toBe(true);
  });
});
