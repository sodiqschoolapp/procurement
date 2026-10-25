import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import {
  auditLog,
  catalogSuggestions,
  notifications,
  priceHistory,
  productVariants,
  products,
} from "@/server/db/schema";
import { accessOf } from "@/server/files/owners";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertCategory, insertFileRow, insertUnit } from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertSuggestion } from "../../../../tests/helpers/suggestions";
import { insertUser } from "../../../../tests/helpers/users";
import { createProduct, setProductActive, updateProduct } from "./products";
import { addSuggestedProduct, declineSuggestion } from "./suggestions";

// Since 1.12b no suggestion is sent (04 rule 8: "Suggestions sent before 25 October 2026 are
// decided as before ... no new ones are sent"; plan of 1.12b, decided item 3, Look first): the
// tests of suggestProduct went with it, and every test here starts from a suggestion written as
// it wrote one (tests/helpers/suggestions.ts). build-plan 1.12, Done when: "Database tests for both outcomes and their notifications; a
// Principal cannot suggest". 04-catalogs.md rule 8 ("The Head adds it (possibly edited) or
// declines with a reason. The Manager is notified either way"); rules 2, 3; 10, Notifications
// ("Product suggested | Head; the decision goes back to the Manager"); 03, Permission matrix
// ("Suggest a new product for the catalog": Head, Manager; "Manage catalogs": Head);
// developer-rules.md rules 3, 8; src/server/files/owners.ts (one holder); plan of 1.12 and its
// review. Every fixture is asserted (D38); every passing case has the refused data beside it (D40).

type Added = { id: string; productId: string };

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

function refused(fields: Record<string, string>) {
  return { ok: false, error: { code: "invalid_input", fields } };
}

const unique = () => newClientKey().slice(0, 8);

async function managerOfNewBranch() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  return { branch, manager };
}

/** A suggestion sent before 25 October 2026 (tests/helpers/suggestions.ts; plan of 1.12b). */
function suggest(userId: string, branchId: string, input: Record<string, unknown> = {}) {
  return insertSuggestion(userId, branchId, input);
}

async function productFields(input: Record<string, unknown> = {}) {
  const category = await insertCategory();
  const unit = await insertUnit();
  return { categoryId: category.id, unitId: unit.id, ...input };
}

function add(headId: string, suggestionId: string, input: Record<string, unknown>) {
  return runAction(addSuggestedProduct, headId, {
    clientKey: newClientKey(),
    suggestionId,
    ...input,
  }) as Promise<ActionResult<Added>>;
}

async function rowOf(id: string) {
  const [row] = await db.select().from(catalogSuggestions).where(eq(catalogSuggestions.id, id));
  return row!;
}

function notificationsOf(type: "PRODUCT_SUGGESTED" | "PRODUCT_SUGGESTION_DECIDED", id: string) {
  return db
    .select({ userId: notifications.userId, params: notifications.params })
    .from(notifications)
    .where(and(eq(notifications.type, type), eq(notifications.link, `/suggestions/${id}`)));
}

function auditRowsOf(id: string) {
  return db
    .select({ action: auditLog.action, actorId: auditLog.actorId, after: auditLog.after })
    .from(auditLog)
    .where(and(eq(auditLog.entity, "catalog_suggestions"), eq(auditLog.entityId, id)))
    .orderBy(auditLog.createdAt, auditLog.id);
}

describe("adding a suggestion to the catalog (04 rule 8: the Head adds it, possibly edited)", () => {
  it("creates the edited product with its default subtype and price, marks the suggestion added, and tells the Manager", async () => {
    const head = await insertUser("HEAD");
    const { branch, manager } = await managerOfNewBranch();
    const photo = await insertFileRow(manager.id);
    const sent = await suggest(manager.id, branch.id, { photoFileId: photo.id });
    const name = `Tahrirlangan ${unique()}`;

    const added = expectOk(
      await add(
        head.id,
        sent.id,
        await productFields({ name, referencePrice: "12 500", photoFileId: photo.id }),
      ),
    );

    expect(added.id).toBe(sent.id);
    const [product] = await db.select().from(products).where(eq(products.id, added.productId));
    expect(product).toMatchObject({
      name,
      photoFileId: photo.id,
      referencePrice: 12_500n,
      isActive: true,
    });
    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, added.productId));
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({ isDefault: true, referencePrice: 12_500n });
    const prices = await db
      .select()
      .from(priceHistory)
      .where(eq(priceHistory.variantId, variants[0]!.id));
    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({ price: 12_500n, source: "HEAD", setBy: head.id });

    expect(await rowOf(sent.id)).toMatchObject({
      status: "ADDED",
      productId: added.productId,
      decidedBy: head.id,
      decisionNote: null,
    });
    expect((await auditRowsOf(sent.id)).map((each) => each.action)).toEqual([
      "suggestion.create",
      "suggestion.add",
    ]);
    const productAudit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, "products"), eq(auditLog.entityId, added.productId)));
    expect(productAudit.map((each) => each.action)).toEqual(["product.create"]);

    const told = await notificationsOf("PRODUCT_SUGGESTION_DECIDED", sent.id);
    expect(told).toEqual([{ userId: manager.id, params: { name: sent.name, outcome: "added" } }]);
    // The product holds the photo now: every role sees it, as any product's photo.
    expect(await accessOf(db, photo.id)).toEqual({ permission: "catalog.pick" });
  });

  it("a second add, or a decline after it, is wrong_status and writes nothing (decision 9)", async () => {
    const head = await insertUser("HEAD");
    const { branch, manager } = await managerOfNewBranch();
    const sent = await suggest(manager.id, branch.id);
    const first = expectOk(
      await add(head.id, sent.id, await productFields({ name: `Bir ${unique()}` })),
    );
    const secondName = `Ikki ${unique()}`;
    expect(await add(head.id, sent.id, await productFields({ name: secondName }))).toMatchObject({
      ok: false,
      error: { code: "wrong_status" },
    });
    expect(await db.select().from(products).where(eq(products.name, secondName))).toEqual([]);
    expect(
      await runAction(declineSuggestion, head.id, { suggestionId: sent.id, reason: "Kerak emas" }),
    ).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    expect(await rowOf(sent.id)).toMatchObject({ status: "ADDED", productId: first.productId });
    expect(await notificationsOf("PRODUCT_SUGGESTION_DECIDED", sent.id)).toHaveLength(1);
  });

  it("the same client key twice returns the first product (developer-rules.md rule 8)", async () => {
    const head = await insertUser("HEAD");
    const { branch, manager } = await managerOfNewBranch();
    const sent = await suggest(manager.id, branch.id);
    const input = {
      clientKey: newClientKey(),
      suggestionId: sent.id,
      ...(await productFields({ name: `Takror ${unique()}` })),
    };
    const first = expectOk(
      (await runAction(addSuggestedProduct, head.id, input)) as ActionResult<Added>,
    );
    const second = expectOk(
      (await runAction(addSuggestedProduct, head.id, input)) as ActionResult<Added>,
    );
    expect(second).toEqual({ id: first.id, productId: first.productId });
  });

  it("a taken name or an inactive measure refuses the whole add: the suggestion stays pending (rule 3)", async () => {
    const head = await insertUser("HEAD");
    const { branch, manager } = await managerOfNewBranch();
    const sent = await suggest(manager.id, branch.id);
    const taken = `Band ${unique()}`;
    expectOk(
      await runAction(createProduct, head.id, {
        clientKey: newClientKey(),
        name: taken,
        ...(await productFields()),
      }),
    );
    expect(await add(head.id, sent.id, await productFields({ name: taken }))).toMatchObject(
      refused({ name: "errors.field.taken" }),
    );
    const inactiveUnit = await insertUnit({ isActive: false });
    const category = await insertCategory();
    expect(
      await add(head.id, sent.id, {
        name: `Yangi ${unique()}`,
        categoryId: category.id,
        unitId: inactiveUnit.id,
      }),
    ).toMatchObject(refused({ unitId: "errors.field.inactive" }));
    expect(await rowOf(sent.id)).toMatchObject({ status: "PENDING", productId: null });
    expect(await notificationsOf("PRODUCT_SUGGESTION_DECIDED", sent.id)).toEqual([]);
  });

  it("hands over only this suggestion's photo: another suggestion's photo or someone else's file is refused (review of the plan, correction 1)", async () => {
    const head = await insertUser("HEAD");
    const { branch, manager } = await managerOfNewBranch();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const xPhoto = await insertFileRow(manager.id);
    const yPhoto = await insertFileRow(colleague.id);
    const loose = await insertFileRow(colleague.id);
    const x = await suggest(manager.id, branch.id, { photoFileId: xPhoto.id });
    const y = await suggest(colleague.id, branch.id, { photoFileId: yPhoto.id });

    for (const photoFileId of [yPhoto.id, loose.id]) {
      expect(
        await add(head.id, x.id, await productFields({ name: `Rasm ${unique()}`, photoFileId })),
      ).toMatchObject(refused({ photoFileId: "errors.field.notAllowed" }));
    }
    expect(await rowOf(x.id)).toMatchObject({ status: "PENDING" });
    expect(await rowOf(y.id)).toMatchObject({ status: "PENDING", photoFileId: yPhoto.id });
    expect(await db.select().from(products).where(eq(products.photoFileId, yPhoto.id))).toEqual([]);
    // X's own photo passes beside them (D40).
    expectOk(
      await add(
        head.id,
        x.id,
        await productFields({ name: `Rasm ${unique()}`, photoFileId: xPhoto.id }),
      ),
    );
  });

  it("an add that drops the photo leaves it behind the suggestion's branch (plan of 1.12, review of the plan, decision 3)", async () => {
    const head = await insertUser("HEAD");
    const { branch, manager } = await managerOfNewBranch();
    const photo = await insertFileRow(manager.id);
    const sent = await suggest(manager.id, branch.id, { photoFileId: photo.id });
    expectOk(await add(head.id, sent.id, await productFields({ name: `Rasmsiz ${unique()}` })));
    expect(await accessOf(db, photo.id)).toEqual({
      permission: "catalog.suggest",
      target: { branchId: branch.id },
    });
  });

  it("a Manager cannot add (03: Manage catalogs, Head only)", async () => {
    const { branch, manager } = await managerOfNewBranch();
    const sent = await suggest(manager.id, branch.id);
    expect(
      await add(manager.id, sent.id, await productFields({ name: `Yo'q ${unique()}` })),
    ).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(await rowOf(sent.id)).toMatchObject({ status: "PENDING" });
  });
});

describe("a suggestion's photo reaches a product only through its add (owners.ts: one holder; review of the plan, correction 2)", () => {
  it("createProduct and updateProduct refuse the photo of a pending suggestion", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const photo = await insertFileRow(head.id);
    await suggest(head.id, branch.id, { photoFileId: photo.id });
    expect(
      await runAction(createProduct, head.id, {
        clientKey: newClientKey(),
        name: `Nusxa ${unique()}`,
        photoFileId: photo.id,
        ...(await productFields()),
      }),
    ).toMatchObject(refused({ photoFileId: "errors.field.notAllowed" }));
    const product = expectOk(
      (await runAction(createProduct, head.id, {
        clientKey: newClientKey(),
        name: `Boshqa ${unique()}`,
        ...(await productFields()),
      })) as ActionResult<{ id: string }>,
    );
    expect(
      await runAction(updateProduct, head.id, { id: product.id, photoFileId: photo.id }),
    ).toMatchObject(refused({ photoFileId: "errors.field.notAllowed" }));
    // The Head's own unheld photo passes beside it (D40).
    const own = await insertFileRow(head.id);
    expectOk(await runAction(updateProduct, head.id, { id: product.id, photoFileId: own.id }));
  });
});

describe("declining a suggestion (04 rule 8: declines with a reason; the Manager is told)", () => {
  it("writes DECLINED with the reason and tells the Manager", async () => {
    const head = await insertUser("HEAD");
    const { branch, manager } = await managerOfNewBranch();
    const sent = await suggest(manager.id, branch.id);
    expectOk(
      await runAction(declineSuggestion, head.id, {
        suggestionId: sent.id,
        reason: "  Omborda bor  ",
      }),
    );
    expect(await rowOf(sent.id)).toMatchObject({
      status: "DECLINED",
      decisionNote: "Omborda bor",
      decidedBy: head.id,
      productId: null,
    });
    expect((await auditRowsOf(sent.id)).map((each) => each.action)).toEqual([
      "suggestion.create",
      "suggestion.decline",
    ]);
    expect(await notificationsOf("PRODUCT_SUGGESTION_DECIDED", sent.id)).toEqual([
      { userId: manager.id, params: { name: sent.name, outcome: "declined" } },
    ]);
  });

  it("needs a reason", async () => {
    const head = await insertUser("HEAD");
    const { branch, manager } = await managerOfNewBranch();
    const sent = await suggest(manager.id, branch.id);
    for (const reason of ["", "   ", "x".repeat(501)]) {
      expect(
        await runAction(declineSuggestion, head.id, { suggestionId: sent.id, reason }),
      ).toMatchObject({
        ok: false,
        error: { code: "invalid_input" },
      });
    }
    expect(await rowOf(sent.id)).toMatchObject({ status: "PENDING" });
  });

  it("a Manager cannot decline; a decided one cannot be declined again", async () => {
    const head = await insertUser("HEAD");
    const { branch, manager } = await managerOfNewBranch();
    const sent = await suggest(manager.id, branch.id);
    expect(
      await runAction(declineSuggestion, manager.id, { suggestionId: sent.id, reason: "Yo'q" }),
    ).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expectOk(
      await runAction(declineSuggestion, head.id, { suggestionId: sent.id, reason: "Yo'q" }),
    );
    expect(
      await runAction(declineSuggestion, head.id, { suggestionId: sent.id, reason: "Yana" }),
    ).toMatchObject({ ok: false, error: { code: "wrong_status" } });
  });

  it("an unknown suggestion is not found", async () => {
    const head = await insertUser("HEAD");
    expect(
      await runAction(declineSuggestion, head.id, { suggestionId: newClientKey(), reason: "Yo'q" }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

// "Suggest a new product for the catalog": Head any branch, Manager own branches (03).
async function pendingSuggestion(branchId: string) {
  const manager = await insertUser("MANAGER", { branches: [branchId] });
  return suggest(manager.id, branchId);
}

// "Manage catalogs": the Head only (03; plan of 1.12, decision 2).
describePermissionMatrix("addSuggestedProduct", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const sent = await pendingSuggestion(branchId);
    asMatrixAnswer(
      await add(user.id, sent.id, await productFields({ name: `Matritsa ${newClientKey()}` })),
    );
  },
});

describePermissionMatrix("declineSuggestion", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const sent = await pendingSuggestion(branchId);
    asMatrixAnswer(
      await runAction(declineSuggestion, user.id, { suggestionId: sent.id, reason: "Matritsa" }),
    );
  },
});
