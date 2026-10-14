import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { generatePassword } from "@/domain/passwords";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { userOfCookieValue } from "@/server/auth/session";
import { signIn } from "@/server/auth/sign-in";
import { db } from "@/server/db/client";
import { auditLog, notifications, sessions, userBranches, users } from "@/server/db/schema";

import { insertBranch } from "../../../../tests/helpers/branches";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { runTogether } from "../../../../tests/helpers/together";
import { type InsertedUser, insertUser, signInAs } from "../../../../tests/helpers/users";
import { type SavedUser, createUser, renewUserPassword, setUserActive, updateUser } from "./users";

// build-plan 1.3, Done when: "the last Head cannot be deactivated; a second active Principal is
// refused unless it is a replacement; deactivating the only Finance user of a branch creates the
// notification; only the Head can renew a password, and a user has no way to change their own;
// after a renewal the old password is refused, the new one signs in, and a session opened before
// the renewal is refused; the audit row of a renewal holds no password; a generated password
// signs in". 03 Roles table and rules 2 to 5; 02 A3, A5, A8; 04 Users and rules 2 and 9;
// 10 Notifications; plan of 1.3 and its review corrections 1 to 3. Every fixture is asserted
// (D38).

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

const fieldError = (field: string, kind: string) => ({
  ok: false,
  error: { code: "invalid_input", fields: { [field]: `errors.field.${kind}` } },
});

let made = 0;

/** An invented username no other case uses. */
function username(): string {
  made += 1;
  return `test_user_${made}_${newClientKey().slice(0, 6)}`;
}

function generated(): string {
  return generatePassword((count) => crypto.getRandomValues(new Uint8Array(count)));
}

async function created(
  headId: string,
  fields: { role: SavedUser["role"]; branchIds: string[]; replacePrincipal?: boolean },
  password = "invented-password",
): Promise<SavedUser & { password: string }> {
  const user = expectOk(
    await runAction(createUser, headId, {
      clientKey: newClientKey(),
      fullName: "Invented  Person ",
      username: username(),
      phone: "+998 90 000 11 22",
      locale: "ru",
      password,
      ...fields,
    }),
  );
  return { ...user, password };
}

async function auditRowsOf(entityId: string) {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, "users"), eq(auditLog.entityId, entityId)))
    .orderBy(auditLog.createdAt, auditLog.id);
}

async function isActive(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId));
  return row!.isActive;
}

async function sessionCount(userId: string): Promise<number> {
  return (await db.select().from(sessions).where(eq(sessions.userId, userId))).length;
}

async function vacancyNotices(userId: string, branchName: string) {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "BRANCH_ROLE_VACANT"),
        sql`${notifications.params}->>'branch' = ${branchName}`,
      ),
    );
}

describe("createUser (04 Users; 03 Roles table; A3, A8)", () => {
  it("creates a Manager with two branches, audited without a password; a generated password signs in", async () => {
    const head = await insertUser("HEAD");
    const [first, second] = [await insertBranch(), await insertBranch()];
    const user = await created(
      head.id,
      { role: "MANAGER", branchIds: [second.id, first.id] },
      generated(),
    );
    expect(user).toMatchObject({
      fullName: "Invented Person",
      phone: "+998 90 000 11 22",
      role: "MANAGER",
      locale: "ru",
      isActive: true,
    });
    expect(user.branchIds).toEqual([first.id, second.id].sort());

    const rows = await auditRowsOf(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "user.create", actorId: head.id, before: null });
    expect(rows[0]!.after).toEqual({
      fullName: "Invented Person",
      username: user.username,
      phone: "+998 90 000 11 22",
      role: "MANAGER",
      locale: "ru",
      isActive: true,
      branches: [first.code, second.code].sort().join(", "),
    });
    expect(JSON.stringify(rows[0])).not.toContain(user.password);

    expect(await signIn({ username: user.username, password: user.password })).toMatchObject({
      ok: true,
    });
  });

  it("refuses a branch list that does not fit the role, an inactive or unknown branch", async () => {
    const head = await insertUser("HEAD");
    const [first, second] = [await insertBranch(), await insertBranch()];
    const closed = await insertBranch({ isActive: false });
    const base = {
      fullName: "Invented Person",
      phone: "+998 90 000 11 22",
      locale: "uz",
      password: "invented-password",
    };
    const cases = [
      { role: "HEAD", branchIds: [first.id], kind: "branchCount" },
      { role: "PRINCIPAL", branchIds: [], kind: "branchCount" },
      { role: "PRINCIPAL", branchIds: [first.id, second.id], kind: "branchCount" },
      { role: "MANAGER", branchIds: [], kind: "branchCount" },
      { role: "FINANCE", branchIds: [first.id, first.id], kind: "branchCount" },
      { role: "FINANCE", branchIds: [first.id, closed.id], kind: "branchInactive" },
      { role: "MANAGER", branchIds: [newClientKey()], kind: "notAllowed" },
    ];
    for (const { kind, ...fields } of cases) {
      const name = username();
      expect(
        await runAction(createUser, head.id, {
          clientKey: newClientKey(),
          username: name,
          ...base,
          ...fields,
        }),
      ).toMatchObject(fieldError("branchIds", kind));
      expect(await db.select().from(users).where(eq(users.username, name))).toEqual([]);
    }
  });

  it("refuses a username another user holds, in any case, and one of the wrong form", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const holder = await insertUser("FINANCE", { branches: [branch.id], isActive: false });
    for (const [name, kind] of [
      [holder.username.toUpperCase(), "taken"],
      ["ab", "wrongFormat"],
      ["with space", "wrongFormat"],
    ] as const) {
      expect(
        await runAction(createUser, head.id, {
          clientKey: newClientKey(),
          fullName: "Invented Person",
          username: name,
          phone: "+998 90 000 11 22",
          role: "MANAGER",
          locale: "uz",
          branchIds: [branch.id],
          password: "invented-password",
        }),
      ).toMatchObject(fieldError("username", kind));
    }
  });

  it("the same client key twice returns the first user; another Head with it gets not_found", async () => {
    const [head, other] = [await insertUser("HEAD"), await insertUser("HEAD")];
    const branch = await insertBranch();
    const input = {
      clientKey: newClientKey(),
      fullName: "Invented Person",
      username: username(),
      phone: "+998 90 000 11 22",
      role: "MANAGER",
      locale: "uz",
      branchIds: [branch.id],
      password: "invented-password",
    };
    const first = expectOk(await runAction(createUser, head.id, input));
    expect(expectOk(await runAction(createUser, head.id, input))).toEqual(first);
    expect(await runAction(createUser, other.id, input)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await db.select().from(users).where(eq(users.username, input.username))).toHaveLength(1);
    expect(await auditRowsOf(first.id)).toHaveLength(1);
  });
});

describe("a second active Principal is refused unless it is a replacement (03 rules 2, 3; A5)", () => {
  it("create: refused without the choice; with it the old Principal is deactivated and signed out", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const old = await insertUser("PRINCIPAL", { branches: [branch.id] });
    await signInAs(old);
    expect(await sessionCount(old.id)).toBe(1);

    const name = username();
    expect(
      await runAction(createUser, head.id, {
        clientKey: newClientKey(),
        fullName: "Acting Principal",
        username: name,
        phone: "+998 90 000 11 22",
        role: "PRINCIPAL",
        locale: "uz",
        branchIds: [branch.id],
        password: "invented-password",
      }),
    ).toMatchObject(fieldError("branchIds", "principalTaken"));
    expect(await db.select().from(users).where(eq(users.username, name))).toEqual([]);
    expect(await isActive(old.id)).toBe(true);

    const acting = await created(head.id, {
      role: "PRINCIPAL",
      branchIds: [branch.id],
      replacePrincipal: true,
    });
    expect(await isActive(old.id)).toBe(false);
    expect(await isActive(acting.id)).toBe(true);
    expect(await sessionCount(old.id)).toBe(0);
    expect((await auditRowsOf(old.id)).map((row) => [row.action, row.after])).toEqual([
      ["user.deactivate", { isActive: false }],
    ]);
    expect((await auditRowsOf(acting.id)).map((row) => row.action)).toEqual(["user.create"]);
  });

  it("activate: the regular Principal comes back only as a replacement of the acting one", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const regular = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const acting = await created(head.id, {
      role: "PRINCIPAL",
      branchIds: [branch.id],
      replacePrincipal: true,
    });
    expect(await runAction(setUserActive, head.id, { id: regular.id, active: true })).toMatchObject(
      fieldError("branchIds", "principalTaken"),
    );
    expect(await isActive(regular.id)).toBe(false);
    expectOk(
      await runAction(setUserActive, head.id, {
        id: regular.id,
        active: true,
        replacePrincipal: true,
      }),
    );
    expect(await isActive(regular.id)).toBe(true);
    expect(await isActive(acting.id)).toBe(false);
  });

  it("update: a Principal moved to another branch has exactly one row, on the new branch", async () => {
    const head = await insertUser("HEAD");
    const [from, to, taken] = [await insertBranch(), await insertBranch(), await insertBranch()];
    const principal = await insertUser("PRINCIPAL", { branches: [from.id] });
    const holder = await insertUser("PRINCIPAL", { branches: [taken.id] });

    expectOk(await runAction(updateUser, head.id, { id: principal.id, branchIds: [to.id] }));
    const rows = await db
      .select({ branchId: userBranches.branchId })
      .from(userBranches)
      .where(eq(userBranches.userId, principal.id));
    expect(rows).toEqual([{ branchId: to.id }]);

    expect(
      await runAction(updateUser, head.id, { id: principal.id, branchIds: [taken.id] }),
    ).toMatchObject(fieldError("branchIds", "principalTaken"));
    expectOk(
      await runAction(updateUser, head.id, {
        id: principal.id,
        branchIds: [taken.id],
        replacePrincipal: true,
      }),
    );
    expect(await isActive(holder.id)).toBe(false);
    expect(
      await db
        .select({ branchId: userBranches.branchId })
        .from(userBranches)
        .where(eq(userBranches.userId, principal.id)),
    ).toEqual([{ branchId: taken.id }]);
  });
});

describe("updateUser (04 Users and rule 9; review of the plan, corrections 1 and 2)", () => {
  it("writes only the changed fields; a username change rewrites display_username; nothing changed, no row", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const user = await insertUser("MANAGER", { branches: [branch.id] });
    const name = username();
    const result = expectOk(
      await runAction(updateUser, head.id, {
        id: user.id,
        fullName: user.fullName,
        username: ` ${name.toUpperCase()} `,
        locale: "en",
        // The role is never edited (Look first 1): an extra key is dropped.
        role: "HEAD",
      }),
    );
    expect(result.changed).toEqual(["username", "locale"]);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({
      username: name,
      displayUsername: name,
      locale: "en",
      role: "MANAGER",
    });
    const audits = await auditRowsOf(user.id);
    expect(audits.map((audit) => [audit.action, audit.before, audit.after])).toEqual([
      ["user.update", { username: user.username, locale: "uz" }, { username: name, locale: "en" }],
    ]);

    expect(
      expectOk(await runAction(updateUser, head.id, { id: user.id, locale: "en" })).changed,
    ).toEqual([]);
    expect(await auditRowsOf(user.id)).toHaveLength(1);
  });

  it("refuses a username another user holds; editing the deactivated holder frees it (D41)", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const holder = await insertUser("MANAGER", { branches: [branch.id], isActive: false });
    const user = await insertUser("MANAGER", { branches: [branch.id] });
    expect(
      await runAction(updateUser, head.id, { id: user.id, username: holder.username }),
    ).toMatchObject(fieldError("username", "taken"));
    expectOk(await runAction(updateUser, head.id, { id: holder.id, username: username() }));
    expectOk(await runAction(updateUser, head.id, { id: user.id, username: holder.username }));
  });

  it("removes a branch row, keeps a held inactive branch, refuses adding an inactive one", async () => {
    const head = await insertUser("HEAD");
    const [kept, dropped] = [await insertBranch(), await insertBranch()];
    const closed = await insertBranch({ isActive: false });
    const otherClosed = await insertBranch({ isActive: false });
    const user = await insertUser("FINANCE", { branches: [kept.id, dropped.id, closed.id] });

    const result = expectOk(
      await runAction(updateUser, head.id, { id: user.id, branchIds: [kept.id, closed.id] }),
    );
    expect(result.user.branchIds).toEqual([kept.id, closed.id].sort());
    expect(result.before).toEqual({
      branches: [kept.code, dropped.code, closed.code].sort().join(", "),
    });
    expect(result.after).toEqual({ branches: [kept.code, closed.code].sort().join(", ") });

    expect(
      await runAction(updateUser, head.id, {
        id: user.id,
        branchIds: [kept.id, closed.id, otherClosed.id],
      }),
    ).toMatchObject(fieldError("branchIds", "branchInactive"));
    expect(await runAction(updateUser, head.id, { id: user.id, branchIds: [] })).toMatchObject(
      fieldError("branchIds", "branchCount"),
    );
  });
});

describe("setUserActive (04 rule 2; A8; 03 rule 4)", () => {
  it("deactivating signs the user out everywhere; activating lets them sign in again", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const user = await insertUser("MANAGER", { branches: [branch.id] });
    const cookie = await signInAs(user);
    await signInAs(user);
    expect(await sessionCount(user.id)).toBe(2);

    expectOk(await runAction(setUserActive, head.id, { id: user.id, active: false }));
    expect(await sessionCount(user.id)).toBe(0);
    expect(await userOfCookieValue(cookie.value)).toBeNull();
    expect(await signIn({ username: user.username, password: user.password })).toMatchObject({
      ok: false,
    });
    expect(await runAction(setUserActive, head.id, { id: user.id, active: false })).toMatchObject({
      ok: false,
      error: { code: "wrong_status" },
    });

    expectOk(await runAction(setUserActive, head.id, { id: user.id, active: true }));
    expect(await signIn({ username: user.username, password: user.password })).toMatchObject({
      ok: true,
    });
    expect((await auditRowsOf(user.id)).map((row) => row.action)).toEqual([
      "user.deactivate",
      "user.activate",
    ]);
  });

  it("the Head cannot deactivate their own account (decision 9)", async () => {
    const head = await insertUser("HEAD");
    expect(await runAction(setUserActive, head.id, { id: head.id, active: false })).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(await isActive(head.id)).toBe(true);
  });

  it("Done when: two Heads deactivating each other at once leave one active Head", async () => {
    const [first, second] = [await insertUser("HEAD"), await insertUser("HEAD")];
    // Only these two are active Heads, so one going leaves the other as the last.
    await db.execute(sql`
      update users set is_active = false
       where role = 'HEAD' and is_active and id not in (${first.id}, ${second.id})`);
    const outcomes = await runTogether(
      [
        [first, second],
        [second, first],
      ].map(([actor, target]) => async (meet) => {
        await meet();
        return runAction(setUserActive, actor!.id, { id: target!.id, active: false });
      }),
    );
    const answers = outcomes.map(
      (outcome) => (outcome as PromiseFulfilledResult<ActionResult<unknown>>).value,
    );
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    // The second runs its lock step after the first's commit (the shared lock). When both passed
    // authorize() before that, the action's last-Head check refuses it (wrong_status); when the
    // first had already committed, authorize() refuses the now inactive actor (forbidden).
    const refused = answers.find((answer) => !answer.ok) as { ok: false; error: { code: string } };
    expect(["wrong_status", "forbidden"]).toContain(refused.error.code);
    expect([await isActive(first.id), await isActive(second.id)].sort()).toEqual([false, true]);
    const [{ count }] = (
      await db.execute<{ count: number }>(
        sql`select count(*)::int as count from users where role = 'HEAD' and is_active`,
      )
    ).rows as [{ count: number }];
    expect(count).toBe(1);
  });
});

describe("renewUserPassword (A8; 13 Login; Look first 2)", () => {
  it("Done when: the old password is refused, the new one signs in, an older session is refused, the row holds no password", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const user = await insertUser("FINANCE", { branches: [branch.id] });
    const before = await signInAs(user);
    expect(await userOfCookieValue(before.value)).toMatchObject({ id: user.id });

    const password = generated();
    expect(
      expectOk(await runAction(renewUserPassword, head.id, { id: user.id, password })),
    ).toEqual({
      id: user.id,
    });
    expect(await userOfCookieValue(before.value)).toBeNull();
    expect(await sessionCount(user.id)).toBe(0);
    expect(await signIn({ username: user.username, password: user.password })).toMatchObject({
      ok: false,
    });
    expect(await signIn({ username: user.username, password })).toMatchObject({ ok: true });

    const rows = await auditRowsOf(user.id);
    expect(rows.map((row) => [row.action, row.actorId, row.before, row.after])).toEqual([
      ["user.renew_password", head.id, {}, {}],
    ]);
    expect(JSON.stringify(rows)).not.toContain(password);
  });

  it("a user has no way to change their own password: the Head is refused, every other role too", async () => {
    const branch = await insertBranch();
    for (const role of ["HEAD", "MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      const user = await insertUser(role, {
        branches:
          role === "HEAD" ? [] : role === "PRINCIPAL" ? [(await insertBranch()).id] : [branch.id],
      });
      expect(
        await runAction(renewUserPassword, user.id, { id: user.id, password: "own-new-one" }),
      ).toMatchObject({ ok: false, error: { code: "forbidden" } });
      expect(await signIn({ username: user.username, password: user.password })).toMatchObject({
        ok: true,
      });
    }
  });
});

describe("Branch has no active user for a role (10 Notifications; 03 rule 5; decision 7)", () => {
  async function staffedBranch() {
    const branch = await insertBranch();
    const other = await insertBranch();
    // D40: an inactive Finance user on the same branch and an active one on another branch.
    await insertUser("FINANCE", { branches: [branch.id], isActive: false });
    await insertUser("FINANCE", { branches: [other.id] });
    return branch;
  }

  it("Done when: deactivating the only Finance user tells every active Head, the actor included", async () => {
    const [head, otherHead] = [await insertUser("HEAD"), await insertUser("HEAD")];
    const branch = await staffedBranch();
    const finance = await insertUser("FINANCE", { branches: [branch.id] });

    expectOk(await runAction(setUserActive, head.id, { id: finance.id, active: false }));
    for (const told of [head, otherHead]) {
      const notices = await vacancyNotices(told.id, branch.name);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        params: { branch: branch.name, role: "FINANCE" },
        link: "/users",
      });
    }
  });

  it("deactivating one of two Finance users tells nobody", async () => {
    const head = await insertUser("HEAD");
    const branch = await staffedBranch();
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    await insertUser("FINANCE", { branches: [branch.id] });
    expectOk(await runAction(setUserActive, head.id, { id: finance.id, active: false }));
    expect(await vacancyNotices(head.id, branch.name)).toEqual([]);
  });

  it("removing the branch from its only Manager tells the Head; an inactive branch tells nobody", async () => {
    const head = await insertUser("HEAD");
    const [branch, keep] = [await insertBranch(), await insertBranch()];
    const closed = await insertBranch({ isActive: false });
    const manager = await insertUser("MANAGER", { branches: [branch.id, keep.id, closed.id] });
    expectOk(await runAction(updateUser, head.id, { id: manager.id, branchIds: [keep.id] }));
    expect(await vacancyNotices(head.id, branch.name)).toHaveLength(1);
    expect(await vacancyNotices(head.id, closed.name)).toEqual([]);
    expect(await vacancyNotices(head.id, keep.name)).toEqual([]);
  });

  it("two Heads deactivating the two Finance users of one branch at once: one notice each", async () => {
    const [first, second] = [await insertUser("HEAD"), await insertUser("HEAD")];
    const branch = await staffedBranch();
    const a = await insertUser("FINANCE", { branches: [branch.id] });
    const b = await insertUser("FINANCE", { branches: [branch.id] });
    const outcomes = await runTogether(
      [
        [first, a],
        [second, b],
      ].map(([actor, target]) => async (meet) => {
        await meet();
        return runAction(setUserActive, actor!.id, { id: target!.id, active: false });
      }),
    );
    for (const outcome of outcomes) {
      expect((outcome as PromiseFulfilledResult<ActionResult<unknown>>).value).toMatchObject({
        ok: true,
      });
    }
    expect(await vacancyNotices(first.id, branch.name)).toHaveLength(1);
    expect(await vacancyNotices(second.id, branch.name)).toHaveLength(1);
  });
});

// --- The permission matrix (03, Permission matrix: "Manage catalogs, users, branches, settings").

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

async function someManager(branchId: string): Promise<InsertedUser> {
  return insertUser("MANAGER", { branches: [branchId] });
}

describePermissionMatrix("createUser", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    asMatrixAnswer(
      await runAction(createUser, user.id, {
        clientKey: newClientKey(),
        fullName: "Matrix Person",
        username: username(),
        phone: "+998 90 000 11 22",
        role: "MANAGER",
        locale: "uz",
        branchIds: [branchId],
        password: "invented-password",
      }),
    );
  },
});

describePermissionMatrix("updateUser", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const target = await someManager(branchId);
    asMatrixAnswer(await runAction(updateUser, user.id, { id: target.id, locale: "en" }));
  },
});

describePermissionMatrix("setUserActive", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const target = await someManager(branchId);
    asMatrixAnswer(await runAction(setUserActive, user.id, { id: target.id, active: false }));
  },
});

describePermissionMatrix("renewUserPassword", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const target = await someManager(branchId);
    asMatrixAnswer(
      await runAction(renewUserPassword, user.id, { id: target.id, password: "matrix-new-one" }),
    );
  },
});
