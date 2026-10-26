import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { MANAGER_RIGHTS, PERMISSIONS, type Permission } from "@/domain/permissions";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError, authorize } from "@/server/authorize";
import { db } from "@/server/db/client";
import { auditLog, managerRights, notifications } from "@/server/db/schema";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { getManagerRights } from "../queries/users";
import { switchManagerRight } from "./manager-rights";

// build-plan 1.4, Done when: "A database test for each of the nine codes (ten since 1.12b): off means authorize()
// refuses that action for that Manager in every branch and still allows the Head." 03-roles-and-
// permissions.md, "Manager rights the Head can switch"; A13; 10 Notifications ("A Manager's right
// is switched on or off → That Manager"); 14-data-model.md, manager_rights ("no row means
// enabled"); plan of 1.4 and its review. Every fixture is asserted (D38).

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

/**
 * Every permission and the rights that guard it, from the matrix: the branch ones, and since 1.12b
 * the global catalog.add (ADD_PRODUCTS; plan of 1.12b, decided item 1, Look first), which since
 * 1.12c also needs CREATE_REQUESTS (`alsoRight`; D66).
 */
const GUARDED = (Object.keys(PERMISSIONS) as Permission[]).flatMap((permission) => {
  const rule = PERMISSIONS[permission];
  if (!("right" in rule) || !rule.right) return [];
  const rights = [rule.right, ...("alsoRight" in rule && rule.alsoRight ? [rule.alsoRight] : [])];
  return [{ permission, rights, global: rule.scope === "global" }];
});

/** authorize()'s answer, as the matrix names it; a global permission names no branch. */
async function answer(
  userId: string,
  permission: Permission,
  branchId: string,
  ownerId: string,
): Promise<"allow" | "not_found" | "forbidden"> {
  const global = PERMISSIONS[permission].scope === "global";
  try {
    if (global) await authorize(userId, permission);
    else await authorize(userId, permission, { branchId, ownerId });
    return "allow";
  } catch (error) {
    if (error instanceof AuthorizationError) return error.kind;
    throw error;
  }
}

async function rightRow(userId: string, right: (typeof MANAGER_RIGHTS)[number]) {
  const [row] = await db
    .select()
    .from(managerRights)
    .where(and(eq(managerRights.userId, userId), eq(managerRights.right, right)));
  return row ?? null;
}

async function auditRowsOf(userId: string) {
  return db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, "users"),
        eq(auditLog.entityId, userId),
        eq(auditLog.action, "user.switch_right"),
      ),
    );
}

async function noticesOf(userId: string) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, "MANAGER_RIGHT_SWITCHED")));
}

describe("each of the ten rights switched off (build-plan 1.4 Done when; 03; A13)", () => {
  it("every code guards at least one permission of the matrix", () => {
    for (const right of MANAGER_RIGHTS) {
      expect(GUARDED.some((entry) => entry.rights.includes(right))).toBe(true);
    }
  });

  it.each(MANAGER_RIGHTS)(
    "%s off: refused for that Manager in each branch, the other rights still allowed, the Head allowed",
    async (right) => {
      const first = await insertBranch();
      const second = await insertBranch();
      const head = await insertUser("HEAD");
      const manager = await insertUser("MANAGER", { branches: [first.id, second.id] });

      expectOk(
        await runAction(switchManagerRight, head.id, { id: manager.id, right, enabled: false }),
      );

      for (const branch of [first, second]) {
        for (const entry of GUARDED) {
          // A13: "in all of their branches"; D40: the other rights beside it stay allowed.
          const expected = entry.rights.includes(right) ? "forbidden" : "allow";
          expect(await answer(manager.id, entry.permission, branch.id, manager.id)).toBe(expected);
          // "The Head can do everything a Manager can, in any branch" (03 Roles table).
          expect(await answer(head.id, entry.permission, branch.id, manager.id)).toBe("allow");
        }
      }

      // Switched on again, the Manager is allowed at once (decisions 0.7 item 7).
      expectOk(
        await runAction(switchManagerRight, head.id, { id: manager.id, right, enabled: true }),
      );
      for (const branch of [first, second]) {
        for (const entry of GUARDED.filter((each) => each.rights.includes(right))) {
          expect(await answer(manager.id, entry.permission, branch.id, manager.id)).toBe("allow");
        }
      }
    },
  );
});

describe("switchManagerRight (03, Manager rights the Head can switch; plan of 1.4)", () => {
  it("all ten are on by default: no row means enabled (03; 14 manager_rights; D40)", async () => {
    const branch = await insertBranch();
    const head = await insertUser("HEAD");
    const fresh = await insertUser("MANAGER", { branches: [branch.id] });
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    await setManagerRight(colleague.id, "ISSUE_STOCK", false);

    expect(await getManagerRights(head.id, fresh.id)).toEqual(
      MANAGER_RIGHTS.map((right) => ({ right, enabled: true })),
    );
    expect(await rightRow(fresh.id, "ISSUE_STOCK")).toBeNull();
    for (const entry of GUARDED) {
      expect(await answer(fresh.id, entry.permission, branch.id, fresh.id)).toBe("allow");
    }
    // The colleague beside them, with the right off, is refused.
    expect(await answer(colleague.id, "stock.issue", branch.id, colleague.id)).toBe("forbidden");
    expect(
      (await getManagerRights(head.id, colleague.id))?.find((each) => each.right === "ISSUE_STOCK"),
    ).toEqual({ right: "ISSUE_STOCK", enabled: false });
  });

  it("writes one audit row with the Head and the change, and tells the Manager only (03; 10)", async () => {
    const head = await insertUser("HEAD");
    const otherHead = await insertUser("HEAD");
    const manager = await insertUser("MANAGER", { branches: [(await insertBranch()).id] });

    expect(
      expectOk(
        await runAction(switchManagerRight, head.id, {
          id: manager.id,
          right: "RECORD_PURCHASES",
          enabled: false,
        }),
      ),
    ).toEqual({ id: manager.id, right: "RECORD_PURCHASES", enabled: false });

    expect(await rightRow(manager.id, "RECORD_PURCHASES")).toMatchObject({ enabled: false });
    const rows = await auditRowsOf(manager.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: head.id,
      before: { RECORD_PURCHASES: true },
      after: { RECORD_PURCHASES: false },
    });
    const notices = await noticesOf(manager.id);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      params: { right: "RECORD_PURCHASES", state: "off" },
      link: "/",
    });
    expect(await noticesOf(head.id)).toHaveLength(0);
    expect(await noticesOf(otherHead.id)).toHaveLength(0);

    expectOk(
      await runAction(switchManagerRight, head.id, {
        id: manager.id,
        right: "RECORD_PURCHASES",
        enabled: true,
      }),
    );
    expect(await rightRow(manager.id, "RECORD_PURCHASES")).toMatchObject({ enabled: true });
    expect(await auditRowsOf(manager.id)).toHaveLength(2);
    const after = await noticesOf(manager.id);
    expect(after.map((each) => each.params)).toContainEqual({
      right: "RECORD_PURCHASES",
      state: "on",
    });
  });

  it("the same switch twice is wrong_status and writes nothing (decision 4)", async () => {
    const head = await insertUser("HEAD");
    const manager = await insertUser("MANAGER", { branches: [(await insertBranch()).id] });

    // On by default: switching on is a stale screen.
    expect(
      await runAction(switchManagerRight, head.id, {
        id: manager.id,
        right: "SET_MINIMUMS",
        enabled: true,
      }),
    ).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    expect(await rightRow(manager.id, "SET_MINIMUMS")).toBeNull();

    const input = { id: manager.id, right: "SET_MINIMUMS", enabled: false } as const;
    expectOk(await runAction(switchManagerRight, head.id, input));
    expect(await runAction(switchManagerRight, head.id, input)).toMatchObject({
      ok: false,
      error: { code: "wrong_status" },
    });
    expect(await auditRowsOf(manager.id)).toHaveLength(1);
    expect(await noticesOf(manager.id)).toHaveLength(1);
  });

  it("an inactive Manager's rights are not switched (Look first 2)", async () => {
    const head = await insertUser("HEAD");
    const manager = await insertUser("MANAGER", {
      branches: [(await insertBranch()).id],
      isActive: false,
    });

    expect(
      await runAction(switchManagerRight, head.id, {
        id: manager.id,
        right: "CLOSE_ALONE",
        enabled: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    expect(await rightRow(manager.id, "CLOSE_ALONE")).toBeNull();
    expect(await auditRowsOf(manager.id)).toHaveLength(0);
  });

  it.each(["HEAD", "PRINCIPAL", "FINANCE"] as const)(
    "a %s has no rights to switch: refused, nothing written (Look first 1)",
    async (role) => {
      const head = await insertUser("HEAD");
      const target = await insertUser(role, {
        branches: role === "HEAD" ? [] : [(await insertBranch()).id],
      });

      expect(
        await runAction(switchManagerRight, head.id, {
          id: target.id,
          right: "CREATE_REQUESTS",
          enabled: false,
        }),
      ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
      expect(await rightRow(target.id, "CREATE_REQUESTS")).toBeNull();
      expect(await auditRowsOf(target.id)).toHaveLength(0);
      expect(await getManagerRights(head.id, target.id)).toBeNull();
    },
  );

  it("an unknown user is not_found", async () => {
    const head = await insertUser("HEAD");
    expect(
      await runAction(switchManagerRight, head.id, {
        id: crypto.randomUUID(),
        right: "CREATE_REQUESTS",
        enabled: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await getManagerRights(head.id, crypto.randomUUID())).toBeNull();
    expect(await getManagerRights(head.id, "not-an-id")).toBeNull();
  });
});

// --- The permission matrix (03, Permission matrix: "Switch a Manager's rights on or off").

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

describePermissionMatrix("switchManagerRight", {
  permission: "manager_rights.switch",
  async run({ user, branchId }) {
    const target = await insertUser("MANAGER", { branches: [branchId] });
    asMatrixAnswer(
      await runAction(switchManagerRight, user.id, {
        id: target.id,
        right: "TRANSFER_STOCK",
        enabled: false,
      }),
    );
  },
});

describePermissionMatrix("getManagerRights", {
  permission: "manager_rights.switch",
  async run({ user, branchId }) {
    const target = await insertUser("MANAGER", { branches: [branchId] });
    await getManagerRights(user.id, target.id);
  },
});
