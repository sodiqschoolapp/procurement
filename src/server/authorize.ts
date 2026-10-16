import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import {
  type Actor,
  type ManagerRight,
  type Permission,
  type Role,
  type Target,
  type Decision,
  decide,
  decideList,
} from "@/domain/permissions";
import type { db as Database } from "@/server/db/client";

// The one permission layer (developer-rules.md rule 4; CLAUDE.md rule 4): every server action
// and every query calls authorize(), and every list puts branchFilter() into its own SQL.
// The matrix itself is src/domain/permissions.ts.

type Transaction = Parameters<Parameters<typeof Database.transaction>[0]>[0];

/** The database client, or the transaction of the action wrapper (0.8). */
export type Executor = typeof Database | Transaction;

/**
 * A refusal. `not_found` for another branch's record (03 rule 1: "Not found"), `forbidden` for
 * an action the role, a Manager right or the owner does not allow. The message keys come with the
 * typed errors of 0.8 (plan of 0.7, decision 11).
 */
export class AuthorizationError extends Error {
  constructor(readonly kind: "not_found" | "forbidden") {
    super(kind === "not_found" ? "Not found." : "Not allowed.");
    this.name = "AuthorizationError";
  }
}

/**
 * Reads the actor fresh, in one query (plan of 0.7, decision 6): a role changed, a branch taken
 * away, a right switched off or a deactivation counts at the next call. `null` for an unknown or
 * inactive user.
 */
async function loadActor(userId: string, executor: Executor): Promise<Actor | null> {
  const found = await executor.execute<{
    role: Role;
    branch_ids: string[];
    disabled_rights: ManagerRight[];
  }>(sql`
    select u.role,
           array(select ub.branch_id from user_branches ub where ub.user_id = u.id)::text[]
             as branch_ids,
           array(select mr."right" from manager_rights mr
                 where mr.user_id = u.id and not mr.enabled)::text[]
             as disabled_rights
    from users u
    where u.id = ${userId} and u.is_active`);
  const row = found.rows[0];
  if (!row) return null;
  return {
    userId,
    role: row.role,
    branchIds: row.branch_ids,
    disabledRights: row.disabled_rights,
  };
}

/**
 * Checks that the user may use the permission, on the target's branch for a branch permission,
 * and returns the actor for branchFilter(). Throws AuthorizationError otherwise.
 */
export async function authorize(
  userId: string,
  permission: Permission,
  target?: Target,
  executor?: Executor,
): Promise<Actor> {
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const runner = executor ?? (await import("@/server/db/client")).db;
  const actor = await loadActor(userId, runner);
  if (!actor) throw new AuthorizationError("forbidden");
  const decision = decide(permission, actor, target);
  if (decision !== "allow") throw new AuthorizationError(decision);
  return actor;
}

/** One order of an action on ticked orders: the permission it needs and its branch and owner. */
export type OrderCheck = { permission: Permission; target: Target };

/**
 * authorize() for an action on many ticked orders (plan of 2.4, decision 16): the actor is read
 * once, in one query, and each order is answered like authorize() would answer it alone, so 200
 * orders cost one query, not 200 (developer-rules.md rule 12). Each target is read from the locked
 * order, never from the input (rule 13). Throws AuthorizationError("forbidden") for an unknown or
 * inactive user; otherwise returns the actor and one decision per check, in the same order. The
 * caller refuses the whole action when any decision is not "allow" (03 rule 8).
 */
export async function authorizeOrders(
  userId: string,
  checks: readonly OrderCheck[],
  executor: Executor,
): Promise<{ actor: Actor; decisions: Decision[] }> {
  const actor = await loadActor(userId, executor);
  if (!actor) throw new AuthorizationError("forbidden");
  return {
    actor,
    decisions: checks.map((check) => decide(check.permission, actor, check.target)),
  };
}

/**
 * Checks that the user may list the records of a branch permission (decideList()) and returns the
 * actor, whose branchFilter() the list must put into its own SQL. Throws AuthorizationError
 * otherwise.
 */
export async function authorizeList(
  userId: string,
  permission: Permission,
  executor?: Executor,
): Promise<Actor> {
  const runner = executor ?? (await import("@/server/db/client")).db;
  const actor = await loadActor(userId, runner);
  if (!actor) throw new AuthorizationError("forbidden");
  if (decideList(permission, actor) !== "allow") throw new AuthorizationError("forbidden");
  return actor;
}

/**
 * The branch condition of a list, inside its SQL (developer-rules.md rule 4). The Head sees every
 * branch; everyone else the branches of user_branches, read by a subquery in the same statement
 * as the rows (plan of 0.7, decision 7). Returns `undefined` for the Head, which `where()` and
 * `and()` skip.
 */
export function branchFilter(actor: Actor, branchColumn: AnyPgColumn): SQL | undefined {
  if (actor.role === "HEAD") return undefined;
  return sql`${branchColumn} in (select ub.branch_id from user_branches ub where ub.user_id = ${actor.userId})`;
}
