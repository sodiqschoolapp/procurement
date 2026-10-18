import { sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type * as z from "zod";

import { type Actor, PERMISSIONS, type Permission, type Target } from "@/domain/permissions";
import { type CurrentUser, getCurrentUser } from "@/server/auth/session";
import { AuthorizationError, type Executor, authorize } from "@/server/authorize";
import type { db as Database } from "@/server/db/client";

import { fieldErrors } from "./action-input";
import {
  type ActionResult,
  type FieldMessageKey,
  type ServerErrorCode,
  failure,
} from "./action-result";

// The one wrapper every write uses (developer-rules.md rule 3, "One transaction per action";
// CLAUDE.md rule 3; plan of 0.8). An action is a set of named steps; the wrapper calls them in
// the fixed order of rule 3 and the action cannot change it:
//
//   input     the Zod check, before the transaction (rule 13)
//   target    read the record's branch and owner           ┐
//   authorize authorize(), the one permission layer       │
//   repeat    a create's client_key seen before (rule 8)   │
//   lock      SELECT … FOR UPDATE; branch and owner again  │ one transaction:
//   version   the input's version against the row (rule 9) │ any throw saves nothing
//   check     the status check                             │
//   write     the change; the wrapper raises the version   │
//   history   the history event                            │
//   notify    the notifications                            ┘
//
// An action of a global permission (one with no branch, such as profile.edit) names no branch:
// its `target` and its `lock` return GLOBAL_TARGET, and authorize() is asked without a target
// (plan of 0.10b, decision 4, Look first). A global target with a branch permission and a branch
// target with a global permission are mistakes in the action: they save nothing (review of the
// plan of 0.10b, correction 4). A global create with `repeat` (a file upload) matches its first
// result by its maker alone, as it has no branch (plan of 0.12, decision 6, Look first).

type Transaction = Parameters<Parameters<typeof Database.transaction>[0]>[0];

/** A refusal thrown by a step, returned to the browser with its code. */
export class ActionError extends Error {
  /**
   * `fields`: with `invalid_input`, the message key of each wrong field, found by a step and not
   * by the Zod check, such as a code another branch holds (plan of 1.2, decision 7).
   */
  constructor(
    readonly code: Exclude<ServerErrorCode, "signed_out">,
    readonly fields?: Record<string, FieldMessageKey>,
    /** With a `stockShort` field: the amount left, by the same path (plan of 5.4, decided item 2). */
    readonly stockLeft?: Record<string, string>,
  ) {
    super(`Action refused: ${code}.`);
    this.name = "ActionError";
  }
}

/** The target of an action of a global permission: no branch, no owner. */
export const GLOBAL_TARGET = Object.freeze({ scope: "global" } as const);

/** A branch and owner, or GLOBAL_TARGET for an action of a global permission. */
export type ActionTarget = Target | typeof GLOBAL_TARGET;

/** By shape, not by reference: a fresh `{ scope: "global" }` from a step is global too. */
function isGlobal(target: ActionTarget): target is typeof GLOBAL_TARGET {
  return "scope" in target && target.scope === "global";
}

/** What `lock` returns: the locked record's branch and owner, its version, and the rows. */
export type Locked<Rows> = {
  target: ActionTarget;
  /** For a record that carries a version (an ORF): its id and the version read under the lock. */
  version?: { id: string; current: number };
  rows: Rows;
};

/**
 * What a repeated client_key finds: the first result, and who made it where. `branchId` is
 * `null` for a global create, which has no branch (plan of 0.12, decision 6).
 */
export type FirstResult<Result> = { result: Result; userId: string; branchId: string | null };

export type StepContext<Input> = { tx: Transaction; input: Input; userId: string };
export type WriteContext<Input, Rows> = StepContext<Input> & {
  actor: Actor;
  locked: Locked<Rows> | undefined;
};

export type ActionDefinition<Schema extends z.ZodType, Rows, Result> = {
  /** For the log only. */
  name: string;
  permission: Permission;
  input: Schema;
  /**
   * The branch and owner authorize() checks, read from the database (from the input only for a
   * create: decisions 0.7). `null` when the record does not exist: "Not found".
   */
  target(context: StepContext<z.output<Schema>>): Promise<ActionTarget | null>;
  /** A create action's safe repeat (developer-rules.md rule 8). */
  repeat?: {
    clientKey(input: z.output<Schema>): string;
    /** Reads the action's own `client_key UNIQUE` column. */
    find(tx: Transaction, clientKey: string): Promise<FirstResult<Result> | null>;
  };
  /**
   * Locks the rows the action changes. `null` when the record is gone: "Not found". Required for
   * every action without `repeat` (a create).
   */
  lock?(context: StepContext<z.output<Schema>>): Promise<Locked<Rows> | null>;
  /** Where the version lives; required when `lock` returns a version. */
  versionOf?: { table: PgTable; id: AnyPgColumn; version: AnyPgColumn };
  /** The status check; throws ActionError("wrong_status") or another refusal. */
  check?(context: WriteContext<z.output<Schema>, Rows>): void | Promise<void>;
  write(context: WriteContext<z.output<Schema>, Rows>): Promise<Result>;
  history?(context: WriteContext<z.output<Schema>, Rows>, result: Result): Promise<void>;
  notify?(context: WriteContext<z.output<Schema>, Rows>, result: Result): Promise<void>;
};

/** Declares an action; the types of its steps follow from its input schema. */
export function defineAction<Schema extends z.ZodType, Rows, Result>(
  definition: ActionDefinition<Schema, Rows, Result>,
): ActionDefinition<Schema, Rows, Result> {
  return definition;
}

/** A versioned row without `versionOf`, or a version that did not rise: a mistake in the action. */
class ActionDefinitionError extends Error {
  name = "ActionDefinitionError";
}

function sameTarget(a: ActionTarget, b: ActionTarget): boolean {
  if (isGlobal(a) || isGlobal(b)) return isGlobal(a) && isGlobal(b);
  return a.branchId === b.branchId && (a.ownerId ?? null) === (b.ownerId ?? null);
}

function inputVersion(input: unknown): unknown {
  return typeof input === "object" && input !== null && "version" in input
    ? input.version
    : undefined;
}

async function raiseVersion(
  tx: Executor,
  versionOf: NonNullable<ActionDefinition<z.ZodType, unknown, unknown>["versionOf"]>,
  id: string,
): Promise<void> {
  const raised = await tx.execute(
    sql`update ${versionOf.table} set ${sql.identifier(versionOf.version.name)} = ${versionOf.version} + 1 where ${versionOf.id} = ${id}`,
  );
  if (raised.rowCount !== 1) throw new ActionDefinitionError("The version was not raised.");
}

/** Thrown inside the transaction to roll it back with a refusal that is not an error. */
class Refusal extends Error {
  constructor(readonly code: ServerErrorCode) {
    super(code);
  }
}

/**
 * Runs an action for a user: the Zod check, then every step in one transaction. Returns the
 * result, or a refusal with its code; nothing is saved unless every step succeeded.
 */
export async function runAction<Schema extends z.ZodType, Rows, Result>(
  definition: ActionDefinition<Schema, Rows, Result>,
  userId: string,
  rawInput: unknown,
): Promise<ActionResult<Result>> {
  const parsed = definition.input.safeParse(rawInput);
  if (!parsed.success) return failure("invalid_input", fieldErrors(parsed.error, rawInput));
  const input = parsed.data;

  try {
    // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
    const { db } = await import("@/server/db/client");
    const data = await db.transaction(async (tx) => {
      const step: StepContext<z.output<Schema>> = { tx, input, userId };

      const target = await definition.target(step);
      if (!target) throw new Refusal("not_found");
      const global = isGlobal(target);
      // A branch target always names its branch: without one, the wall has nothing to check.
      if (!global && typeof (target as Partial<Target>).branchId !== "string") {
        throw new ActionDefinitionError(`${definition.name}: a branch target without a branch.`);
      }
      if (global !== (PERMISSIONS[definition.permission].scope === "global")) {
        throw new ActionDefinitionError(
          `${definition.name}: the target does not fit the scope of ${definition.permission}.`,
        );
      }
      const actor = await authorize(
        userId,
        definition.permission,
        isGlobal(target) ? undefined : target,
        tx,
      );

      // Every action but a create locks the rows it changes: without the lock there is no check
      // of branch, owner and version under it (permission review of 0.8).
      if (!definition.repeat && !definition.lock) {
        throw new ActionDefinitionError(`${definition.name} has neither repeat nor lock.`);
      }

      if (definition.repeat) {
        const clientKey = definition.repeat.clientKey(input);
        // Two calls with one key wait for each other here; the second then finds the first's row
        // (plan of 0.8, decision 4). A collision of two keys only makes them wait.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${clientKey}, 0))`);
        const first = await definition.repeat.find(tx, clientKey);
        if (first) {
          // The first result goes back only to who made it, in the branch it was made for
          // (progress 0.4, "For 0.8"); a global one, which has no branch, to its maker alone
          // (plan of 0.12, decision 6, Look first). Nothing else runs.
          const branchId = isGlobal(target) ? null : target.branchId;
          if (first.userId !== userId || first.branchId !== branchId) {
            throw new Refusal("not_found");
          }
          return first.result;
        }
      }

      const locked = definition.lock ? await definition.lock(step) : undefined;
      if (locked === null) throw new Refusal("not_found");
      // The record moved branch or owner between the read and the lock (plan, decision 1).
      if (locked && !sameTarget(locked.target, target)) throw new Refusal("conflict");

      if (locked?.version) {
        if (!definition.versionOf) {
          throw new ActionDefinitionError(`${definition.name} locks a version without versionOf.`);
        }
        const sent = inputVersion(input);
        if (!Number.isInteger(sent)) throw new Refusal("invalid_input");
        if (sent !== locked.version.current) throw new Refusal("stale_version");
      }

      const context: WriteContext<z.output<Schema>, Rows> = { ...step, actor, locked };
      await definition.check?.(context);
      const result = await definition.write(context);
      if (locked?.version && definition.versionOf) {
        await raiseVersion(tx, definition.versionOf, locked.version.id);
      }
      await definition.history?.(context, result);
      await definition.notify?.(context, result);
      return result;
    });
    return { ok: true, data };
  } catch (error) {
    if (error instanceof Refusal) return failure(error.code);
    if (error instanceof ActionError) {
      return failure(error.code, error.fields, undefined, error.stockLeft);
    }
    if (error instanceof AuthorizationError) return failure(error.kind);
    console.error(`Action ${definition.name} failed: ${describeForLog(error)}`);
    return failure("unexpected");
  }
}

type DatabaseFailure = { code: string; constraint?: unknown };

function databaseFailureOf(error: unknown): DatabaseFailure | null {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    if (typeof current !== "object") return null;
    if (
      "code" in current &&
      typeof current.code === "string" &&
      /^[0-9A-Z]{5}$/.test(current.code)
    ) {
      return current as DatabaseFailure;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return null;
}

/**
 * What the log may hold of an error (plan of 0.8, decision 7; CLAUDE.md conventions: no
 * personal data in a log). A database error gives its name, its PostgreSQL code and constraint
 * only: Drizzle's message carries every bound value of the statement, and PostgreSQL's own
 * message and `detail` can quote a value. Any other error gives its name and message.
 */
export function describeForLog(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const database = databaseFailureOf(error);
  if (database) {
    const constraint =
      typeof database.constraint === "string" ? ` constraint ${database.constraint}` : "";
    return `${name}: PostgreSQL ${database.code}${constraint}`;
  }
  if (error instanceof Error && !/^Failed query:/.test(error.message)) {
    return `${name}: ${error.message}`;
  }
  return name;
}

/**
 * The function a `"use server"` file exports: it reads the signed-in user and runs the action.
 * `currentUser` is for tests, which run outside a request.
 */
export function serverAction<Schema extends z.ZodType, Rows, Result>(
  definition: ActionDefinition<Schema, Rows, Result>,
  currentUser: () => Promise<CurrentUser | null> = getCurrentUser,
): (input: unknown) => Promise<ActionResult<Result>> {
  return async (input) => {
    const user = await currentUser();
    if (!user) return failure("signed_out");
    return runAction(definition, user.id, input);
  };
}
