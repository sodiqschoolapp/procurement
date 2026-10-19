import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROLES } from "@/domain/permissions";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { insertBranch } from "../../../tests/helpers/branches";
import { insertOrder } from "../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser } from "../../../tests/helpers/users";
import { searchEverything } from "./queries/search";

// The search in the permission matrix (15-quality-and-acceptance.md, Test layers: "each action ×
// each role × own branch and other branch"; 03-roles-and-permissions.md, Permission matrix "See
// orders, stock and reports"; rule 1: another branch is "Not found"; plan of 6.10, decided item
// 1, Look first). The query is called directly and through its "use server" export
// (`searchAction`), so each is proved to ask the wall itself. A search that leaves the other
// branch's order out answers "not_found" here.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));

const { searchAction } = await import("@/app/(app)/search-actions");

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

async function numberedOrder(branchId: string) {
  const owner = await insertUser("MANAGER", { branches: [branchId] });
  const branch = await insertBranch();
  const order = await insertOrder({
    branchId,
    ownerId: owner.id,
    status: "PENDING_HEAD",
    // The other branch's code is no part of it: the number is searched whole.
    number: `${branch.code}-26-${100000 + Math.floor(Math.random() * 900000)}`,
  });
  return order.number!;
}

describePermissionMatrix("searchEverything, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const number = await numberedOrder(branchId);
    const found = await searchEverything(user.id, number);
    if (!found.orders.some((order) => order.number === number)) {
      throw new AuthorizationError("not_found");
    }
  },
});

describePermissionMatrix("searchAction, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const number = await numberedOrder(branchId);
    signedIn(user);
    const result = await searchAction({ q: number });
    if (!result.ok) throw new Error(`Unexpected answer: ${result.error.code}`);
    if (!result.data.orders.some((order) => order.number === number)) {
      throw new AuthorizationError("not_found");
    }
  },
});

describe("searchEverything and searchAction: who may search (03 matrix: See orders, stock and reports)", () => {
  it.each(ROLES)("a %s may search", async (role) => {
    const branch = await insertBranch();
    const user = await insertUser(role, { branches: role === "HEAD" ? [] : [branch.id] });
    await expect(searchEverything(user.id, "zz")).resolves.toBeDefined();
    signedIn(user);
    expect((await searchAction({ q: "zz" })).ok).toBe(true);
  });

  it("an inactive user is refused", async () => {
    const branch = await insertBranch();
    const user = await insertUser("MANAGER", { branches: [branch.id], isActive: false });
    await expect(searchEverything(user.id, "zz")).rejects.toEqual(
      new AuthorizationError("forbidden"),
    );
    signedIn(user);
    expect(await searchAction({ q: "zz" })).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
  });

  it("no session is refused", async () => {
    expect(await searchAction({ q: "zz" })).toMatchObject({
      ok: false,
      error: { code: "signed_out" },
    });
  });
});
