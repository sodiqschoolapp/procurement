import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { userBranches } from "@/server/db/schema";

import { insertBranch } from "../../../../tests/helpers/branches";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { AuthorizationError } from "@/server/authorize";
import { chooseBranch } from "../branch-choice";
import { branchCookieValue } from "../branch-cookie";
import { currentBranchChoice, listMyBranches } from "./my-branches";

// 11-screens-and-ux.md rule 1 (the branch switcher, "All my branches" by default); 03-roles-
// and-permissions.md rule 1 (another branch is "Not found"); developer-rules.md rule 4 (the
// branch filter inside the SQL); decisions 0.7 item 9 (inactive branches stay); plan of 0.10b
// and its review, corrections 1 and 3.

const NO_BRANCH = "00000000-0000-4000-8000-0000000000ff";

describe("listMyBranches (11 rule 1; developer-rules rule 4)", () => {
  it("the Head sees every branch, the inactive one too, marked (0.7 item 9; correction 1)", async () => {
    const head = await insertUser("HEAD");
    const active = await insertBranch();
    const inactive = await insertBranch({ isActive: false });

    const found = await listMyBranches(head.id);

    expect(found).toEqual(
      expect.arrayContaining([
        { id: active.id, code: active.code, name: active.name, isActive: true },
        { id: inactive.id, code: inactive.code, name: inactive.name, isActive: false },
      ]),
    );
    const codes = found.map((branch) => branch.code);
    expect(codes).toEqual([...codes].sort());
  });

  it("a Manager and a Finance user see only their own, with another branch beside them (D40)", async () => {
    const [first, second, other] = [
      await insertBranch(),
      await insertBranch(),
      await insertBranch(),
    ];
    const manager = await insertUser("MANAGER", { branches: [first.id] });
    const finance = await insertUser("FINANCE", { branches: [second.id, first.id] });
    await insertUser("MANAGER", { branches: [other.id] });

    expect((await listMyBranches(manager.id)).map((branch) => branch.id)).toEqual([first.id]);
    expect((await listMyBranches(finance.id)).map((branch) => branch.id)).toEqual(
      [first, second].sort((a, b) => a.code.localeCompare(b.code)).map((branch) => branch.id),
    );
  });

  it("a Principal sees its one branch", async () => {
    const principal = await insertUser("PRINCIPAL");

    expect((await listMyBranches(principal.id)).map((branch) => branch.id)).toEqual(
      principal.branchIds,
    );
  });

  it("an inactive user is refused", async () => {
    const inactive = await insertUser("FINANCE", { isActive: false });

    await expect(listMyBranches(inactive.id)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("chooseBranch (11 rule 1; 03 rule 1)", () => {
  it("'all' and an own branch give the cookie that names the person", async () => {
    const branch = await insertBranch();
    const finance = await insertUser("FINANCE", { branches: [branch.id] });

    expect(await chooseBranch(finance.id, "all")).toEqual({
      ok: true,
      data: { cookie: branchCookieValue(finance.id, "all") },
    });
    expect(await chooseBranch(finance.id, branch.id)).toEqual({
      ok: true,
      data: { cookie: branchCookieValue(finance.id, branch.id) },
    });
  });

  it("another branch's id is Not found (03 rule 1)", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [own.id] });

    expect(await chooseBranch(manager.id, other.id)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("the Head: an id of no branch is Not found, an inactive branch is allowed (0.7 item 9)", async () => {
    const head = await insertUser("HEAD");
    const inactive = await insertBranch({ isActive: false });

    expect(await chooseBranch(head.id, NO_BRANCH)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await chooseBranch(head.id, inactive.id)).toMatchObject({ ok: true });
  });

  it("anything but 'all' or a branch id is invalid input", async () => {
    const head = await insertUser("HEAD");

    for (const input of ["", "ALL", 5, null, { branchId: NO_BRANCH }]) {
      expect(await chooseBranch(head.id, input)).toMatchObject({
        ok: false,
        error: { code: "invalid_input" },
      });
    }
  });
});

describe("currentBranchChoice (11 rule 1; 03 rule 1)", () => {
  it("is the cookie's branch while it is the person's", async () => {
    const branch = await insertBranch();
    const finance = await insertUser("FINANCE", { branches: [branch.id] });

    expect(await currentBranchChoice(finance.id, branchCookieValue(finance.id, branch.id))).toBe(
      branch.id,
    );
    expect(await currentBranchChoice(finance.id, branchCookieValue(finance.id, "all"))).toBeNull();
    expect(await currentBranchChoice(finance.id, undefined)).toBeNull();
  });

  it("a branch taken away reads as All my branches", async () => {
    const [kept, taken] = [await insertBranch(), await insertBranch()];
    const finance = await insertUser("FINANCE", { branches: [kept.id, taken.id] });
    const cookie = branchCookieValue(finance.id, taken.id);
    expect(await currentBranchChoice(finance.id, cookie)).toBe(taken.id);

    await db.delete(userBranches).where(eq(userBranches.branchId, taken.id));

    expect(await currentBranchChoice(finance.id, cookie)).toBeNull();
  });

  it("the next person on the same device starts on All my branches (correction 3)", async () => {
    const branch = await insertBranch();
    const first = await insertUser("MANAGER", { branches: [branch.id] });
    const next = await insertUser("FINANCE", { branches: [branch.id] });

    expect(await currentBranchChoice(next.id, branchCookieValue(first.id, branch.id))).toBeNull();
  });
});

describePermissionMatrix("listMyBranches", {
  permission: "profile.edit",
  run: ({ user }) => listMyBranches(user.id),
});

describePermissionMatrix("chooseBranch with All my branches", {
  permission: "profile.edit",
  async run({ user }) {
    const result = await chooseBranch(user.id, "all");
    if (result.ok) return;
    const { code } = result.error;
    if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
    throw new Error(`Unexpected answer: ${code}`);
  },
});

describePermissionMatrix("currentBranchChoice", {
  permission: "profile.edit",
  run: ({ user }) => currentBranchChoice(user.id, undefined),
});
