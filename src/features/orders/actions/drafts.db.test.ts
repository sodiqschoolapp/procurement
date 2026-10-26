import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { orderExtras, orders } from "@/server/db/schema";
import { runDraftsAction } from "@/server/drafts-action";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { insertCompany, insertFileRow, insertSubtypes } from "../../../../tests/helpers/catalog";
import {
  addDraft,
  editDraft,
  insertDepartment,
  insertExtraCostType,
  insertItem,
  insertOrder,
  inventedNumber,
  orderRow,
  setDefaultPaymentType,
} from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { deleteDraft, setDraftsNeededBy } from "./drafts";

// The draft actions of build plan 2.5a (Done when 1 to 5) and the rules of the plan's Tests:
// 05-order-request-form.md (Order fields 1 to 16; Drafts 1, 3 and 5), 04-catalogs.md rule 2,
// 06-approval-workflow.md (Statuses: Draft; rule 8), 03-roles-and-permissions.md (rule 1; Manager
// rights: CREATE_REQUESTS), edge-cases/warehouse.md ("Half a piece is typed for an item counted in
// pieces"), developer-rules.md rules 9 and 11; plan of 2.5a and its review. Every passing case
// has the refused data beside it (D40). The merge of 05 Drafts 2 is draft-merge.db.test.ts.

type Ok<T> = { ok: true; data: T };

function data<T>(result: { ok: boolean }): T {
  expect(result).toMatchObject({ ok: true });
  return (result as Ok<T>).data;
}

function refusedOn(field: string, kind: string) {
  return {
    ok: false,
    error: { code: "invalid_input", fields: { [field]: `errors.field.${kind}` } },
  };
}

/** A branch, its Manager and a department of it, and an item counted in pieces. */
async function scene(options: { allowDecimal?: boolean; referencePrice?: bigint | null } = {}) {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id);
  const item = await insertItem({
    allowDecimal: options.allowDecimal,
    referencePrice: options.referencePrice === undefined ? 5_000n : options.referencePrice,
  });
  const base = { branchId: branch.id, variantId: item.variantId, departmentId: department.id };
  return { branch, manager, department, item, base };
}

async function draftOf(userId: string, input: Record<string, unknown>) {
  return data<{ id: string; version: number }>(await addDraft(userId, input));
}

describe("Done when 1: quantity as the measure allows (05 field 10; edge-cases/warehouse.md, Half a piece)", () => {
  it("createDraft refuses 0.5 of an item counted in pieces; 0.5 kg saves beside it", async () => {
    const pieces = await scene();
    expect(await addDraft(pieces.manager.id, { ...pieces.base, quantity: "0.5" })).toMatchObject(
      refusedOn("quantity", "wholeOnly"),
    );
    const kg = await insertItem({ allowDecimal: true });
    const saved = await draftOf(pieces.manager.id, {
      ...pieces.base,
      variantId: kg.variantId,
      quantity: "0.5",
    });
    expect((await orderRow(saved.id))!.plannedQty).toBe("0.500");
  });

  it("updateDraft refuses 0.5 for pieces, and 1.2345 anywhere; 3 saves", async () => {
    const { manager, base } = await scene();
    const draft = await draftOf(manager.id, base);
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, quantity: "0.5" }),
    ).toMatchObject(refusedOn("quantity", "wholeOnly"));
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, quantity: "1.2345" }),
    ).toMatchObject(refusedOn("quantity", "tooManyDecimals"));
    expect(await editDraft(manager.id, { id: draft.id, version: 1, quantity: "3" })).toMatchObject({
      ok: true,
      data: { version: 2, total: 15_000n },
    });
  });

  it("a change of subtype to an item counted in pieces under a draft of 2.5 is refused; to kg it passes", async () => {
    const { manager, base } = await scene({ allowDecimal: true });
    const draft = await draftOf(manager.id, { ...base, quantity: "2.5" });
    const pieces = await insertItem();
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, variantId: pieces.variantId }),
    ).toMatchObject(refusedOn("quantity", "wholeOnly"));
    const litres = await insertItem({ allowDecimal: true });
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, variantId: litres.variantId }),
    ).toMatchObject({ ok: true });
  });
});

describe("Done when 2: the suggested price (05 field 11; decided item 4)", () => {
  it("the reference price when both prices exist; the last purchase price alone; else empty", async () => {
    const { manager, base } = await scene();
    const both = await insertItem({ referencePrice: 5_000n, lastPurchasePrice: 6_000n });
    const lastOnly = await insertItem({ referencePrice: null, lastPurchasePrice: 6_000n });
    const neither = await insertItem({ referencePrice: null });
    const priceOf = async (variantId: string) => {
      const draft = await draftOf(manager.id, { ...base, variantId });
      return (await orderRow(draft.id))!;
    };
    expect(await priceOf(both.variantId)).toMatchObject({
      plannedPrice: 5_000n,
      plannedTotal: 50_000n,
    });
    expect((await priceOf(lastOnly.variantId)).plannedPrice).toBe(6_000n);
    expect(await priceOf(neither.variantId)).toMatchObject({
      plannedPrice: null,
      plannedTotal: null,
    });
  });

  it("a typed price is kept over the suggestion", async () => {
    const { manager, base } = await scene();
    const draft = await draftOf(manager.id, { ...base, price: "6 750" });
    expect((await orderRow(draft.id))!.plannedPrice).toBe(6_750n);
  });

  it("a change of subtype sets the new suggestion unless the write sends a price", async () => {
    const { manager, base } = await scene();
    const draft = await draftOf(manager.id, base);
    const other = await insertItem({ referencePrice: 7_000n });
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, variantId: other.variantId }),
    ).toMatchObject({ ok: true });
    expect((await orderRow(draft.id))!.plannedPrice).toBe(7_000n);
    const third = await insertItem({ referencePrice: 9_000n });
    expect(
      await editDraft(manager.id, {
        id: draft.id,
        version: 2,
        variantId: third.variantId,
        price: "8000",
      }),
    ).toMatchObject({ ok: true });
    expect((await orderRow(draft.id))!.plannedPrice).toBe(8_000n);
  });

  it("the price hint compares with the reference price only: 6 750 against 5 000 is +35", async () => {
    const { manager, base } = await scene();
    const draft = await draftOf(manager.id, base);
    expect(await editDraft(manager.id, { id: draft.id, version: 1, price: "6750" })).toMatchObject({
      ok: true,
      data: { priceHint: 35n },
    });
    expect(await editDraft(manager.id, { id: draft.id, version: 2, price: "5500" })).toMatchObject({
      ok: true,
      data: { priceHint: null },
    });
  });
});

describe("Done when 3: the draft wall on the actions (06 Statuses: Draft; 03 rule 1; 05 Drafts 1)", () => {
  it("another Manager of the same branch: update, delete and apply needed-by are not_found; the owner passes", async () => {
    const { branch, manager, base } = await scene();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const draft = await draftOf(manager.id, base);
    expect(await editDraft(colleague.id, { id: draft.id, version: 1, comment: "x" })).toMatchObject(
      {
        ok: false,
        error: { code: "not_found" },
      },
    );
    expect(await runAction(deleteDraft, colleague.id, { id: draft.id, version: 1 })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(
      await runDraftsAction(setDraftsNeededBy, colleague.id, {
        orders: [{ id: draft.id, version: 1 }],
        neededBy: "2031-06-01",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "not_found", orders: [{ orderId: draft.id, code: "not_found" }] },
    });
    expect(await editDraft(manager.id, { id: draft.id, version: 1, comment: "x" })).toMatchObject({
      ok: true,
    });
  });

  it("the Principal and Finance of the same branch: update, delete and apply needed-by are not_found, not forbidden (permission review of 2.5a, P3)", async () => {
    const { branch, manager, base } = await scene();
    const draft = await draftOf(manager.id, base);
    for (const role of ["PRINCIPAL", "FINANCE"] as const) {
      const user = await insertUser(role, { branches: [branch.id] });
      const notFound = { ok: false, error: { code: "not_found" } };
      expect(
        await editDraft(user.id, { id: draft.id, version: 1, comment: "x" }),
        role,
      ).toMatchObject(notFound);
      expect(
        await runAction(deleteDraft, user.id, { id: draft.id, version: 1 }),
        role,
      ).toMatchObject(notFound);
      expect(
        await runDraftsAction(setDraftsNeededBy, user.id, {
          orders: [{ id: draft.id, version: 1 }],
          neededBy: "2031-06-01",
        }),
        role,
      ).toMatchObject(notFound);
    }
  });

  it("the Head edits a Manager's draft; a Manager of another branch gets not_found", async () => {
    const { manager, base } = await scene();
    const head = await insertUser("HEAD");
    const elsewhere = await insertUser("MANAGER", { branches: [(await insertBranch()).id] });
    const draft = await draftOf(manager.id, base);
    expect(await editDraft(elsewhere.id, { id: draft.id, version: 1, comment: "x" })).toMatchObject(
      {
        ok: false,
        error: { code: "not_found" },
      },
    );
    expect(await editDraft(head.id, { id: draft.id, version: 1, comment: "Bosh" })).toMatchObject({
      ok: true,
    });
    expect((await orderRow(draft.id))!.comment).toBe("Bosh");
  });
});

describe("Done when 4: Urgent needs a reason (05 field 14; decided item 15)", () => {
  it("Urgent without a reason is refused on create; with one it is saved, trimmed", async () => {
    const { manager, base } = await scene();
    expect(await addDraft(manager.id, { ...base, priority: "URGENT" })).toMatchObject(
      refusedOn("urgentReason", "required"),
    );
    expect(
      await addDraft(manager.id, { ...base, priority: "URGENT", urgentReason: "   " }),
    ).toMatchObject(refusedOn("urgentReason", "required"));
    const draft = await draftOf(manager.id, {
      ...base,
      priority: "URGENT",
      urgentReason: "  Ertaga dars ",
    });
    expect(await orderRow(draft.id)).toMatchObject({
      priority: "URGENT",
      urgentReason: "Ertaga dars",
    });
  });

  it("on update: Urgent without a reason is refused; a blank reason sent alone on an Urgent draft too; Normal clears it", async () => {
    const { manager, base } = await scene();
    const draft = await draftOf(manager.id, base);
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, priority: "URGENT" }),
    ).toMatchObject(refusedOn("urgentReason", "required"));
    expect(
      await editDraft(manager.id, {
        id: draft.id,
        version: 1,
        priority: "URGENT",
        urgentReason: "Imtihon",
      }),
    ).toMatchObject({ ok: true });
    expect(
      await editDraft(manager.id, { id: draft.id, version: 2, urgentReason: "" }),
    ).toMatchObject(refusedOn("urgentReason", "required"));
    expect(
      await editDraft(manager.id, { id: draft.id, version: 2, urgentReason: "a".repeat(201) }),
    ).toMatchObject(refusedOn("urgentReason", "tooLong"));
    expect(
      await editDraft(manager.id, { id: draft.id, version: 2, priority: "NORMAL" }),
    ).toMatchObject({ ok: true });
    expect(await orderRow(draft.id)).toMatchObject({ priority: "NORMAL", urgentReason: null });
  });
});

describe("Done when 5: CREATE_REQUESTS off (03 Manager rights)", () => {
  it("a Manager with the right off cannot add, in either branch; with it on beside, he can", async () => {
    const first = await insertBranch();
    const second = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [first.id, second.id] });
    const item = await insertItem();
    const add = async (branchId: string) =>
      addDraft(manager.id, {
        branchId,
        variantId: item.variantId,
        departmentId: (await insertDepartment(branchId)).id,
      });
    expect(await add(first.id)).toMatchObject({ ok: true });
    await setManagerRight(manager.id, "CREATE_REQUESTS", false);
    for (const branch of [first, second]) {
      expect(await add(branch.id)).toMatchObject({ ok: false, error: { code: "forbidden" } });
    }
  });
});

// Since D67 the department is not required to save a draft: whether it is required is decided at
// submit, by the fields the Head sets (05 Fields the Head sets 3 and 4; plan of 2.5d, a changed
// requirement, Look first). These tests asked it of every save before.
describe("required fields of updateDraft (05 Order fields 1, 3, 10; review of the plan, correction 1)", () => {
  it("an empty branch, subtype or quantity is refused as required; a comment alone saves", async () => {
    const { manager, base } = await scene();
    const draft = await draftOf(manager.id, base);
    for (const field of ["branchId", "variantId", "quantity"]) {
      for (const empty of ["", null]) {
        expect(
          await editDraft(manager.id, { id: draft.id, version: 1, [field]: empty }),
          `${field} = ${String(empty)}`,
        ).toMatchObject(refusedOn(field, "required"));
      }
    }
    expect(await orderRow(draft.id)).toMatchObject({ version: 1, ...rowOf(base) });
    expect(await editDraft(manager.id, { id: draft.id, version: 1, comment: "Bor" })).toMatchObject(
      {
        ok: true,
      },
    );
  });

  it("the department can be emptied; the draft has none (05 Fields the Head sets 3)", async () => {
    const { manager, base } = await scene();
    const draft = await draftOf(manager.id, base);
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, departmentId: null }),
    ).toMatchObject({ ok: true });
    expect(await orderRow(draft.id)).toMatchObject({ version: 2, departmentId: null });
  });

  it("createDraft refuses each of the three when missing; without a department it adds the draft", async () => {
    const { manager, base } = await scene();
    for (const field of ["branchId", "variantId", "quantity"]) {
      const input: Record<string, unknown> = { ...base, quantity: "" };
      if (field !== "quantity") {
        input.quantity = "1";
        delete input[field];
      }
      expect(await addDraft(manager.id, input), field).toMatchObject(refusedOn(field, "required"));
    }
    const noDepartment = { branchId: base.branchId, variantId: base.variantId };
    const added = await addDraft(manager.id, { ...noDepartment, quantity: "1" });
    expect(added).toMatchObject({ ok: true, data: { merged: false } });
  });

  it("two adds of one subtype without a department make one draft (05 Fields the Head sets 3; Drafts 2)", async () => {
    const { manager, base } = await scene();
    const noDepartment = { branchId: base.branchId, variantId: base.variantId };
    const first = await addDraft(manager.id, { ...noDepartment, quantity: "2" });
    expect(first).toMatchObject({ ok: true, data: { merged: false } });
    const second = await addDraft(manager.id, { ...noDepartment, quantity: "3" });
    expect(second).toMatchObject({ ok: true, data: { merged: true } });
    const id = (first as { data: { id: string } }).data.id;
    expect((second as { data: { id: string } }).data.id).toBe(id);
    expect(await orderRow(id)).toMatchObject({ departmentId: null, plannedQty: "5.000" });
    // A draft of the same subtype with a department is another draft.
    expect(await addDraft(manager.id, { ...base, quantity: "1" })).toMatchObject({
      ok: true,
      data: { merged: false },
    });
  });
});

function rowOf(base: { branchId: string; variantId: string; departmentId: string }) {
  return { branchId: base.branchId, variantId: base.variantId, departmentId: base.departmentId };
}

describe("branch and department (05 fields 1 and 7; A6; decided item 8)", () => {
  it("a department of another branch is refused on create and update", async () => {
    const { manager, base } = await scene();
    const foreign = await insertDepartment((await insertBranch()).id);
    expect(await addDraft(manager.id, { ...base, departmentId: foreign.id })).toMatchObject(
      refusedOn("departmentId", "notAllowed"),
    );
    const draft = await draftOf(manager.id, base);
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, departmentId: foreign.id }),
    ).toMatchObject(refusedOn("departmentId", "notAllowed"));
  });

  it("a change of branch needs a department of it; to a branch the Manager lacks is not_found; to his other branch passes", async () => {
    const { branch, base } = await scene();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id, other.id] });
    const draft = await draftOf(manager.id, base);
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, branchId: other.id }),
    ).toMatchObject(refusedOn("departmentId", "required"));
    const unseen = await insertBranch();
    expect(
      await editDraft(manager.id, {
        id: draft.id,
        version: 1,
        branchId: unseen.id,
        departmentId: (await insertDepartment(unseen.id)).id,
      }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    const there = await insertDepartment(other.id);
    expect(
      await editDraft(manager.id, {
        id: draft.id,
        version: 1,
        branchId: other.id,
        departmentId: there.id,
      }),
    ).toMatchObject({ ok: true });
    expect(await orderRow(draft.id)).toMatchObject({ branchId: other.id, departmentId: there.id });
  });

  it("the branch of a numbered order is refused (taken back), its other fields save", async () => {
    const { branch, base } = await scene();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id, other.id] });
    const taken = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      number: inventedNumber(),
      variantId: base.variantId,
    });
    expect(
      await editDraft(manager.id, {
        id: taken.id,
        version: 1,
        branchId: other.id,
        departmentId: (await insertDepartment(other.id)).id,
      }),
    ).toMatchObject(refusedOn("branchId", "notAllowed"));
    expect(
      await editDraft(manager.id, { id: taken.id, version: 1, comment: "Qaytdi" }),
    ).toMatchObject({ ok: true });
  });

  it("the Head may not move a Manager's draft to a branch the Manager lacks; to the Manager's other branch he may", async () => {
    const { branch, base } = await scene();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id, other.id] });
    const head = await insertUser("HEAD");
    const draft = await draftOf(manager.id, base);
    const lacking = await insertBranch();
    expect(
      await editDraft(head.id, {
        id: draft.id,
        version: 1,
        branchId: lacking.id,
        departmentId: (await insertDepartment(lacking.id)).id,
      }),
    ).toMatchObject(refusedOn("branchId", "notAllowed"));
    expect(
      await editDraft(head.id, {
        id: draft.id,
        version: 1,
        branchId: other.id,
        departmentId: (await insertDepartment(other.id)).id,
      }),
    ).toMatchObject({ ok: true });
  });

  it("an inactive branch is refused on create and on a change; an active one passes (decisions 1.2, item 3)", async () => {
    const head = await insertUser("HEAD");
    const item = await insertItem();
    const closed = await insertBranch({ isActive: false });
    expect(
      await addDraft(head.id, {
        branchId: closed.id,
        variantId: item.variantId,
        departmentId: (await insertDepartment(closed.id)).id,
      }),
    ).toMatchObject(refusedOn("branchId", "inactive"));
    const open = await insertBranch();
    const draft = await draftOf(head.id, {
      branchId: open.id,
      variantId: item.variantId,
      departmentId: (await insertDepartment(open.id)).id,
    });
    expect(
      await editDraft(head.id, {
        id: draft.id,
        version: 1,
        branchId: closed.id,
        departmentId: (await insertDepartment(closed.id)).id,
      }),
    ).toMatchObject(refusedOn("branchId", "inactive"));
  });
});

describe("inactive entries are refused when picked (04 rule 2; decided item 20)", () => {
  it("an inactive subtype, product, department, company or extra cost type is refused on create", async () => {
    const { branch, manager, base } = await scene();
    const inactiveProduct = await insertItem({ isActive: false });
    expect(
      await addDraft(manager.id, { ...base, variantId: inactiveProduct.variantId }),
    ).toMatchObject(refusedOn("variantId", "inactive"));

    // An active subtype of an inactive product.
    const parent = await insertItem({ isActive: false });
    const [activeChild] = await insertSubtypes(parent.id, [{ isActive: true }]);
    expect(await addDraft(manager.id, { ...base, variantId: activeChild })).toMatchObject(
      refusedOn("variantId", "inactive"),
    );

    const withSubtypes = await insertItem();
    const [, inactiveChild] = await insertSubtypes(withSubtypes.id, [{}, { isActive: false }]);
    expect(await addDraft(manager.id, { ...base, variantId: inactiveChild })).toMatchObject(
      refusedOn("variantId", "inactive"),
    );

    const closedDepartment = await insertDepartment(branch.id, { isActive: false });
    expect(
      await addDraft(manager.id, { ...base, departmentId: closedDepartment.id }),
    ).toMatchObject(refusedOn("departmentId", "inactive"));

    const company = await insertCompany({ isActive: false });
    expect(await addDraft(manager.id, { ...base, companyId: company.id })).toMatchObject(
      refusedOn("companyId", "inactive"),
    );

    const type = await insertExtraCostType({ isActive: false });
    expect(
      await addDraft(manager.id, {
        ...base,
        extras: [{ extraCostTypeId: type.id, amount: "1000" }],
      }),
    ).toMatchObject(refusedOn("extras.0.extraCostTypeId", "inactive"));

    expect(await addDraft(manager.id, base)).toMatchObject({ ok: true });
  });

  it("a draft that already holds an inactive entry still saves its other fields", async () => {
    const { manager, base } = await scene();
    const company = await insertCompany();
    const draft = await draftOf(manager.id, { ...base, companyId: company.id });
    await db.execute(
      // Straight in the table: the catalog's own action is not under test here (D39).
      sql`update companies set is_active = false where id = ${company.id}`,
    );
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, comment: "Hali kerak" }),
    ).toMatchObject({ ok: true });
    expect(await orderRow(draft.id)).toMatchObject({
      companyId: company.id,
      comment: "Hali kerak",
    });
  });
});

describe("extra costs (05 field 12; decided item 13)", () => {
  it("rows are replaced as a whole and counted in the total; 0 and 21 rows are refused", async () => {
    const { manager, base } = await scene();
    const delivery = await insertExtraCostType();
    const loading = await insertExtraCostType();
    const draft = await draftOf(manager.id, {
      ...base,
      extras: [{ extraCostTypeId: delivery.id, amount: "20 000" }],
    });
    expect((await orderRow(draft.id))!.plannedTotal).toBe(70_000n);

    expect(
      await editDraft(manager.id, {
        id: draft.id,
        version: 1,
        extras: [{ extraCostTypeId: loading.id, amount: "0" }],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { "extras.0.amount": expect.any(String) } },
    });
    const many = Array.from({ length: 21 }, () => ({ extraCostTypeId: loading.id, amount: "1" }));
    expect(await editDraft(manager.id, { id: draft.id, version: 1, extras: many })).toMatchObject(
      refusedOn("extras", "tooLarge"),
    );

    expect(
      await editDraft(manager.id, {
        id: draft.id,
        version: 1,
        extras: [
          { extraCostTypeId: loading.id, amount: "5000" },
          { extraCostTypeId: loading.id, amount: "2500" },
        ],
      }),
    ).toMatchObject({ ok: true, data: { total: 57_500n } });
    const rows = await db
      .select({ type: orderExtras.extraCostTypeId, amount: orderExtras.amount })
      .from(orderExtras)
      .where(eq(orderExtras.orderId, draft.id));
    expect(rows.map((row) => row.amount).sort()).toEqual([2_500n, 5_000n]);
    expect(rows.every((row) => row.type === loading.id)).toBe(true);
  });
});

describe("payment type, comment and the named person (05 fields 7, 13, 15)", () => {
  it("the payment type defaults to the setting (set to Bank transfer here, D40); a sent one is kept", async () => {
    const { manager, base } = await scene();
    await setDefaultPaymentType("TRANSFER");
    const fromSetting = await draftOf(manager.id, base);
    expect((await orderRow(fromSetting.id))!.paymentType).toBe("TRANSFER");
    const sent = await draftOf(manager.id, {
      ...base,
      departmentId: (await insertDepartment(base.branchId)).id,
      paymentType: "CARD",
    });
    expect((await orderRow(sent.id))!.paymentType).toBe("CARD");
  });

  it("a comment of 1000 characters saves, 1001 is refused; a named person over 120 is refused", async () => {
    const { manager, base } = await scene();
    expect(await addDraft(manager.id, { ...base, comment: "a".repeat(1001) })).toMatchObject(
      refusedOn("comment", "tooLong"),
    );
    expect(await addDraft(manager.id, { ...base, requesterName: "a".repeat(121) })).toMatchObject(
      refusedOn("requesterName", "tooLong"),
    );
    const draft = await draftOf(manager.id, {
      ...base,
      comment: "a".repeat(1000),
      requesterName: "  Aziza   Karimova ",
    });
    expect(await orderRow(draft.id)).toMatchObject({ requesterName: "Aziza Karimova" });
    expect((await orderRow(draft.id))!.comment).toHaveLength(1000);
  });

  it("the product's default company fills the company unless one is sent", async () => {
    const { manager, base } = await scene();
    const brand = await insertCompany();
    const item = await insertItem({ defaultCompanyId: brand.id });
    const draft = await draftOf(manager.id, { ...base, variantId: item.variantId });
    expect((await orderRow(draft.id))!.companyId).toBe(brand.id);
  });
});

describe("delete (05 Drafts 3; developer-rules rule 11; decided item 7)", () => {
  it("the owner deletes a never-submitted draft with its extra costs", async () => {
    const { manager, base } = await scene();
    const type = await insertExtraCostType();
    const draft = await draftOf(manager.id, {
      ...base,
      extras: [{ extraCostTypeId: type.id, amount: "100" }],
    });
    expect(await runAction(deleteDraft, manager.id, { id: draft.id, version: 1 })).toMatchObject({
      ok: true,
    });
    expect(await orderRow(draft.id)).toBeUndefined();
    expect(
      await db.select().from(orderExtras).where(eq(orderExtras.orderId, draft.id)),
    ).toHaveLength(0);
  });

  it("a numbered Draft (taken back) and a RETURNED order are wrong_status and stay", async () => {
    const { branch, manager } = await scene();
    const taken = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      number: inventedNumber(),
    });
    const returned = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "RETURNED",
    });
    for (const order of [taken, returned]) {
      expect(await runAction(deleteDraft, manager.id, { id: order.id, version: 1 })).toMatchObject({
        ok: false,
        error: { code: "wrong_status" },
      });
      expect(await orderRow(order.id)).toBeDefined();
    }
  });

  it("the Head may not delete a Manager's draft; he deletes his own; an old version is stale", async () => {
    const { manager, base } = await scene();
    const head = await insertUser("HEAD");
    const managers = await draftOf(manager.id, base);
    expect(await runAction(deleteDraft, head.id, { id: managers.id, version: 1 })).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    // The owner is checked before the version (permission review of 2.5a, P4).
    expect(await runAction(deleteDraft, head.id, { id: managers.id, version: 7 })).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    const own = await draftOf(head.id, base);
    expect(await runAction(deleteDraft, head.id, { id: own.id, version: 2 })).toMatchObject({
      ok: false,
      error: { code: "stale_version" },
    });
    expect(await runAction(deleteDraft, head.id, { id: own.id, version: 1 })).toMatchObject({
      ok: true,
    });
  });
});

describe("versions and all or nothing (developer-rules rule 9; 06 rule 8)", () => {
  it("updateDraft with an old version is stale_version and saves nothing", async () => {
    const { manager, base } = await scene();
    const draft = await draftOf(manager.id, base);
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, comment: "Birinchi" }),
    ).toMatchObject({ ok: true });
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, comment: "Ikkinchi" }),
    ).toMatchObject({ ok: false, error: { code: "stale_version" } });
    expect(await orderRow(draft.id)).toMatchObject({ comment: "Birinchi", version: 2 });
  });

  it("apply needed-by: three drafts with one old version change none; then all three change", async () => {
    const { manager, base } = await scene();
    const ids: string[] = [];
    for (let at = 0; at < 3; at += 1) {
      const department = await insertDepartment(base.branchId);
      ids.push((await draftOf(manager.id, { ...base, departmentId: department.id })).id);
    }
    expect(
      await editDraft(manager.id, { id: ids[2], version: 1, comment: "o'zgardi" }),
    ).toMatchObject({ ok: true });
    const stale = await runDraftsAction(setDraftsNeededBy, manager.id, {
      orders: ids.map((id) => ({ id, version: 1 })),
      neededBy: "2031-06-01",
    });
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "stale_version", orders: [{ orderId: ids[2], code: "stale_version" }] },
    });
    for (const id of ids) expect((await orderRow(id))!.neededBy).toBeNull();

    const done = await runDraftsAction(setDraftsNeededBy, manager.id, {
      orders: ids.map((id, at) => ({ id, version: at === 2 ? 2 : 1 })),
      neededBy: "2031-06-01",
    });
    expect(done).toMatchObject({ ok: true });
    for (const id of ids) expect((await orderRow(id))!.neededBy).toBe("2031-06-01");
  });

  it("apply needed-by: 201 drafts are refused; a PENDING_HEAD order among them is wrong_status", async () => {
    const { branch, manager, base } = await scene();
    const many = Array.from({ length: 201 }, () => ({ id: randomUUID(), version: 1 }));
    expect(
      await runDraftsAction(setDraftsNeededBy, manager.id, {
        orders: many,
        neededBy: "2031-06-01",
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_input" } });

    const draft = await draftOf(manager.id, base);
    const pending = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
    });
    const returned = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "RETURNED",
    });
    expect(
      await runDraftsAction(setDraftsNeededBy, manager.id, {
        orders: [draft, pending, returned].map((order) => ({ id: order.id, version: 1 })),
        neededBy: "2031-06-01",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "wrong_status", orders: [{ orderId: pending.id, code: "wrong_status" }] },
    });
    expect(
      await runDraftsAction(setDraftsNeededBy, manager.id, {
        orders: [draft, returned].map((order) => ({ id: order.id, version: 1 })),
        neededBy: "2031-06-01",
      }),
    ).toMatchObject({ ok: true });
    expect((await orderRow(returned.id))!.neededBy).toBe("2031-06-01");
  });

  it("a day that does not exist is refused", async () => {
    const { manager, base } = await scene();
    const draft = await draftOf(manager.id, base);
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, neededBy: "2031-02-30" }),
    ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, neededBy: "2031-02-28" }),
    ).toMatchObject({ ok: true });
  });
});

describe("the reference photo (05 field 5; owners.ts contract; decided item 11)", () => {
  it("a photo uploaded by another user, or held by a product, is refused; a PDF is not a photo; one's own is attached", async () => {
    const { manager, base } = await scene();
    const someone = await insertUser("MANAGER", { branches: [base.branchId] });
    const theirs = await insertFileRow(someone.id);
    expect(await addDraft(manager.id, { ...base, referencePhotoFileId: theirs.id })).toMatchObject(
      refusedOn("referencePhotoFileId", "notAllowed"),
    );
    const held = await insertFileRow(manager.id);
    await insertItem({ photoFileId: held.id });
    expect(await addDraft(manager.id, { ...base, referencePhotoFileId: held.id })).toMatchObject(
      refusedOn("referencePhotoFileId", "notAllowed"),
    );
    const pdf = await insertFileRow(manager.id, "application/pdf");
    expect(await addDraft(manager.id, { ...base, referencePhotoFileId: pdf.id })).toMatchObject(
      refusedOn("referencePhotoFileId", "notAPhoto"),
    );
    const mine = await insertFileRow(manager.id);
    const draft = await draftOf(manager.id, { ...base, referencePhotoFileId: mine.id });
    expect((await orderRow(draft.id))!.referencePhotoFileId).toBe(mine.id);
    // The photo is held now: another draft cannot take it.
    const other = await insertDepartment(base.branchId);
    expect(
      await addDraft(manager.id, {
        ...base,
        departmentId: other.id,
        referencePhotoFileId: mine.id,
      }),
    ).toMatchObject(refusedOn("referencePhotoFileId", "notAllowed"));
  });
});

describe("the rows the guard keeps (D40)", () => {
  it("a RETURNED order is edited in the grid (05 Drafts 5); a PENDING_HEAD one is wrong_status", async () => {
    const { branch, manager } = await scene();
    const returned = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "RETURNED",
    });
    const pending = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
    });
    expect(
      await editDraft(manager.id, { id: returned.id, version: 1, quantity: "12" }),
    ).toMatchObject({
      ok: true,
      data: { version: 2, total: 60_000n },
    });
    expect(
      await editDraft(manager.id, { id: pending.id, version: 1, quantity: "12" }),
    ).toMatchObject({
      ok: false,
      error: { code: "wrong_status" },
    });
    const [row] = await db.select().from(orders).where(eq(orders.id, pending.id));
    expect(row!.plannedQty).toBe("10.000");
  });
});

describe("a total past MONEY_MAX is refused as too large (05 field 16; developer-rules rule 6; review of 2.5a, S3)", () => {
  const HUGE = "999 999 999 999 999";

  it("on create: the largest quantity at the largest price is tooLarge on quantity; 1 at that price saves", async () => {
    const { manager, base } = await scene();
    expect(
      await addDraft(manager.id, { ...base, quantity: "99999999999", price: HUGE }),
    ).toMatchObject(refusedOn("quantity", "tooLarge"));
    expect(await addDraft(manager.id, { ...base, quantity: "1", price: HUGE })).toMatchObject({
      ok: true,
    });
  });

  it("on a merged add: a sum whose total no longer fits is tooLarge on quantity and leaves the draft", async () => {
    const { manager, base } = await scene();
    const draft = await draftOf(manager.id, { ...base, quantity: "1", price: HUGE });
    expect(await addDraft(manager.id, { ...base, quantity: "1" })).toMatchObject(
      refusedOn("quantity", "tooLarge"),
    );
    expect(await orderRow(draft.id)).toMatchObject({ plannedQty: "1.000", version: 1 });
  });

  it("on update: a price that pushes the total past it is tooLarge on price; a quantity, on quantity", async () => {
    const { manager, base } = await scene();
    const draft = await draftOf(manager.id, { ...base, price: "100 000 000" });
    expect(await editDraft(manager.id, { id: draft.id, version: 1, price: HUGE })).toMatchObject(
      refusedOn("price", "tooLarge"),
    );
    expect(
      await editDraft(manager.id, { id: draft.id, version: 1, quantity: "99999999999" }),
    ).toMatchObject(refusedOn("quantity", "tooLarge"));
    expect(await orderRow(draft.id)).toMatchObject({ plannedQty: "10.000", version: 1 });
  });
});
