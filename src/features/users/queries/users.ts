import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import * as z from "zod";

import type { Role } from "@/domain/permissions";
import { STAFFED_ROLES, type StaffedRole, USERS_PAGE_SIZE } from "@/domain/users";
import { authorize } from "@/server/authorize";
import { branches, userBranches, users } from "@/server/db/schema";

import { staffedPlaces } from "../vacancies";

// The Head's users (build-plan 1.3; 11-screens-and-ux.md, Screens: "Users and branches, /users,
// Head"). "Manage catalogs, users, branches, settings": catalog.manage, Head only (03). No branch
// filter: only the Head reads these, and the Head sees every branch. Inactive users are listed
// too (04 rule 2).

export type UserBranch = { id: string; code: string; name: string; isActive: boolean };

export type UserRow = {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  isActive: boolean;
  branches: UserBranch[];
};

export type UserPage = {
  rows: UserRow[];
  page: number;
  pages: number;
  active: number;
  inactive: number;
};

export type UserDetail = UserRow & {
  phone: string;
  locale: "uz" | "ru" | "en";
  /** The only active Head: Deactivate is not offered (03 rule 4). */
  lastActiveHead: boolean;
};

async function database() {
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  return (await import("@/server/db/client")).db;
}

type Db = Awaited<ReturnType<typeof database>>;

async function branchesOf(db: Db, userIds: readonly string[]): Promise<Map<string, UserBranch[]>> {
  const byUser = new Map<string, UserBranch[]>();
  if (userIds.length === 0) return byUser;
  const rows = await db
    .select({
      userId: userBranches.userId,
      id: branches.id,
      code: branches.code,
      name: branches.name,
      isActive: branches.isActive,
    })
    .from(userBranches)
    .innerJoin(branches, eq(branches.id, userBranches.branchId))
    .where(inArray(userBranches.userId, [...userIds]))
    .orderBy(asc(branches.code));
  for (const { userId, ...branch } of rows) {
    byUser.set(userId, [...(byUser.get(userId) ?? []), branch]);
  }
  return byUser;
}

/** One page of every user, active first, then by full name; a page past the last gives the last. */
export async function listUsers(
  userId: string,
  options: { page?: number } = {},
): Promise<UserPage> {
  await authorize(userId, "catalog.manage");
  const db = await database();
  const [totals] = await db
    .select({ active: sql<number>`count(*) filter (where ${users.isActive})::int`, all: count() })
    .from(users);
  const active = totals?.active ?? 0;
  const all = totals?.all ?? 0;
  const pages = Math.max(1, Math.ceil(all / USERS_PAGE_SIZE));
  const asked = Number.isInteger(options.page) && options.page! >= 1 ? options.page! : 1;
  const page = Math.min(asked, pages);
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      username: users.username,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .orderBy(desc(users.isActive), asc(users.fullName), asc(users.id))
    .limit(USERS_PAGE_SIZE)
    .offset((page - 1) * USERS_PAGE_SIZE);
  const held = await branchesOf(
    db,
    rows.map((row) => row.id),
  );
  return {
    rows: rows.map((row) => ({ ...row, branches: held.get(row.id) ?? [] })),
    page,
    pages,
    active,
    inactive: all - active,
  };
}

/** One user, or `null` for an id that is unknown or not an id at all (the page: "not found"). */
export async function getUser(userId: string, id: string): Promise<UserDetail | null> {
  await authorize(userId, "catalog.manage");
  if (!z.uuid().safeParse(id).success) return null;
  const db = await database();
  const [row] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      username: users.username,
      phone: users.phone,
      role: users.role,
      locale: users.locale,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, id));
  if (!row) return null;
  const [heads] = await db
    .select({ count: count() })
    .from(users)
    .where(and(eq(users.role, "HEAD"), eq(users.isActive, true)));
  const held = await branchesOf(db, [row.id]);
  return {
    ...row,
    branches: held.get(row.id) ?? [],
    lastActiveHead: row.role === "HEAD" && row.isActive && (heads?.count ?? 0) <= 1,
  };
}

export type BranchVacancy = { id: string; code: string; name: string; roles: StaffedRole[] };

/**
 * Each active branch with the roles among Manager, Principal and Finance that have no active user
 * there, for the warning of /users (03 rule 5; plan of 1.3, decision 8). Ordered by code.
 */
export async function listBranchVacancies(userId: string): Promise<BranchVacancy[]> {
  await authorize(userId, "catalog.manage");
  const db = await database();
  const open = await db
    .select({ id: branches.id, code: branches.code, name: branches.name })
    .from(branches)
    .where(eq(branches.isActive, true))
    .orderBy(asc(branches.code));
  const staffed = await staffedPlaces(
    db,
    open.map((branch) => branch.id),
  );
  const held = new Set(staffed.map((place) => `${place.branchId} ${place.role}`));
  return open
    .map((branch) => ({
      ...branch,
      roles: STAFFED_ROLES.filter((role) => !held.has(`${branch.id} ${role}`)),
    }))
    .filter((branch) => branch.roles.length > 0);
}

export type BranchChoice = UserBranch & {
  /** The active Principal of the branch, other than the user edited: the replacement's name. */
  principal: { id: string; fullName: string } | null;
};

/**
 * The branches the user form offers: every active branch, and the inactive branches the user
 * edited already holds (plan of 1.3, decision 14), each with its active Principal.
 */
export async function listBranchChoices(
  userId: string,
  forUserId: string | null = null,
): Promise<BranchChoice[]> {
  await authorize(userId, "catalog.manage");
  const db = await database();
  const ownId = forUserId !== null && z.uuid().safeParse(forUserId).success ? forUserId : null;
  const heldIds =
    ownId === null
      ? []
      : (
          await db
            .select({ branchId: userBranches.branchId })
            .from(userBranches)
            .where(eq(userBranches.userId, ownId))
        ).map((row) => row.branchId);
  const rows = await db
    .select({
      id: branches.id,
      code: branches.code,
      name: branches.name,
      isActive: branches.isActive,
    })
    .from(branches)
    .where(
      heldIds.length === 0
        ? eq(branches.isActive, true)
        : or(eq(branches.isActive, true), inArray(branches.id, heldIds)),
    )
    .orderBy(asc(branches.code));
  const principals = await db
    .select({ branchId: userBranches.branchId, id: users.id, fullName: users.fullName })
    .from(userBranches)
    .innerJoin(users, eq(users.id, userBranches.userId))
    .where(and(eq(userBranches.userRole, "PRINCIPAL"), eq(userBranches.userIsActive, true)));
  const principalOf = new Map(
    principals
      .filter((principal) => principal.id !== ownId)
      .map((principal) => [principal.branchId, { id: principal.id, fullName: principal.fullName }]),
  );
  return rows.map((row) => ({ ...row, principal: principalOf.get(row.id) ?? null }));
}
