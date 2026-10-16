import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { orderDraftAdds, orders } from "@/server/db/schema";

import { insertBranch } from "../../../../tests/helpers/branches";
import {
  addDraft,
  editDraft,
  insertDepartment,
  insertExtraCostType,
  insertItem,
  insertOrder,
  inventedNumber,
  orderRow,
} from "../../../../tests/helpers/orders";
import { runTogether } from "../../../../tests/helpers/together";
import { insertUser } from "../../../../tests/helpers/users";

// Build plan 2.5a, Done when 6 and "the same add sent twice leaves 20": 05-order-request-form.md
// Drafts 2 ("When the Manager adds a draft whose branch, subtype and department equal one of the
// Manager's own drafts that was never submitted (it has no number), no second draft is made: the
// existing draft's quantity rises by the new quantity, and its other fields stay") and 5 (sent back
// and taken back orders "never merge with a draft"); edge-cases/requests-and-approval.md ("The same
// item is needed by two departments"; "The same item for the same department is added again while a
// draft for it exists"); developer-rules.md rules 8 and 9; plan of 2.5a, decided items 2, 3, 24
// (Look first), and the review's correction 2. Every merge stands beside the case that does not
// merge (D40).

type Ok<T> = { ok: true; data: T };
type Answer = { id: string; merged: boolean; quantity?: string; version: number; total?: bigint };

function data<T = Answer>(result: { ok: boolean }): T {
  expect(result).toMatchObject({ ok: true });
  return (result as Ok<T>).data;
}

async function scene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id);
  const item = await insertItem({ referencePrice: 5_000n });
  const base = { branchId: branch.id, variantId: item.variantId, departmentId: department.id };
  return { branch, manager, department, item, base };
}

/** The never-submitted drafts of one owner, subtype and branch. */
function neverSubmitted(ownerId: string, variantId: string) {
  return db
    .select({
      id: orders.id,
      departmentId: orders.departmentId,
      branchId: orders.branchId,
      plannedQty: orders.plannedQty,
    })
    .from(orders)
    .where(
      and(eq(orders.ownerId, ownerId), eq(orders.variantId, variantId), isNull(orders.number)),
    );
}

describe("Done when 6: the same subtype for the same department raises the draft (05 Drafts 2)", () => {
  it("10 then 10 for the same department: one draft of 20; price, extras and comment unchanged; the total recomputed", async () => {
    const { manager, base } = await scene();
    const delivery = await insertExtraCostType();
    const first = data(
      await addDraft(manager.id, {
        ...base,
        price: "6000",
        comment: "Birinchi",
        extras: [{ extraCostTypeId: delivery.id, amount: "20000" }],
      }),
    );
    expect(first).toEqual({ id: first.id, merged: false, version: 1 });

    const second = data(
      await addDraft(manager.id, { ...base, price: "9999", comment: "Ikkinchi", quantity: "10" }),
    );
    // Review of the plan, correction 2: the new version and total come back for the grid.
    expect(second).toEqual({
      id: first.id,
      merged: true,
      quantity: "20",
      version: 2,
      total: 140_000n,
    });
    expect(await orderRow(first.id)).toMatchObject({
      plannedQty: "20.000",
      plannedPrice: 6_000n,
      comment: "Birinchi",
      plannedTotal: 140_000n,
      version: 2,
    });
    expect(await neverSubmitted(manager.id, base.variantId)).toHaveLength(1);
  });

  it("for another department: two drafts (requests-and-approval.md, two departments)", async () => {
    const { manager, base } = await scene();
    const other = await insertDepartment(base.branchId);
    data(await addDraft(manager.id, base));
    const second = data(await addDraft(manager.id, { ...base, departmentId: other.id }));
    expect(second.merged).toBe(false);
    const rows = await neverSubmitted(manager.id, base.variantId);
    expect(rows.map((row) => row.plannedQty)).toEqual(["10.000", "10.000"]);
  });

  it("another owner's draft of the same branch, subtype and department is not merged", async () => {
    const { branch, manager, base } = await scene();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    data(await addDraft(colleague.id, base));
    expect(data(await addDraft(manager.id, base)).merged).toBe(false);
    expect(await neverSubmitted(colleague.id, base.variantId)).toHaveLength(1);
    expect(await neverSubmitted(manager.id, base.variantId)).toHaveLength(1);
  });

  it("the owner's draft of the same subtype and department name in his other branch is not merged", async () => {
    const { branch, base } = await scene();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id, other.id] });
    data(await addDraft(manager.id, base));
    const there = await insertDepartment(other.id);
    expect(
      data(await addDraft(manager.id, { ...base, branchId: other.id, departmentId: there.id }))
        .merged,
    ).toBe(false);
    expect(await neverSubmitted(manager.id, base.variantId)).toHaveLength(2);
  });

  it("a taken-back Draft (numbered) and a RETURNED order of the same trio are not merged: a new draft is made (05 Drafts 5)", async () => {
    const { branch, manager, base } = await scene();
    const taken = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      number: inventedNumber(),
      variantId: base.variantId,
      departmentId: base.departmentId,
    });
    const returned = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "RETURNED",
      variantId: base.variantId,
      departmentId: base.departmentId,
    });
    const added = data(await addDraft(manager.id, base));
    expect(added.merged).toBe(false);
    expect(added.id).not.toBe(taken.id);
    expect(added.id).not.toBe(returned.id);
    expect((await orderRow(taken.id))!.plannedQty).toBe("10.000");
    expect((await orderRow(returned.id))!.plannedQty).toBe("10.000");
  });

  it("decimals add exactly: 0.125 kg + 0.875 kg is 1", async () => {
    const { manager, base } = await scene();
    const kg = await insertItem({ allowDecimal: true, referencePrice: 1_000n });
    data(await addDraft(manager.id, { ...base, variantId: kg.variantId, quantity: "0.125" }));
    expect(
      data(await addDraft(manager.id, { ...base, variantId: kg.variantId, quantity: "0.875" })),
    ).toMatchObject({ merged: true, quantity: "1", total: 1_000n });
  });

  it("a sum past numeric(14,3) is refused as too large and leaves the draft as it was", async () => {
    const { manager, base } = await scene();
    data(await addDraft(manager.id, { ...base, quantity: "99999999999" }));
    expect(await addDraft(manager.id, { ...base, quantity: "1" })).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { quantity: "errors.field.tooLarge" } },
    });
    const [row] = await neverSubmitted(manager.id, base.variantId);
    expect(row!.plannedQty).toBe("99999999999.000");
  });
});

describe("the same add sent twice (developer-rules rule 8; decided item 3, Look first)", () => {
  it("a merged add sent again leaves 20 and returns the first answer", async () => {
    const { manager, base } = await scene();
    data(await addDraft(manager.id, base));
    const clientKey = randomUUID();
    const first = data(await addDraft(manager.id, { ...base, clientKey }));
    const again = data(await addDraft(manager.id, { ...base, clientKey }));
    expect(again).toEqual(first);
    expect(first).toMatchObject({ merged: true, quantity: "20", version: 2, total: 100_000n });
    expect((await orderRow(first.id))!.plannedQty).toBe("20.000");
    const adds = await db
      .select()
      .from(orderDraftAdds)
      .where(eq(orderDraftAdds.clientKey, clientKey));
    expect(adds).toHaveLength(1);
    expect(adds[0]).toMatchObject({ qtyAfter: "20.000", versionAfter: 2, userId: manager.id });
  });

  it("a new draft sent again returns the same draft; the key of another user is not_found", async () => {
    const { branch, manager, base } = await scene();
    const clientKey = randomUUID();
    const first = data(await addDraft(manager.id, { ...base, clientKey }));
    expect(data(await addDraft(manager.id, { ...base, clientKey }))).toEqual(first);
    expect(await neverSubmitted(manager.id, base.variantId)).toHaveLength(1);
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    expect(await addDraft(colleague.id, { ...base, clientKey })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});

describe("two writes at once into one trio (decided item 24; 15 Test layers: two at a time)", () => {
  it("two adds at once of the same trio end in one draft of 20", async () => {
    const { manager, base } = await scene();
    const outcomes = await runTogether([
      async (meet) => {
        await meet();
        return addDraft(manager.id, base);
      },
      async (meet) => {
        await meet();
        return addDraft(manager.id, base);
      },
    ]);
    const answers = outcomes.map((outcome) => {
      expect(outcome.status).toBe("fulfilled");
      return data((outcome as PromiseFulfilledResult<{ ok: boolean }>).value);
    });
    expect(answers.map((answer) => answer.merged).sort()).toEqual([false, true]);
    const rows = await neverSubmitted(manager.id, base.variantId);
    expect(rows.map((row) => row.plannedQty)).toEqual(["20.000"]);
  });

  it("two updates at once into one trio: one saves, the other is draftExists, never unexpected", async () => {
    const { manager, base } = await scene();
    const target = await insertDepartment(base.branchId);
    const first = data(
      await addDraft(manager.id, {
        ...base,
        departmentId: (await insertDepartment(base.branchId)).id,
      }),
    );
    const second = data(
      await addDraft(manager.id, {
        ...base,
        departmentId: (await insertDepartment(base.branchId)).id,
      }),
    );
    const outcomes = await runTogether(
      [first, second].map((draft) => async (meet: () => Promise<void>) => {
        await meet();
        return editDraft(manager.id, { id: draft.id, version: 1, departmentId: target.id });
      }),
    );
    const results = outcomes.map(
      (outcome) => (outcome as PromiseFulfilledResult<{ ok: boolean; error?: unknown }>).value,
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { departmentId: "errors.field.draftExists" } },
    });
    const inTarget = (await neverSubmitted(manager.id, base.variantId)).filter(
      (row) => row.departmentId === target.id,
    );
    expect(inTarget).toHaveLength(1);
  });

  it("an add and an update at once into one trio end with one draft of it; the update is ok or draftExists", async () => {
    const { manager, base } = await scene();
    const target = await insertDepartment(base.branchId);
    const moving = data(
      await addDraft(manager.id, {
        ...base,
        departmentId: (await insertDepartment(base.branchId)).id,
      }),
    );
    const outcomes = await runTogether<{ ok: boolean; error?: unknown }>([
      async (meet) => {
        await meet();
        return addDraft(manager.id, { ...base, departmentId: target.id });
      },
      async (meet) => {
        await meet();
        return editDraft(manager.id, { id: moving.id, version: 1, departmentId: target.id });
      },
    ]);
    const [added, edited] = outcomes.map(
      (outcome) => (outcome as PromiseFulfilledResult<{ ok: boolean; error?: unknown }>).value,
    );
    expect(added).toMatchObject({ ok: true });
    if (!edited!.ok) {
      expect(edited).toMatchObject({
        error: { code: "invalid_input", fields: { departmentId: "errors.field.draftExists" } },
      });
    }
    const inTarget = (await neverSubmitted(manager.id, base.variantId)).filter(
      (row) => row.departmentId === target.id,
    );
    expect(inTarget).toHaveLength(1);
  });

  it("an update into an existing trio is refused with draftExists; into a free one it passes", async () => {
    const { manager, base } = await scene();
    const other = await insertDepartment(base.branchId);
    data(await addDraft(manager.id, base));
    const second = data(await addDraft(manager.id, { ...base, departmentId: other.id }));
    expect(
      await editDraft(manager.id, { id: second.id, version: 1, departmentId: base.departmentId }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { departmentId: "errors.field.draftExists" } },
    });
    const free = await insertItem();
    expect(
      await editDraft(manager.id, { id: second.id, version: 1, variantId: free.variantId }),
    ).toMatchObject({ ok: true });
  });
});
