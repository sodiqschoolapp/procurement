import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { orderExtras, orders } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertCompany } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { setOrderFields } from "../../../../tests/helpers/order-fields";
import {
  insertDepartment,
  insertOrder,
  insertOrderExtra,
  inventedNumber,
} from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { submitAgainOrders } from "./submit-again";
import { submitDrafts, submitReadyDrafts } from "./submit";

// Submit with the fields the Head sets, build plan 2.5d (Done when: "a submit with a hidden
// needed-by date and an empty optional department goes through; a required field left empty is
// still refused"). 05-order-request-form.md, Fields the Head sets 2, 3 and 4; Checks at submit;
// plan of 2.5d, decided item 2 (Look first). Each file has its own database, so the setting written
// here is this file's only.

const AT = "2026-10-26T05:00:00Z";

async function scene() {
  setClock(AT);
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  await insertUser("HEAD");
  return { branch, manager };
}

async function ticked(ids: readonly string[]) {
  const rows = await Promise.all(
    ids.map(async (id) => {
      const [row] = await db
        .select({ version: orders.version })
        .from(orders)
        .where(eq(orders.id, id));
      return { id, version: row!.version };
    }),
  );
  return { clientKey: randomUUID(), orders: rows };
}

async function rowOf(id: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  return row!;
}

describe("Submit with the fields the Head sets (05 Fields the Head sets; Checks at submit)", () => {
  it("a hidden needed-by date and an empty optional department go through with a number (05 rule 3)", async () => {
    const { branch, manager } = await scene();
    await setOrderFields({
      neededBy: { ask: "hidden", place: "row" },
      department: { ask: "optional", place: "row" },
    });
    const draft = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      departmentId: null,
      neededBy: null,
    });
    const answer = await runOrdersAction(submitDrafts, manager.id, await ticked([draft.id]));
    expect(answer).toMatchObject({ ok: true });
    expect(await rowOf(draft.id)).toMatchObject({
      status: "PENDING_HEAD",
      departmentId: null,
      neededBy: null,
      plannedTotal: 50_000n,
    });
    expect((await rowOf(draft.id)).number).toMatch(/-26-/);
  });

  it("a required department left empty is still refused on its cell; the defaults ask it", async () => {
    const { branch, manager } = await scene();
    await setOrderFields({});
    const draft = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      departmentId: null,
    });
    expect(await runOrdersAction(submitDrafts, manager.id, await ticked([draft.id]))).toMatchObject(
      {
        ok: false,
        error: {
          code: "not_ready",
          orders: [{ orderId: draft.id, fields: { departmentId: "errors.field.required" } }],
        },
      },
    );
    expect(await rowOf(draft.id)).toMatchObject({ status: "DRAFT", number: null });
  });

  it("a required field under More left empty is refused: the brand (Checks at submit)", async () => {
    const { branch, manager } = await scene();
    await setOrderFields({ brand: { ask: "required", place: "more" } });
    const draft = await insertOrder({ branchId: branch.id, ownerId: manager.id });
    expect(await runOrdersAction(submitDrafts, manager.id, await ticked([draft.id]))).toMatchObject(
      {
        ok: false,
        error: { orders: [{ orderId: draft.id, fields: { companyId: "errors.field.required" } }] },
      },
    );
    const company = await insertCompany();
    await db.update(orders).set({ companyId: company.id }).where(eq(orders.id, draft.id));
    expect(await runOrdersAction(submitDrafts, manager.id, await ticked([draft.id]))).toMatchObject(
      {
        ok: true,
      },
    );
  });

  it("a never-submitted draft takes the hidden values: default payment type, Normal, empty fields, no extra costs (05 rule 2; decided item 2)", async () => {
    const { branch, manager } = await scene();
    await setOrderFields({
      department: { ask: "hidden", place: "row" },
      paymentType: { ask: "hidden", place: "more" },
      priority: { ask: "hidden", place: "more" },
      comment: { ask: "hidden", place: "more" },
      requesterName: { ask: "hidden", place: "more" },
      extras: { ask: "hidden", place: "more" },
    });
    const draft = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      paymentType: "TRANSFER",
      priority: "URGENT",
      urgentReason: "Exams on Monday",
      requesterName: "Invented Person",
    });
    await db.update(orders).set({ comment: "Blue only" }).where(eq(orders.id, draft.id));
    await insertOrderExtra(draft.id, 20_000n);
    expect(await runOrdersAction(submitDrafts, manager.id, await ticked([draft.id]))).toMatchObject(
      {
        ok: true,
      },
    );
    expect(await rowOf(draft.id)).toMatchObject({
      status: "PENDING_HEAD",
      departmentId: null,
      paymentType: "CASH",
      priority: "NORMAL",
      urgentReason: null,
      comment: null,
      requesterName: null,
      // 10 × 5 000 without the hidden extra cost.
      plannedTotal: 50_000n,
    });
    expect(await db.select().from(orderExtras).where(eq(orderExtras.orderId, draft.id))).toEqual(
      [],
    );
  });

  it("an order with a number keeps what it holds in a hidden field (05 rule 4: orders already submitted keep what they hold)", async () => {
    const { branch, manager } = await scene();
    const department = await insertDepartment(branch.id);
    await setOrderFields({ department: { ask: "hidden", place: "row" } });
    // Sent back with its department; submitted again.
    const sentBack = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "RETURNED",
      departmentId: department.id,
    });
    expect(
      await runOrdersAction(submitAgainOrders, manager.id, await ticked([sentBack.id])),
    ).toMatchObject({ ok: true });
    expect(await rowOf(sentBack.id)).toMatchObject({
      status: "PENDING_HEAD",
      departmentId: department.id,
    });
    // Taken back to Draft with its number; submitted again.
    const takenBack = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "DRAFT",
      number: inventedNumber(),
      departmentId: department.id,
    });
    expect(
      await runOrdersAction(submitDrafts, manager.id, await ticked([takenBack.id])),
    ).toMatchObject({ ok: true });
    expect(await rowOf(takenBack.id)).toMatchObject({ departmentId: department.id });
  });

  it("a change applies from the next submit; an order already submitted keeps its values (05 rule 4)", async () => {
    const { branch, manager } = await scene();
    await setOrderFields({ department: { ask: "optional", place: "row" } });
    const first = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      departmentId: null,
    });
    expect(await runOrdersAction(submitDrafts, manager.id, await ticked([first.id]))).toMatchObject(
      {
        ok: true,
      },
    );
    await setOrderFields({ department: { ask: "required", place: "row" } });
    const second = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      departmentId: null,
    });
    expect(
      await runOrdersAction(submitDrafts, manager.id, await ticked([second.id])),
    ).toMatchObject({ ok: false, error: { code: "not_ready" } });
    expect(await rowOf(first.id)).toMatchObject({ status: "PENDING_HEAD", departmentId: null });
  });

  it("Submit with nothing ticked sends the drafts ready under the setting and leaves the others (05 Drafts 4)", async () => {
    const { branch, manager } = await scene();
    await setOrderFields({
      brand: { ask: "required", place: "row" },
      department: { ask: "optional", place: "row" },
    });
    const company = await insertCompany();
    const ready = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      departmentId: null,
    });
    await db.update(orders).set({ companyId: company.id }).where(eq(orders.id, ready.id));
    setClock("2026-10-26T05:00:01Z");
    const notReady = await insertOrder({ branchId: branch.id, ownerId: manager.id });
    const answer = await runOrdersAction(
      submitReadyDrafts,
      manager.id,
      await ticked([ready.id, notReady.id]),
    );
    expect(answer).toMatchObject({ ok: true });
    expect(await rowOf(ready.id)).toMatchObject({ status: "PENDING_HEAD" });
    expect(await rowOf(notReady.id)).toMatchObject({ status: "DRAFT", number: null });
  });
});
