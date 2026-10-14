import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { getUser, listBranchChoices, listBranchVacancies, listUsers } from "./users";

// The Head's reads of /users (build-plan 1.3; 03 rule 5: "The Head sees a warning when a branch
// has no active Manager, Principal or Finance user"; 04 rule 2; plan of 1.3, decisions 8 and 14).

describe("listBranchVacancies (03 rule 5)", () => {
  it("lists a branch whose only Manager is inactive, not one whose Manager is active (D40)", async () => {
    const head = await insertUser("HEAD");
    const [empty, full] = [await insertBranch(), await insertBranch()];
    const closed = await insertBranch({ isActive: false });
    await insertUser("MANAGER", { branches: [empty.id], isActive: false });
    await insertUser("MANAGER", { branches: [full.id] });
    await insertUser("FINANCE", { branches: [full.id] });
    await insertUser("PRINCIPAL", { branches: [full.id] });
    await insertUser("FINANCE", { branches: [empty.id] });

    const vacancies = await listBranchVacancies(head.id);
    expect(vacancies.find((branch) => branch.id === empty.id)).toEqual({
      id: empty.id,
      code: empty.code,
      name: empty.name,
      roles: ["MANAGER", "PRINCIPAL"],
    });
    expect(vacancies.find((branch) => branch.id === full.id)).toBeUndefined();
    expect(vacancies.find((branch) => branch.id === closed.id)).toBeUndefined();
  });
});

describe("getUser", () => {
  it("names the last active Head, and answers null for an unknown id or a text", async () => {
    const head = await insertUser("HEAD");
    const other = await insertUser("HEAD");
    expect(await getUser(head.id, other.id)).toMatchObject({ id: other.id, lastActiveHead: false });
    await db.execute(sql`
      update users set is_active = false
       where role = 'HEAD' and is_active and id <> ${head.id}`);
    expect(await getUser(head.id, head.id)).toMatchObject({ lastActiveHead: true, branches: [] });
    expect(await getUser(head.id, "not-an-id")).toBeNull();
    expect(await getUser(head.id, "6f9619ff-8b86-4011-b42d-00cf4fc964ff")).toBeNull();
  });
});

describe("listUsers and listBranchChoices (04 rule 2; decision 14)", () => {
  it("lists inactive users too, with branch codes; offers active branches and the inactive ones held", async () => {
    const head = (
      await db.execute<{ id: string }>(
        sql`select id from users where role = 'HEAD' and is_active limit 1`,
      )
    ).rows[0]!;
    const [open, held] = [await insertBranch(), await insertBranch({ isActive: false })];
    const notHeld = await insertBranch({ isActive: false });
    const user = await insertUser("FINANCE", { branches: [open.id, held.id], isActive: false });
    const principal = await insertUser("PRINCIPAL", { branches: [open.id] });

    let found;
    for (let page = 1; !found; page += 1) {
      const list = await listUsers(head.id, { page });
      found = list.rows.find((row) => row.id === user.id);
      if (page >= list.pages) break;
    }
    expect(found).toMatchObject({ isActive: false, role: "FINANCE" });
    expect(found!.branches.map((branch) => branch.code)).toEqual([open.code, held.code].sort());

    const forUser = await listBranchChoices(head.id, user.id);
    expect(forUser.find((choice) => choice.id === held.id)).toMatchObject({ isActive: false });
    expect(forUser.find((choice) => choice.id === notHeld.id)).toBeUndefined();
    expect(forUser.find((choice) => choice.id === open.id)?.principal).toEqual({
      id: principal.id,
      fullName: principal.fullName,
    });
    const forNew = await listBranchChoices(head.id);
    expect(forNew.find((choice) => choice.id === held.id)).toBeUndefined();
    // The Principal's own page names no Principal to replace on their own branch.
    const forPrincipal = await listBranchChoices(head.id, principal.id);
    expect(forPrincipal.find((choice) => choice.id === open.id)?.principal).toBeNull();
  });
});

describePermissionMatrix("listUsers", {
  permission: "catalog.manage",
  async run({ user }) {
    await listUsers(user.id);
  },
});

describePermissionMatrix("getUser", {
  permission: "catalog.manage",
  async run({ user }) {
    await getUser(user.id, user.id);
  },
});

describePermissionMatrix("listBranchVacancies", {
  permission: "catalog.manage",
  async run({ user }) {
    await listBranchVacancies(user.id);
  },
});

describePermissionMatrix("listBranchChoices", {
  permission: "catalog.manage",
  async run({ user }) {
    await listBranchChoices(user.id);
  },
});
