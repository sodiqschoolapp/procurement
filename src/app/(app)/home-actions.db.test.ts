import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { addProductWhileOrdering } from "@/features/catalog/actions/manager-adds";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { insertBranch } from "../../../tests/helpers/branches";
import { insertCategory, insertUnit } from "../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser } from "../../../tests/helpers/users";

// The page action of the Head's home that marks entries Managers added checked (04-catalogs.md
// rule 8; plan of 1.12b): catalog.manage, the Head only, tested through the page action itself
// with the session user (.claude/rules/server-actions.md).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { markAddedCheckedAction } = await import("./home-actions");

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

/** A product a Manager of a new branch added from an order's product search. */
async function addedProduct(): Promise<string> {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const result = await runAction(addProductWhileOrdering, manager.id, {
    clientKey: randomUUID(),
    name: `Bosh sahifa ${randomUUID().slice(0, 8)}`,
    categoryId: (await insertCategory()).id,
    unitId: (await insertUnit()).id,
  });
  expect(result).toMatchObject({ ok: true, data: { outcome: "made" } });
  return (result as { ok: true; data: { productId: string } }).data.productId;
}

describe("markAddedCheckedAction", () => {
  it("answers the counts it marked", async () => {
    const productId = await addedProduct();
    signedIn(await insertUser("HEAD"));
    expect(await markAddedCheckedAction({ productIds: [productId] })).toEqual({
      ok: true,
      data: { products: 1, subtypes: 0 },
    });
  });

  it("a signed-out visitor saves nothing", async () => {
    expect(await markAddedCheckedAction({ productIds: [await addedProduct()] })).toMatchObject({
      ok: false,
      error: { code: "signed_out" },
    });
  });
});

describePermissionMatrix("markAddedCheckedAction", {
  permission: "catalog.manage",
  async run({ user }) {
    const productId = await addedProduct();
    signedIn(user);
    asMatrixAnswer(await markAddedCheckedAction({ productIds: [productId] }));
  },
});
