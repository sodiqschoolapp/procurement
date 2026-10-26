import { describe, expect, it } from "vitest";

import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { stockBalances } from "@/server/db/schema";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { advanceClock, setClock } from "../../../../tests/helpers/clock";
import { insertFileRow, insertSubtypes } from "../../../../tests/helpers/catalog";
import {
  addDraft,
  editDraft,
  insertDepartment,
  insertExtraCostType,
  insertItem,
  insertOrder,
  inventedNumber,
} from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { getDraft, listDrafts } from "./drafts";

// The rows of the drafts grid (build plan 2.5a): 05-order-request-form.md (Order fields 4, 5, 11,
// 16; Drafts 1 and 5; Ticking and filters: Price hint), 06-approval-workflow.md (Statuses: Draft),
// 03-roles-and-permissions.md (rule 1; Manager rights: CREATE_REQUESTS), 11-screens-and-ux.md
// (Screens: Order list; Order list layout 3; Rules for a smooth feel 8), developer-rules.md rules
// 4 and 12; plan of 2.5a, decided item 9 (Look first). Each passing row stands beside the row the
// guard keeps out (D40).

type Ok<T> = { ok: true; data: T };

async function scene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id, { responsibleName: "Dilnoza Rahimova" });
  const item = await insertItem({ referencePrice: 5_000n });
  const base = { branchId: branch.id, variantId: item.variantId, departmentId: department.id };
  return { branch, manager, department, item, base };
}

async function draftOf(userId: string, input: Record<string, unknown>) {
  const result = await addDraft(userId, input);
  expect(result).toMatchObject({ ok: true });
  return (result as Ok<{ id: string; version: number }>).data;
}

async function putStock(branchId: string, variantId: string, qty: string) {
  await db
    .insert(stockBalances)
    .values({ branchId, variantId, qty, createdAt: now(), updatedAt: now() });
}

describe("Done when 3: another Manager of the same branch cannot read a draft (06 Statuses; 03 rule 1)", () => {
  it("listDrafts leaves it out and getDraft is null for the colleague; the owner reads it", async () => {
    const { branch, manager, base } = await scene();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const draft = await draftOf(manager.id, base);
    expect((await listDrafts(colleague.id)).rows).toEqual([]);
    expect(await getDraft(colleague.id, draft.id)).toBeNull();
    expect((await listDrafts(manager.id)).rows.map((row) => row.id)).toEqual([draft.id]);
    expect(await getDraft(manager.id, draft.id)).toMatchObject({ id: draft.id });
  });

  it("the Head sees it with owners=all, with its owner's name, but not in his default view", async () => {
    const { manager, base } = await scene();
    const head = await insertUser("HEAD");
    const draft = await draftOf(manager.id, base);
    const own = await draftOf(head.id, base);
    expect((await listDrafts(head.id)).rows.map((row) => row.id)).toEqual([own.id]);
    const all = await listDrafts(head.id, { owners: "all", branchId: base.branchId });
    expect(all.rows.map((row) => row.id)).toEqual([draft.id, own.id]);
    expect(all.rows[0]).toMatchObject({ ownerId: manager.id, ownerName: manager.fullName });
    expect(await getDraft(head.id, draft.id)).toMatchObject({ id: draft.id });
  });

  it("a Manager of another branch: not_found for the branch and for the draft", async () => {
    const { manager, base } = await scene();
    const elsewhere = await insertUser("MANAGER", { branches: [(await insertBranch()).id] });
    const draft = await draftOf(manager.id, base);
    await expect(listDrafts(elsewhere.id, { branchId: base.branchId })).rejects.toMatchObject({
      kind: "not_found",
    });
    // Every "not found" looks the same: null (permission review of 2.5a, P2).
    expect(await getDraft(elsewhere.id, draft.id)).toBeNull();
    expect((await listDrafts(elsewhere.id)).rows).toEqual([]);
  });

  it("the Principal and Finance of the same branch: getDraft is null on a Draft (permission review of 2.5a, P3)", async () => {
    const { branch, manager, base } = await scene();
    const draft = await draftOf(manager.id, base);
    for (const role of ["PRINCIPAL", "FINANCE"] as const) {
      const user = await insertUser(role, { branches: [branch.id] });
      expect(await getDraft(user.id, draft.id), role).toBeNull();
    }
  });

  it("a Manager asking for owners=all still sees only his own rows", async () => {
    const { branch, manager, base } = await scene();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    await draftOf(colleague.id, base);
    expect((await listDrafts(manager.id, { owners: "all" })).rows).toEqual([]);
  });
});

describe('Done when 5: CREATE_REQUESTS off still shows own drafts (03: "can only view orders")', () => {
  it("the Manager with the right off lists his drafts and reads one", async () => {
    const { manager, base } = await scene();
    const draft = await draftOf(manager.id, base);
    await setManagerRight(manager.id, "CREATE_REQUESTS", false);
    expect((await listDrafts(manager.id)).rows.map((row) => row.id)).toEqual([draft.id]);
    expect(await getDraft(manager.id, draft.id)).toMatchObject({ id: draft.id });
  });
});

describe("what a row shows (05 Order fields 4, 5, 11, 16; Price hint)", () => {
  it("stock of the branch with and without a stock row, beside the same subtype's stock in another branch; a dash for a service", async () => {
    const { branch, manager, base } = await scene();
    const other = await insertBranch();
    const stocked = await insertItem();
    await putStock(branch.id, stocked.variantId, "12.500");
    await putStock(other.id, base.variantId, "99.000");
    const service = await insertItem({ type: "SERVICE" });
    const empty = await draftOf(manager.id, base);
    const full = await draftOf(manager.id, { ...base, variantId: stocked.variantId });
    const work = await draftOf(manager.id, { ...base, variantId: service.variantId });
    const rows = new Map((await listDrafts(manager.id)).rows.map((row) => [row.id, row]));
    expect(rows.get(empty.id)!.inStock).toBe("0");
    expect(rows.get(full.id)!.inStock).toBe("12.5");
    expect(rows.get(work.id)!.inStock).toBeNull();
    expect(rows.get(work.id)!.productType).toBe("SERVICE");
  });

  it("every field of the order, the total and the price hint +35 against the reference price only", async () => {
    const { department, manager, base } = await scene();
    const delivery = await insertExtraCostType();
    const photo = await insertFileRow(manager.id);
    const draft = await draftOf(manager.id, {
      ...base,
      price: "6750",
      quantity: "10",
      neededBy: "2031-05-01",
      requesterName: "Aziza Karimova",
      comment: "Ko'k",
      priority: "URGENT",
      urgentReason: "Imtihon",
      paymentType: "CARD",
      extras: [{ extraCostTypeId: delivery.id, amount: "20000" }],
      referencePhotoFileId: photo.id,
    });
    const row = await getDraft(manager.id, draft.id);
    expect(row).toMatchObject({
      status: "DRAFT",
      label: null,
      number: null,
      quantity: "10",
      price: 6_750n,
      total: 87_500n,
      priceHint: 35n,
      neededBy: "2031-05-01",
      requesterName: "Aziza Karimova",
      comment: "Ko'k",
      priority: "URGENT",
      urgentReason: "Imtihon",
      paymentType: "CARD",
      departmentName: department.name,
      responsibleName: "Dilnoza Rahimova",
      referencePhotoFileId: photo.id,
      subtypeName: null,
      allowsDecimals: false,
      extras: [{ extraCostTypeId: delivery.id, amount: 20_000n }],
    });

    // The last purchase price is a suggestion, not a reference: no hint without a reference.
    const noReference = await insertItem({ referencePrice: null, lastPurchasePrice: 1_000n });
    const hintless = await draftOf(manager.id, {
      ...base,
      variantId: noReference.variantId,
      price: "9000",
    });
    expect((await getDraft(manager.id, hintless.id))!.priceHint).toBeNull();
  });

  it("the photo is the subtype's, else the product's (05 field 5)", async () => {
    const { manager, base } = await scene();
    const productPhoto = await insertFileRow(manager.id);
    const subtypePhoto = await insertFileRow(manager.id);
    const item = await insertItem({ photoFileId: productPhoto.id });
    const [withPhoto, without] = await insertSubtypes(item.id, [
      { name: "Qizil", photoFileId: subtypePhoto.id },
      { name: "Yashil" },
    ]);
    const first = await draftOf(manager.id, { ...base, variantId: withPhoto });
    const second = await draftOf(manager.id, { ...base, variantId: without });
    expect(await getDraft(manager.id, first.id)).toMatchObject({
      photoFileId: subtypePhoto.id,
      subtypeName: "Qizil",
    });
    expect(await getDraft(manager.id, second.id)).toMatchObject({ photoFileId: productPhoto.id });
  });
});

describe("which orders are rows (05 Drafts 5; 06 Statuses)", () => {
  it("RETURNED and taken-back rows carry their number and label; a PENDING_HEAD order of the same owner is absent", async () => {
    const { branch, manager } = await scene();
    const returned = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "RETURNED",
    });
    const taken = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      number: inventedNumber(),
    });
    const pending = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
    });
    const rows = new Map((await listDrafts(manager.id)).rows.map((row) => [row.id, row]));
    expect(rows.get(returned.id)).toMatchObject({ label: "SENT_BACK", number: returned.number });
    expect(rows.get(taken.id)).toMatchObject({ label: "TAKEN_BACK", number: taken.number });
    expect(rows.has(pending.id)).toBe(false);
    expect(await getDraft(manager.id, pending.id)).toBeNull();
  });

  it("the Principal and Finance have no drafts grid: forbidden in their own branch and in another", async () => {
    const { branch } = await scene();
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    for (const user of [principal, finance]) {
      await expect(listDrafts(user.id)).rejects.toMatchObject({ kind: "forbidden" });
      await expect(listDrafts(user.id, { branchId: branch.id })).rejects.toMatchObject({
        kind: "forbidden",
      });
    }
  });
});

describe("paged on the server, 25 rows a page (11 Rules for a smooth feel 8; developer-rules rule 12)", () => {
  it("26 drafts give two pages: the 26th on page 2, oldest first, ties by id", async () => {
    const { manager, base } = await scene();
    setClock("2031-04-01T05:00:00Z");
    const ids: string[] = [];
    for (let at = 0; at < 26; at += 1) {
      const department = await insertDepartment(base.branchId);
      ids.push((await draftOf(manager.id, { ...base, departmentId: department.id })).id);
      // Two drafts share each moment, so the tie is decided by id.
      if (at % 2 === 1) advanceClock({ minutes: 1 });
    }
    const first = await listDrafts(manager.id, { page: 1 });
    const second = await listDrafts(manager.id, { page: 2 });
    expect(first).toMatchObject({ page: 1, pages: 2, total: 26 });
    expect(first.rows).toHaveLength(25);
    expect(second.rows).toHaveLength(1);
    const expected = ids
      .map((id, at) => ({ id, moment: Math.floor(at / 2) }))
      .sort((a, b) => a.moment - b.moment || (a.id < b.id ? -1 : 1))
      .map((entry) => entry.id);
    expect([...first.rows, ...second.rows].map((row) => row.id)).toEqual(expected);
    expect((await listDrafts(manager.id, { page: 9 })).page).toBe(2);
  });

  it("an edit does not move a row: the order stays by creation", async () => {
    const { manager, base } = await scene();
    const older = await draftOf(manager.id, base);
    const newer = await draftOf(manager.id, {
      ...base,
      departmentId: (await insertDepartment(base.branchId)).id,
    });
    expect(
      await editDraft(manager.id, { id: older.id, version: 1, comment: "keyin" }),
    ).toMatchObject({ ok: true });
    expect((await listDrafts(manager.id)).rows.map((row) => row.id)).toEqual([older.id, newer.id]);
  });
});

describe("listDrafts: the submit set (05 Drafts 4; plan of 2.5c, decided item 1, Look first)", () => {
  it("holds the user's own Drafts without a number in the view, oldest first; never another owner's, a numbered or sent-back order, or another branch's", async () => {
    setClock("2026-10-26T05:00:00Z");
    const branch = await insertBranch();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id, other.id] });
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const stranger = await insertUser("MANAGER", {
      branches: [await insertBranch().then((b) => b.id)],
    });
    const first = await insertOrder({ branchId: branch.id, ownerId: manager.id });
    advanceClock({ seconds: 1 });
    const second = await insertOrder({
      branchId: other.id,
      ownerId: manager.id,
      neededBy: "2026-10-25",
    });
    advanceClock({ seconds: 1 });
    // Each kept out by one condition, every other value letting it in (D40; tests rule).
    await insertOrder({ branchId: branch.id, ownerId: colleague.id });
    await insertOrder({ branchId: branch.id, ownerId: manager.id, number: inventedNumber() });
    await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "RETURNED",
      number: inventedNumber(),
    });
    await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PENDING_HEAD" });
    // The Manager's own Draft without a number in a branch he is not assigned to: the branch wall
    // alone keeps it out (03 rule 1; permission review of 2.5c, Must fix 2).
    const notMine = await insertBranch();
    const walled = await insertOrder({ branchId: notMine.id, ownerId: manager.id });
    const strangers = await listDrafts(stranger.id);
    expect(strangers.submitSet).toEqual([]);

    const page = await listDrafts(manager.id);
    expect(page.submitSet.map((one) => one.id)).not.toContain(walled.id);
    expect(page.today).toBe("2026-10-26");
    expect(page.submitSet.map((one) => one.id)).toEqual([first.id, second.id]);
    expect(page.submitSet[0]).toMatchObject({ version: first.version, refusals: {} });
    // Its readiness is submitRefusals() of the draft as read (Build 3).
    expect(page.submitSet[1]!.refusals).toEqual({ neededBy: "inPast" });

    // The branch view narrows it (03 rule 1).
    await expect(listDrafts(manager.id, { branchId: notMine.id })).rejects.toThrow();
    const inOther = await listDrafts(manager.id, { branchId: other.id });
    expect(inOther.submitSet.map((one) => one.id)).toEqual([second.id]);

    // The Head's "all owners" view: the set is still the Head's own only.
    const head = await insertUser("HEAD");
    const all = await listDrafts(head.id, { owners: "all", branchId: branch.id });
    expect(all.rows.map((row) => row.id)).toContain(first.id);
    expect(all.submitSet).toEqual([]);
  });
});
