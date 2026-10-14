import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BRANCH_COOKIE,
  branchCookieOptions,
  branchCookieValue,
} from "@/features/catalog/branch-cookie";
import type { CurrentUser } from "@/server/auth/session";

import { insertBranch } from "../../../tests/helpers/branches";
import { type InsertedUser, insertUser } from "../../../tests/helpers/users";

// 11-screens-and-ux.md rule 1 and 03-roles-and-permissions.md rule 1: the server action writes
// the `branch` cookie only for a choice it allowed (plan of 0.10b, Tests: "another branch's id is
// not_found and sets no cookie"; permission review of 0.10b, Should fix 3).

const store = vi.hoisted(() => ({
  set: vi.fn(),
  user: null as CurrentUser | null,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: store.set }) }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));

const { chooseBranchAction } = await import("./branch-actions");

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
  store.set.mockReset();
  store.user = null;
});

describe("chooseBranchAction (11 rule 1; 03 rule 1)", () => {
  it("an own branch sets the cookie that names the person, with the cookie options", async () => {
    const branch = await insertBranch();
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    signedIn(finance);

    expect(await chooseBranchAction({ branch: branch.id })).toEqual({ ok: true, data: null });
    expect(store.set).toHaveBeenCalledExactlyOnceWith(
      BRANCH_COOKIE,
      branchCookieValue(finance.id, branch.id),
      branchCookieOptions(),
    );
  });

  it("another branch's id is Not found and sets no cookie", async () => {
    const [own, other] = [await insertBranch(), await insertBranch()];
    const manager = await insertUser("MANAGER", { branches: [own.id] });
    signedIn(manager);

    expect(await chooseBranchAction({ branch: other.id })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(store.set).not.toHaveBeenCalled();
  });

  it("invalid input and a signed-out caller set no cookie", async () => {
    const head = await insertUser("HEAD");
    signedIn(head);
    expect(await chooseBranchAction({ branch: "nowhere" })).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });

    store.user = null;
    expect(await chooseBranchAction({ branch: "all" })).toMatchObject({
      ok: false,
      error: { code: "signed_out" },
    });
    expect(store.set).not.toHaveBeenCalled();
  });
});
