import { describe, expect, it } from "vitest";

import { BRANCHES_PAGE_SIZE } from "@/domain/branches";
import { db } from "@/server/db/client";
import { branches } from "@/server/db/schema";

import { insertBranch } from "../../../../tests/helpers/branches";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { getBranch, listBranches } from "./branches";

// build-plan 1.2; 04-catalogs.md rule 2 (inactive entries stay visible); 11-screens-and-ux.md
// rule 8 (25 rows a page); developer-rules.md rule 4 (authorize() in every query); plan of 1.2.

describe("the branch queries (build-plan 1.2)", () => {
  it("lists every branch, inactive too, ordered by code, 25 a page with the counts", async () => {
    const head = await insertUser("HEAD");
    await insertBranch({ code: "ZZB", name: "Sinov ZZB", isActive: false });
    await insertBranch({ code: "ZZA", name: "Sinov ZZA" });
    const all = await db
      .select({ code: branches.code, isActive: branches.isActive })
      .from(branches);
    const codes = all.map((row) => row.code).sort();

    const first = await listBranches(head.id);
    expect(first.page).toBe(1);
    expect(first.rows.map((row) => row.code)).toEqual(codes.slice(0, BRANCHES_PAGE_SIZE));
    expect(first.active + first.inactive).toBe(all.length);
    expect(first.inactive).toBe(all.filter((row) => !row.isActive).length);
    expect(first.inactive).toBeGreaterThanOrEqual(1);

    for (let index = all.length; index < BRANCHES_PAGE_SIZE + 2; index += 1) await insertBranch();
    const total = BRANCHES_PAGE_SIZE + 2;
    const second = await listBranches(head.id, { page: 2 });
    expect(second).toMatchObject({ page: 2, pages: 2 });
    expect(second.rows).toHaveLength(total - BRANCHES_PAGE_SIZE);
    expect((await listBranches(head.id, { page: 9 })).page).toBe(2);
    expect((await listBranches(head.id, { page: 0 })).page).toBe(1);
  });

  it("getBranch gives the branch, and null for an unknown id and for a text that is not an id", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch({ isActive: false });
    expect(await getBranch(head.id, branch.id)).toEqual({
      id: branch.id,
      name: branch.name,
      code: branch.code,
      address: branch.address,
      isActive: false,
    });
    expect(await getBranch(head.id, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getBranch(head.id, "not-an-id")).toBeNull();
  });
});

describePermissionMatrix("listBranches", {
  permission: "catalog.manage",
  run: ({ user }) => listBranches(user.id),
});

describePermissionMatrix("getBranch", {
  permission: "catalog.manage",
  run: ({ user, branchId }) => getBranch(user.id, branchId),
});
