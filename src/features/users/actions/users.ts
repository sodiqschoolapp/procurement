import { hashPassword } from "better-auth/crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import { ROLES, type Role } from "@/domain/permissions";
import {
  type Place,
  type UserField,
  type UserFields,
  branchCountFits,
  changedUserFields,
  fullName,
  isFullName,
  isPhone,
  phone,
  vacatedPlaces,
} from "@/domain/users";
import { LOCALES } from "@/i18n/locale";
import { GLOBAL_TARGET, ActionError, defineAction } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import { audit } from "@/server/audit";
import { USERNAME_PATTERN, insertPasswordUser } from "@/server/auth/password-user.mjs";
import type { Executor } from "@/server/authorize";
import { bound } from "@/server/bound-sql";
import { now } from "@/server/clock";
import { accounts, auditLog, branches, sessions, userBranches, users } from "@/server/db/schema";
import { notify } from "@/server/notify";

import { staffedPlaces } from "../vacancies";

// The Head's users (build-plan 1.3; 04-catalogs.md, Catalogs table: Users; 03-roles-and-
// permissions.md, Roles table and rules 2 to 5; 02-assumptions.md A3, A5, A8; 13-technology.md,
// Login). "Manage catalogs, users, branches, settings": catalog.manage, Head only, global (03,
// Permission matrix). Nothing deletes a user: they are deactivated, and can be activated again
// (04 rule 2). Every change writes its audit row in the same transaction (04 rule 9), entity
// `users`, and never a password (developer-rules.md rule 13).
//
// Locks, in this order, in every action (review of the plan of 1.3, Must fix 1 and Should fix 1):
// the advisory lock `users_active_head`, which the trigger `users_keep_one_active_head` takes too
// (migration 0009), then the advisory lock `users` (usernames), then the rows of every branch the
// change touches, in id order, then the user's row. So all user writes run one after the other,
// and the vacancy counts and the last-Head count see every earlier commit.

const TAKEN: FieldMessageKey = "errors.field.taken";

const HEAD_LOCK = sql`select pg_advisory_xact_lock(hashtextextended('users_active_head', 0))`;
const USERS_LOCK = sql`select pg_advisory_xact_lock(hashtextextended('users', 1))`;

async function lockUsers(tx: Executor): Promise<void> {
  await tx.execute(HEAD_LOCK);
  await tx.execute(USERS_LOCK);
}

const nameInput = z.string().transform(fullName).refine(isFullName);
const usernameInput = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .refine((value) => USERNAME_PATTERN.test(value));
const phoneInput = z.string().transform(phone).refine(isPhone);
const localeInput = z.enum(LOCALES);
const branchIdsInput = z.array(z.uuid()).max(100);
// A8: no password rules; at most 4096 characters, as at sign-in (decisions 0.6 item 12).
const passwordInput = z.string().min(1).max(4096);

type BranchRow = { id: string; code: string; name: string; isActive: boolean };

/** Locks the rows of the branches, in id order, and returns those that exist. */
async function lockBranchRows(tx: Executor, ids: readonly string[]): Promise<BranchRow[]> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return [];
  return tx
    .select({
      id: branches.id,
      code: branches.code,
      name: branches.name,
      isActive: branches.isActive,
    })
    .from(branches)
    .where(inArray(branches.id, unique))
    .orderBy(asc(branches.id))
    .for("update");
}

/** The branch codes as one audit value: sorted, joined by ", " (plan of 1.3, decision 12). */
function codesOf(rows: readonly BranchRow[], ids: readonly string[]): string {
  const byId = new Map(rows.map((row) => [row.id, row.code]));
  return ids
    .map((id) => byId.get(id) ?? id)
    .sort()
    .join(", ");
}

/**
 * Refuses a branch list that does not fit the role, names a branch that does not exist, or adds
 * an inactive branch (plan of 1.3, decision 14: a branch already held stays when inactive).
 */
function refuseBranches(
  role: Role,
  wanted: readonly string[],
  held: readonly string[],
  rows: readonly BranchRow[],
): void {
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (new Set(wanted).size !== wanted.length || !branchCountFits(role, wanted.length)) {
    throw new ActionError("invalid_input", { branchIds: "errors.field.branchCount" });
  }
  for (const id of wanted) {
    const row = byId.get(id);
    if (!row) throw new ActionError("invalid_input", { branchIds: "errors.field.notAllowed" });
    if (!row.isActive && !held.includes(id)) {
      throw new ActionError("invalid_input", { branchIds: "errors.field.branchInactive" });
    }
  }
}

/** Refuses a username another user holds, active or not, in any case (decisions 0.6 item 11). */
async function refuseTakenUsername(
  tx: Executor,
  username: string,
  ownId: string | null,
): Promise<void> {
  const [row] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), ownId === null ? undefined : ne(users.id, ownId)));
  if (row) throw new ActionError("invalid_input", { username: TAKEN });
}

/** The active Principal of a branch other than `ownId`, or null. */
async function activePrincipalOf(
  tx: Executor,
  branchId: string,
  ownId: string | null,
): Promise<{ id: string; fullName: string } | null> {
  const [row] = await tx
    .select({ id: users.id, fullName: users.fullName })
    .from(userBranches)
    .innerJoin(users, eq(users.id, userBranches.userId))
    .where(
      and(
        eq(userBranches.branchId, branchId),
        eq(userBranches.userRole, "PRINCIPAL"),
        eq(userBranches.userIsActive, true),
        ownId === null ? undefined : ne(userBranches.userId, ownId),
      ),
    );
  return row ?? null;
}

/** Signs a user out on every device (A8; progress 0.6, "For 1.3"): their session rows go. */
async function endSessions(tx: Executor, userId: string): Promise<void> {
  await tx.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * The replacement of a branch's Principal (03 rule 3; A5; plan of 1.3, Look first 3): with the
 * Head's choice, the active Principal is deactivated and signed out first, before the new one is
 * added or activated in the same transaction (decisions 0.7 item 1: the partial unique index
 * cannot be deferred). Without it, a second active Principal is refused.
 */
async function makeRoomForPrincipal(
  context: { tx: Executor; userId: string },
  branchId: string,
  ownId: string | null,
  replace: boolean,
): Promise<void> {
  const { tx } = context;
  const current = await activePrincipalOf(tx, branchId, ownId);
  if (!current) return;
  if (!replace)
    throw new ActionError("invalid_input", { branchIds: "errors.field.principalTaken" });
  await tx.update(users).set({ isActive: false, updatedAt: now() }).where(eq(users.id, current.id));
  await endSessions(tx, current.id);
  // The replaced Principal's own row, written here so the action's result stays the record it
  // changed (a repeated create returns the same result as the first).
  await audit(context, {
    action: "user.deactivate",
    entity: "users",
    entityId: current.id,
    before: { isActive: true },
    after: { isActive: false },
    at: now(),
  });
}

/** The ids of every active Head, the acting one included (plan of 1.3, decision 7). */
async function activeHeads(tx: Executor): Promise<string[]> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "HEAD"), eq(users.isActive, true)));
  return rows.map((row) => row.id);
}

/**
 * Tells every active Head of each place the change left empty (10, Notifications: "Branch has no
 * active user for a role → Head"). Sent with `userId: null`, so the acting Head is told too: a
 * deliberate exception to decisions 0.11 item 5, which leaves out the actor for news of one's own
 * act; this notice reminds of a gap that stays until it is filled, and the school usually has one
 * Head (plan of 1.3, decision 7). `branchId` keeps notify()'s branch filter.
 */
async function tellVacancies(tx: Executor, vacated: readonly VacatedPlace[]): Promise<void> {
  if (vacated.length === 0) return;
  const heads = await activeHeads(tx);
  for (const place of vacated) {
    await notify(
      { tx, userId: null },
      {
        to: heads,
        type: "BRANCH_ROLE_VACANT",
        params: { branch: place.branchName, role: place.role },
        branchId: place.branchId,
        link: "/users",
        at: now(),
      },
    );
  }
}

type VacatedPlace = Place & { branchName: string };

function named(places: readonly Place[], rows: readonly BranchRow[]): VacatedPlace[] {
  const byId = new Map(rows.map((row) => [row.id, row.name]));
  return places.map((place) => ({ ...place, branchName: byId.get(place.branchId) ?? "" }));
}

export type SavedUser = {
  id: string;
  fullName: string;
  username: string;
  phone: string;
  role: Role;
  locale: "uz" | "ru" | "en";
  isActive: boolean;
  branchIds: string[];
};

const userColumns = {
  id: users.id,
  fullName: users.fullName,
  username: users.username,
  phone: users.phone,
  role: users.role,
  locale: users.locale,
  isActive: users.isActive,
};

async function branchIdsOf(tx: Executor, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ branchId: userBranches.branchId })
    .from(userBranches)
    .where(eq(userBranches.userId, userId))
    .orderBy(asc(userBranches.branchId));
  return rows.map((row) => row.branchId);
}

async function readUser(tx: Executor, id: string): Promise<SavedUser | null> {
  const [row] = await tx.select(userColumns).from(users).where(eq(users.id, id));
  return row ? { ...row, branchIds: await branchIdsOf(tx, id) } : null;
}

/**
 * The lock step of every action on an existing user: the advisory locks, the rows of the user's
 * branches and of `more` (the branches the input names), then the user's row.
 */
export async function lockUser(
  tx: Executor,
  id: string,
  more: readonly string[] = [],
): Promise<{ user: SavedUser; branchRows: BranchRow[] } | null> {
  await lockUsers(tx);
  const held = await branchIdsOf(tx, id);
  const branchRows = await lockBranchRows(tx, [...held, ...more]);
  const [row] = await tx.select(userColumns).from(users).where(eq(users.id, id)).for("update");
  if (!row) return null;
  return { user: { ...row, branchIds: held }, branchRows };
}

// ---------------------------------------------------------------------------------------------
// createUser

export const createUserInput = z.object({
  clientKey: z.string().refine(isClientKey),
  fullName: nameInput,
  username: usernameInput,
  phone: phoneInput,
  role: z.enum(ROLES),
  locale: localeInput,
  branchIds: branchIdsInput,
  password: passwordInput,
  replacePrincipal: z.boolean().default(false),
});

export type CreateUserInput = z.input<typeof createUserInput>;

export const createUser = defineAction({
  name: "createUser",
  permission: "catalog.manage",
  input: createUserInput,
  async target() {
    return GLOBAL_TARGET;
  },
  repeat: {
    clientKey: (input) => input.clientKey,
    // The maker is the actor of the user's own `user.create` row: users has no maker column (as
    // createBranch; review of the plan of 1.2, correction 1).
    async find(tx, clientKey) {
      const [row] = await tx
        .select({ id: users.id, userId: auditLog.actorId })
        .from(users)
        .innerJoin(
          auditLog,
          and(
            eq(auditLog.entity, "users"),
            eq(auditLog.action, "user.create"),
            eq(auditLog.entityId, sql`${users.id}::text`),
          ),
        )
        .where(eq(users.clientKey, clientKey));
      if (!row) return null;
      const result = await readUser(tx, row.id);
      return result ? { result, userId: row.userId, branchId: null } : null;
    },
  },
  async write({ tx, input, userId }): Promise<SavedUser> {
    await lockUsers(tx);
    const branchRows = await lockBranchRows(tx, input.branchIds);
    refuseBranches(input.role, input.branchIds, [], branchRows);
    await refuseTakenUsername(tx, input.username, null);
    if (input.role === "PRINCIPAL") {
      await makeRoomForPrincipal({ tx, userId }, input.branchIds[0]!, null, input.replacePrincipal);
    }
    const moment = now();
    const { id } = await insertPasswordUser(
      (text, values) => tx.execute(bound(text, values)),
      {
        fullName: input.fullName,
        username: input.username,
        phone: input.phone,
        role: input.role,
        locale: input.locale,
        isActive: true,
        clientKey: input.clientKey,
      },
      input.password,
      moment,
    );
    if (input.branchIds.length > 0) {
      await tx.insert(userBranches).values(
        input.branchIds.map((branchId) => ({
          userId: id,
          branchId,
          userRole: input.role,
          userIsActive: true,
          createdAt: moment,
        })),
      );
    }
    return (await readUser(tx, id))!;
  },
  async history({ tx, userId }, user) {
    const rows = await lockBranchRows(tx, user.branchIds);
    // A fixed list of fields, never the input as a whole: the password stays out (plan of 0.9).
    await audit(
      { tx, userId },
      {
        action: "user.create",
        entity: "users",
        entityId: user.id,
        before: null,
        after: {
          fullName: user.fullName,
          username: user.username,
          phone: user.phone,
          role: user.role,
          locale: user.locale,
          isActive: user.isActive,
          branches: codesOf(rows, user.branchIds),
        },
        at: now(),
      },
    );
  },
});

// ---------------------------------------------------------------------------------------------
// updateUser

/** Only the fields the Head changed are sent; the role is not among them (Look first 1). */
export const updateUserInput = z.object({
  id: z.uuid(),
  fullName: nameInput.optional(),
  username: usernameInput.optional(),
  phone: phoneInput.optional(),
  locale: localeInput.optional(),
  branchIds: branchIdsInput.optional(),
  replacePrincipal: z.boolean().default(false),
});

export type UpdateUserInput = z.input<typeof updateUserInput>;

export type UpdatedUser = {
  user: SavedUser;
  changed: UserField[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  vacated: VacatedPlace[];
};

function auditFields(
  values: Partial<UserFields>,
  fields: readonly UserField[],
  branchRows: readonly BranchRow[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field === "branchIds") out.branches = codesOf(branchRows, values.branchIds ?? []);
    else out[field] = values[field];
  }
  return out;
}

export const updateUser = defineAction({
  name: "updateUser",
  permission: "catalog.manage",
  input: updateUserInput,
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx, input }) {
    const locked = await lockUser(tx, input.id, input.branchIds ?? []);
    return locked ? { target: GLOBAL_TARGET, rows: locked } : null;
  },
  // An inactive user is edited too, so their username can be freed (D41; plan of 1.3, decision 11).
  async write({ tx, input, locked, userId }): Promise<UpdatedUser> {
    const { user: current, branchRows } = locked!.rows;
    const { id, replacePrincipal, ...sent } = input;
    const changed = changedUserFields(current, sent);
    if (changed.length === 0) return { user: current, changed, before: {}, after: {}, vacated: [] };

    const wanted = sent.branchIds ?? current.branchIds;
    const branchesChanged = changed.includes("branchIds");
    if (branchesChanged) {
      refuseBranches(current.role, wanted, current.branchIds, branchRows);
      if (current.role === "PRINCIPAL" && current.isActive) {
        await makeRoomForPrincipal({ tx, userId }, wanted[0]!, id, replacePrincipal);
      }
    }
    if (changed.includes("username")) await refuseTakenUsername(tx, sent.username!, id);

    const touched = [...new Set([...current.branchIds, ...wanted])];
    const before = await staffedPlaces(tx, touched);

    const set: Partial<typeof users.$inferInsert> = {};
    if (changed.includes("fullName")) set.fullName = sent.fullName!;
    if (changed.includes("username")) {
      // The username plugin keeps the name as typed beside it (0.6 schema; spec review of the
      // plan of 1.3, Should fix 5).
      set.username = sent.username!;
      set.displayUsername = sent.username!;
    }
    if (changed.includes("phone")) set.phone = sent.phone!;
    if (changed.includes("locale")) set.locale = sent.locale!;
    const moment = now();
    await tx
      .update(users)
      .set({ ...set, updatedAt: moment })
      .where(eq(users.id, id));

    if (branchesChanged) {
      // A row is an assignment: removing a branch deletes it, and the audit row keeps the change
      // (review of the plan of 1.3, correction 1, Look first). The old rows go before the new
      // ones are added: a Principal's one row is unique, and the deferred trigger counts at commit.
      const removed = current.branchIds.filter((branchId) => !wanted.includes(branchId));
      const added = wanted.filter((branchId) => !current.branchIds.includes(branchId));
      if (removed.length > 0) {
        await tx
          .delete(userBranches)
          .where(and(eq(userBranches.userId, id), inArray(userBranches.branchId, removed)));
      }
      if (added.length > 0) {
        await tx.insert(userBranches).values(
          added.map((branchId) => ({
            userId: id,
            branchId,
            userRole: current.role,
            userIsActive: current.isActive,
            createdAt: moment,
          })),
        );
      }
    }

    const after = await staffedPlaces(tx, touched);
    const user = (await readUser(tx, id))!;
    return {
      user,
      changed,
      before: auditFields(current, changed, branchRows),
      after: auditFields(user, changed, branchRows),
      vacated: named(vacatedPlaces(before, after), branchRows),
    };
  },
  async history({ tx, userId }, result) {
    // No change, no row (04 rule 9 shows changes, not saves; as updateBranch).
    if (result.changed.length === 0) return;
    await audit(
      { tx, userId },
      {
        action: "user.update",
        entity: "users",
        entityId: result.user.id,
        before: result.before,
        after: result.after,
        at: now(),
      },
    );
  },
  async notify({ tx }, result) {
    await tellVacancies(tx, result.vacated);
  },
});

// ---------------------------------------------------------------------------------------------
// setUserActive

export const setUserActiveInput = z.object({
  id: z.uuid(),
  active: z.boolean(),
  replacePrincipal: z.boolean().default(false),
});

export type SetUserActiveInput = z.input<typeof setUserActiveInput>;

export type ActiveChange = { user: SavedUser; vacated: VacatedPlace[] };

export const setUserActive = defineAction({
  name: "setUserActive",
  permission: "catalog.manage",
  input: setUserActiveInput,
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx, input }) {
    const locked = await lockUser(tx, input.id);
    return locked ? { target: GLOBAL_TARGET, rows: locked } : null;
  },
  async write({ tx, input, locked, userId }): Promise<ActiveChange> {
    const { user: current, branchRows } = locked!.rows;
    // The same move twice is a stale screen (as setBranchActive).
    if (current.isActive === input.active) throw new ActionError("wrong_status");
    if (!input.active) {
      // The Head never signs themselves out by deactivating their own account (decision 9).
      if (current.id === userId) throw new ActionError("forbidden");
      // "The last one cannot be deactivated" (03 rule 4); the trigger is the last defence.
      if (current.role === "HEAD") {
        const others = (await activeHeads(tx)).filter((headId) => headId !== current.id);
        if (others.length === 0) throw new ActionError("wrong_status");
      }
    } else if (current.role === "PRINCIPAL") {
      await makeRoomForPrincipal(
        { tx, userId },
        current.branchIds[0]!,
        current.id,
        input.replacePrincipal,
      );
    }

    const before = await staffedPlaces(tx, current.branchIds);
    await tx
      .update(users)
      .set({ isActive: input.active, updatedAt: now() })
      .where(eq(users.id, current.id));
    // A deactivated user is signed out on every device, so a later activation brings no old
    // device back (progress 0.6, "For 1.3").
    if (!input.active) await endSessions(tx, current.id);
    const after = await staffedPlaces(tx, current.branchIds);
    return {
      user: { ...current, isActive: input.active },
      vacated: named(vacatedPlaces(before, after), branchRows),
    };
  },
  async history({ tx, userId }, result) {
    await audit(
      { tx, userId },
      {
        action: result.user.isActive ? "user.activate" : "user.deactivate",
        entity: "users",
        entityId: result.user.id,
        before: { isActive: !result.user.isActive },
        after: { isActive: result.user.isActive },
        at: now(),
      },
    );
  },
  async notify({ tx }, result) {
    await tellVacancies(tx, result.vacated);
  },
});

// ---------------------------------------------------------------------------------------------
// renewUserPassword

export const renewUserPasswordInput = z.object({ id: z.uuid(), password: passwordInput });

export type RenewUserPasswordInput = z.input<typeof renewUserPasswordInput>;

export const renewUserPassword = defineAction({
  name: "renewUserPassword",
  permission: "catalog.manage",
  input: renewUserPasswordInput,
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx, input }) {
    const locked = await lockUser(tx, input.id);
    return locked ? { target: GLOBAL_TARGET, rows: locked } : null;
  },
  async write({ tx, input, locked, userId }): Promise<{ id: string }> {
    const { user } = locked!.rows;
    // "Users cannot change their own" (A8), the Head included (plan of 1.3, Look first 2).
    if (user.id === userId) throw new ActionError("forbidden");
    const moment = now();
    const renewed = await tx
      .update(accounts)
      .set({ password: await hashPassword(input.password), updatedAt: moment })
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")))
      .returning({ id: accounts.id });
    if (renewed.length !== 1)
      throw new Error("renewUserPassword: the user has no password account.");
    // "A renewal signs that user out on every device at once" (A8).
    await endSessions(tx, user.id);
    // The server returns no password: the Head's page showed the one it sent (decision 10).
    return { id: user.id };
  },
  async history({ tx, userId }, result) {
    // No field at all: the row says only that the password was renewed (Done when: "the audit
    // row of a renewal holds no password").
    await audit(
      { tx, userId },
      {
        action: "user.renew_password",
        entity: "users",
        entityId: result.id,
        before: {},
        after: {},
        at: now(),
      },
    );
  },
});
