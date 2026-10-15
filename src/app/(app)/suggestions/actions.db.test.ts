import { beforeEach, describe, expect, it, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { insertCategory, insertUnit } from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";

// The page actions of /suggestions (plan of 1.12, "Server actions and queries"): suggesting under
// catalog.suggest on the branch (03, "Suggest a new product for the catalog": Head, Manager own
// branches), adding and declining under catalog.manage (Head). Tested through the page actions
// themselves, with the session user, as those of 1.5 to 1.7 (permission review of 1.12, Must fix 1).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { addSuggestedProductAction, declineSuggestionAction, suggestProductAction } =
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

function suggestion(branchId: string) {
  return {
    clientKey: newClientKey(),
    branchId,
    name: `Sahifa ${newClientKey()}`,
    unitText: "dona",
  };
}

/** A pending suggestion of the branch, sent by a Manager of it. */
async function pendingIn(branchId: string): Promise<string> {
  signedIn(await insertUser("MANAGER", { branches: [branchId] }));
  const result = await suggestProductAction(suggestion(branchId));
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: { id: string } }).data.id;
}

async function productInput(suggestionId: string) {
  return {
    clientKey: newClientKey(),
    suggestionId,
    name: `Sahifa ${newClientKey()}`,
    categoryId: (await insertCategory()).id,
    unitId: (await insertUnit()).id,
  };
}

describe("the page actions answer only what the screen needs", () => {
  it("suggest gives the id, add the suggestion and the product, decline the id", async () => {
    const branchId = (await insertUser("PRINCIPAL")).branchIds[0]!;
    const first = await pendingIn(branchId);
    const second = await pendingIn(branchId);
    signedIn(await insertUser("HEAD"));
    const added = await addSuggestedProductAction(await productInput(first));
    expect(added).toMatchObject({ ok: true, data: { id: first } });
    expect(Object.keys((added as { ok: true; data: object }).data).sort()).toEqual([
      "id",
      "productId",
    ]);
    expect(await declineSuggestionAction({ suggestionId: second, reason: "Yo'q" })).toEqual({
      ok: true,
      data: { id: second },
    });
  });

  it("a signed-out visitor saves nothing", async () => {
    expect(await suggestProductAction(suggestion(newClientKey()))).toMatchObject({
      ok: false,
      error: { code: "signed_out" },
    });
  });
});

describePermissionMatrix("suggestProductAction", {
  permission: "catalog.suggest",
  async run({ user, branchId }) {
    signedIn(user);
    asMatrixAnswer(await suggestProductAction(suggestion(branchId)));
  },
});

describePermissionMatrix("addSuggestedProductAction", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const id = await pendingIn(branchId);
    const sent = await productInput(id);
    signedIn(user);
    asMatrixAnswer(await addSuggestedProductAction(sent));
  },
});

describePermissionMatrix("declineSuggestionAction", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const id = await pendingIn(branchId);
    signedIn(user);
    asMatrixAnswer(await declineSuggestionAction({ suggestionId: id, reason: "Matritsa" }));
  },
});
