import { TransactionRollbackError, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  AuthorizationError,
  type OrderCheck,
  authorize,
  authorizeOrders,
  branchFilter,
} from "@/server/authorize";
import { db } from "@/server/db/client";
import { branches, users } from "@/server/db/schema";

import { insertBranch, setManagerRight } from "../../tests/helpers/branches";
import { describePermissionMatrix } from "../../tests/helpers/permission-matrix";
import { insertUser } from "../../tests/helpers/users";

// authorize() and branchFilter() against a real database (developer-rules.md rule 4;
// 03-roles-and-permissions.md; build-plan 0.7, Done when).

async function refusalKind(action: Promise<unknown>): Promise<string> {
  try {
    await action;
  } catch (error) {
    if (error instanceof AuthorizationError) return error.kind;
    throw error;
  }
  return "allowed";
}

// One sample action per role, through the generator every later task uses (Done when:
// "authorize() gives the matrix answer for one sample action per role").
describePermissionMatrix("authorize(), Head's sample", {
  permission: "request.approve_step1",
  run: ({ user, branchId }) => authorize(user.id, "request.approve_step1", { branchId }),
});
describePermissionMatrix("authorize(), Manager's sample", {
  permission: "request.create",
  run: ({ user, branchId }) => authorize(user.id, "request.create", { branchId }),
});
describePermissionMatrix("authorize(), Principal's sample", {
  permission: "request.approve_step2",
  run: ({ user, branchId }) => authorize(user.id, "request.approve_step2", { branchId }),
});
describePermissionMatrix("authorize(), Finance's sample", {
  permission: "money.record",
  run: ({ user, branchId }) => authorize(user.id, "money.record", { branchId }),
});
describePermissionMatrix("authorize(), an own-requests sample", {
  permission: "purchase.record",
  run: ({ user, branchId, ownerId }) =>
    authorize(user.id, "purchase.record", { branchId, ownerId }),
});
describePermissionMatrix("authorize(), a permission with no branch", {
  permission: "catalog.manage",
  run: ({ user }) => authorize(user.id, "catalog.manage"),
});

describe("authorize() (03-roles-and-permissions.md)", () => {
  it("answers not_found for another branch, also to a role with no right to the action (rule 1)", async () => {
    const chl = await insertBranch();
    const yns = await insertBranch();
    const finance = await insertUser("FINANCE", { branches: [chl.id] });
    expect(
      await refusalKind(authorize(finance.id, "request.approve_step1", { branchId: yns.id })),
    ).toBe("not_found");
    expect(
      await refusalKind(authorize(finance.id, "request.approve_step1", { branchId: chl.id })),
    ).toBe("forbidden");
  });

  it("refuses a Manager with CREATE_REQUESTS off in each of their branches; another Manager and the Head still create", async () => {
    const chl = await insertBranch();
    const yns = await insertBranch();
    const switchedOff = await insertUser("MANAGER", { branches: [chl.id, yns.id] });
    const colleague = await insertUser("MANAGER", { branches: [chl.id] });
    const head = await insertUser("HEAD");
    await setManagerRight(switchedOff.id, "CREATE_REQUESTS", false);
    // Another right switched off beside it changes nothing for this permission.
    await setManagerRight(colleague.id, "ISSUE_STOCK", false);

    for (const branchId of [chl.id, yns.id]) {
      expect(await refusalKind(authorize(switchedOff.id, "request.create", { branchId }))).toBe(
        "forbidden",
      );
    }
    expect(await refusalKind(authorize(colleague.id, "request.create", { branchId: chl.id }))).toBe(
      "allowed",
    );
    expect(await refusalKind(authorize(head.id, "request.create", { branchId: yns.id }))).toBe(
      "allowed",
    );
  });

  it("allows a right switched on again", async () => {
    const chl = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [chl.id] });
    await setManagerRight(manager.id, "ISSUE_STOCK", false);
    await setManagerRight(manager.id, "ISSUE_STOCK", true);
    expect(await refusalKind(authorize(manager.id, "stock.issue", { branchId: chl.id }))).toBe(
      "allowed",
    );
  });

  it("ignores a rights row of a Head: switches only take a Manager's rights away", async () => {
    const chl = await insertBranch();
    const head = await insertUser("HEAD");
    await setManagerRight(head.id, "CREATE_REQUESTS", false);
    expect(await refusalKind(authorize(head.id, "request.create", { branchId: chl.id }))).toBe(
      "allowed",
    );
  });

  it("refuses an inactive user and an unknown one", async () => {
    const chl = await insertBranch();
    const inactive = await insertUser("MANAGER", { branches: [chl.id], isActive: false });
    expect(await refusalKind(authorize(inactive.id, "data.view", { branchId: chl.id }))).toBe(
      "forbidden",
    );
    expect(
      await refusalKind(
        authorize("00000000-0000-4000-8000-000000000000", "data.view", { branchId: chl.id }),
      ),
    ).toBe("forbidden");
  });

  it("judges a user by the role of the moment: a Finance user made Manager creates requests at once", async () => {
    const chl = await insertBranch();
    const user = await insertUser("FINANCE", { branches: [chl.id] });
    expect(await refusalKind(authorize(user.id, "request.create", { branchId: chl.id }))).toBe(
      "forbidden",
    );
    await db.update(users).set({ role: "MANAGER" }).where(eq(users.id, user.id));
    expect(await refusalKind(authorize(user.id, "request.create", { branchId: chl.id }))).toBe(
      "allowed",
    );
  });

  it("passes waiting approvals to the new Principal when the branch's Principal changes (edge-cases/requests-and-approval.md; rule 3)", async () => {
    const chl = await insertBranch();
    const old = await insertUser("PRINCIPAL", { branches: [chl.id] });
    expect(
      await refusalKind(authorize(old.id, "request.approve_step2", { branchId: chl.id })),
    ).toBe("allowed");

    await db.update(users).set({ isActive: false }).where(eq(users.id, old.id));
    const acting = await insertUser("PRINCIPAL", { branches: [chl.id] });

    expect(
      await refusalKind(authorize(acting.id, "request.approve_step2", { branchId: chl.id })),
    ).toBe("allowed");
    expect(
      await refusalKind(authorize(old.id, "request.approve_step2", { branchId: chl.id })),
    ).toBe("forbidden");
  });

  it("reads the actor inside the transaction it is given", async () => {
    const chl = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [chl.id] });
    let insideKind = "not read";
    const rolledBack = db.transaction(async (tx) => {
      await tx.update(users).set({ role: "FINANCE" }).where(eq(users.id, manager.id));
      insideKind = await refusalKind(
        authorize(manager.id, "request.create", { branchId: chl.id }, tx),
      );
      tx.rollback();
    });
    await expect(rolledBack).rejects.toBeInstanceOf(TransactionRollbackError);
    // Inside, authorize() read the transaction's own change (asserted here, outside the
    // transaction, so a failure is never swallowed with the rollback; D38).
    expect(insideKind).toBe("forbidden");
    // Outside, the rolled-back change was never there.
    expect(await refusalKind(authorize(manager.id, "request.create", { branchId: chl.id }))).toBe(
      "allowed",
    );
  });

  it("creates an invented Principal with a branch of its own when none is given", async () => {
    const principal = await insertUser("PRINCIPAL");
    expect(principal.branchIds).toHaveLength(1);
  });
});

describe("authorizeOrders(): authorize() for many ticked orders (plan of 2.4; 03 rule 8)", () => {
  it("answers each order as authorize() answers it alone", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [own.id] });
    const colleague = await insertUser("MANAGER", { branches: [own.id] });
    const checks: OrderCheck[] = [
      { permission: "request.edit", target: { branchId: own.id, ownerId: manager.id } },
      { permission: "request.edit", target: { branchId: own.id, ownerId: colleague.id } },
      { permission: "request.edit", target: { branchId: other.id, ownerId: manager.id } },
      { permission: "request.approve_step1", target: { branchId: own.id } },
      { permission: "data.view", target: { branchId: own.id } },
    ];
    const alone = async () =>
      Promise.all(
        checks.map(async (check) => {
          const kind = await refusalKind(authorize(manager.id, check.permission, check.target));
          return kind === "allowed" ? "allow" : kind;
        }),
      );

    const answer = await authorizeOrders(manager.id, checks, db);
    expect(answer.decisions).toEqual(["allow", "forbidden", "not_found", "forbidden", "allow"]);
    expect(answer.decisions).toEqual(await alone());
    expect(answer.actor).toMatchObject({
      userId: manager.id,
      role: "MANAGER",
      branchIds: [own.id],
    });

    // A right switched off counts at once, for every order (03, Manager rights).
    await setManagerRight(manager.id, "CREATE_REQUESTS", false);
    const switchedOff = await authorizeOrders(manager.id, checks, db);
    expect(switchedOff.decisions).toEqual([
      "forbidden",
      "forbidden",
      "not_found",
      "forbidden",
      "allow",
    ]);
    expect(switchedOff.decisions).toEqual(await alone());
  });

  it("refuses an inactive user and an unknown one", async () => {
    const branch = await insertBranch();
    const inactive = await insertUser("MANAGER", { branches: [branch.id], isActive: false });
    const check: OrderCheck = { permission: "data.view", target: { branchId: branch.id } };
    expect(await refusalKind(authorizeOrders(inactive.id, [check], db))).toBe("forbidden");
    expect(
      await refusalKind(authorizeOrders("00000000-0000-4000-8000-000000000000", [check], db)),
    ).toBe("forbidden");
  });
});

describe("branchFilter() (developer-rules.md rule 4: lists filter by branch inside the SQL)", () => {
  /** The branches a list shows the user, asked as data.view on a branch the user sees. */
  async function visibleBranches(userId: string, seenBranchId: string): Promise<string[]> {
    const actor = await authorize(userId, "data.view", { branchId: seenBranchId });
    const rows = await db
      .select({ id: branches.id })
      .from(branches)
      .where(branchFilter(actor, branches.id));
    return rows.map((row) => row.id).toSorted();
  }

  it("returns only own-branch rows to a Manager of two branches, a Principal and a Finance user; every branch to the Head", async () => {
    const chl = await insertBranch();
    const yns = await insertBranch();
    const third = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [chl.id, yns.id] });
    const principal = await insertUser("PRINCIPAL", { branches: [yns.id] });
    const finance = await insertUser("FINANCE", { branches: [third.id] });
    const head = await insertUser("HEAD");

    expect(await visibleBranches(manager.id, chl.id)).toEqual([chl.id, yns.id].toSorted());
    expect(await visibleBranches(principal.id, yns.id)).toEqual([yns.id]);
    expect(await visibleBranches(finance.id, third.id)).toEqual([third.id]);

    const all = await db.select({ id: branches.id }).from(branches);
    expect(await visibleBranches(head.id, third.id)).toEqual(all.map((row) => row.id).toSorted());
    expect(all.length).toBeGreaterThan(3);
  });

  it("shows a branch taken away no more, in the same statement as the rows", async () => {
    const chl = await insertBranch();
    const yns = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [chl.id, yns.id] });
    const actor = await authorize(manager.id, "data.view", { branchId: chl.id });
    await db.execute(
      sql`delete from user_branches where user_id = ${manager.id} and branch_id = ${yns.id}`,
    );
    const rows = await db
      .select({ id: branches.id })
      .from(branches)
      .where(branchFilter(actor, branches.id));
    expect(rows.map((row) => row.id)).toEqual([chl.id]);
  });
});
