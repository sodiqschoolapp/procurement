import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertCategory, insertProduct, insertUnit } from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";

// The page actions of the product search's Add (04-catalogs.md rule 8; 03, Permission matrix:
// "Add a product or a subtype from an order's product search", Manager rights: ADD_PRODUCTS;
// plan of 1.12b), each called through its own "use server" export with the session user
// (.claude/rules/server-actions.md).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { addProductWhileOrderingAction, addSubtypeWhileOrderingAction, listAddChoicesAction } =
  await import("./actions");

function signedIn(user: InsertedUser): void {
  store.user = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    locale: "uz",
    sessionToken: "invented-token",
  };
}

beforeEach(() => {
  store.user = null;
});

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

describe("the page actions answer only what the dialog needs", () => {
  it("a subtype add gives its outcome, product, subtype and name, and no row bodies", async () => {
    const branch = await insertBranch();
    signedIn(await insertUser("MANAGER", { branches: [branch.id] }));
    const product = await insertProduct();
    const result = await addSubtypeWhileOrderingAction({
      clientKey: randomUUID(),
      productId: product.id,
      name: "96 varaq",
      existingName: "48 varaq",
    });
    expect(result).toMatchObject({ ok: true, data: { outcome: "made", productId: product.id } });
    expect(Object.keys((result as { ok: true; data: object }).data).sort()).toEqual([
      "name",
      "outcome",
      "productId",
      "variantId",
    ]);
  });

  it("the choices list active categories and measures only (04 rule 2)", async () => {
    signedIn(await insertUser("HEAD"));
    const active = await insertCategory();
    const inactive = await insertCategory({ isActive: false });
    const unit = await insertUnit();
    const result = await listAddChoicesAction();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const categoryIds = result.data.categories.map((row) => row.id);
    expect(categoryIds).toContain(active.id);
    expect(categoryIds).not.toContain(inactive.id);
    expect(result.data.measures.map((row) => row.id)).toContain(unit.id);
  });

  it("a signed-out visitor saves nothing", async () => {
    expect(
      await addProductWhileOrderingAction({
        clientKey: randomUUID(),
        name: "Hech kim",
        categoryId: randomUUID(),
        unitId: randomUUID(),
      }),
    ).toMatchObject({ ok: false, error: { code: "signed_out" } });
  });
});

describePermissionMatrix("addProductWhileOrderingAction", {
  permission: "catalog.add",
  async run({ user }) {
    const input = {
      clientKey: randomUUID(),
      name: `Sahifa ${randomUUID().slice(0, 8)}`,
      categoryId: (await insertCategory()).id,
      unitId: (await insertUnit()).id,
    };
    signedIn(user);
    asMatrixAnswer(await addProductWhileOrderingAction(input));
  },
});

describePermissionMatrix("addSubtypeWhileOrderingAction", {
  permission: "catalog.add",
  async run({ user }) {
    const product = await insertProduct();
    signedIn(user);
    asMatrixAnswer(
      await addSubtypeWhileOrderingAction({
        clientKey: randomUUID(),
        productId: product.id,
        name: "yangi",
        existingName: "eski",
      }),
    );
  },
});

describePermissionMatrix("listAddChoicesAction", {
  permission: "catalog.pick",
  async run({ user }) {
    signedIn(user);
    asMatrixAnswer(await listAddChoicesAction());
  },
});
