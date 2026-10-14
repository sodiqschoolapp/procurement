import { beforeEach, describe, expect, it, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { insertCategory, insertUnit } from "../../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser } from "../../../../../tests/helpers/users";

// The page actions of /catalog/products (plan of 1.7, "Server actions and queries"): each runs
// its product action in the wrapper, under catalog.manage (03, "Manage catalogs, users, branches,
// settings"). Tested through the page actions themselves, as those of 1.5 and 1.6.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { createProductAction, setProductActiveAction, updateProductAction } =
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

async function input() {
  return {
    clientKey: newClientKey(),
    name: `Sahifa ${newClientKey()}`,
    categoryId: (await insertCategory()).id,
    unitId: (await insertUnit()).id,
    referencePrice: "12 500",
  };
}

async function createdByHead(): Promise<string> {
  signedIn(await insertUser("HEAD"));
  const result = await createProductAction(await input());
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: { id: string } }).data.id;
}

describe("the page actions answer only what the screen needs", () => {
  it("create gives the id, update the changed fields, setActive the id and the flag", async () => {
    const id = await createdByHead();
    expect(await updateProductAction({ id, description: "Yangi" })).toEqual({
      ok: true,
      data: { changed: ["description"] },
    });
    expect(await setProductActiveAction({ id, active: false })).toEqual({
      ok: true,
      data: { id, isActive: false },
    });
  });
});

describePermissionMatrix("createProductAction", {
  permission: "catalog.manage",
  async run({ user }) {
    const sent = await input();
    signedIn(user);
    asMatrixAnswer(await createProductAction(sent));
  },
});

describePermissionMatrix("updateProductAction", {
  permission: "catalog.manage",
  async run({ user }) {
    const id = await createdByHead();
    signedIn(user);
    asMatrixAnswer(await updateProductAction({ id, name: `Matritsa ${newClientKey()}` }));
  },
});

describePermissionMatrix("setProductActiveAction", {
  permission: "catalog.manage",
  async run({ user }) {
    const id = await createdByHead();
    signedIn(user);
    asMatrixAnswer(await setProductActiveAction({ id, active: false }));
  },
});
