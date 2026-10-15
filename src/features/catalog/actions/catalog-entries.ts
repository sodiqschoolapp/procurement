import { type SQL, and, eq, ne, or, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import { CATALOG_ENTRIES, changedCatalogFields, type EntryKind } from "@/domain/catalogs";
import type { AuditAction, AuditRecord } from "@/domain/audit";
import { GLOBAL_TARGET, ActionError, defineAction } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import { audit } from "@/server/audit";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { auditLog } from "@/server/db/schema";

// The one write path of the small catalogs (build-plan 1.5: "built on one shared catalog
// component"; 04-catalogs.md rules 2, 3, 9). defineCatalogActions() builds, from one catalog's
// table, fields and unique columns, its create, update and deactivate/activate actions, each under
// "Manage catalogs, users, branches, settings": catalog.manage, Head only, global (03, Permission
// matrix). Nothing deletes an entry: it is deactivated and can be activated again (04 rule 2). Every
// change writes its audit row in the same transaction (04 rule 9; developer-rules.md rule 13),
// entity the table's name (plan of 1.5, decision 10). No version column: two Heads saving at once
// each write only the fields they changed, under the row lock (decision 8; decisions 1.2 item 1).

const TAKEN: FieldMessageKey = "errors.field.taken";

/** The text as the unique indexes of migration 0010 compare it; never a JavaScript copy. */
function compared(value: unknown) {
  return sql`lower(regexp_replace(btrim(${value}), '\\s+', ' ', 'g'))`;
}

type CatalogTable = PgTable & {
  id: AnyPgColumn;
  isActive: AnyPgColumn;
  clientKey: AnyPgColumn;
};

type AuditPrefix =
  "unit" | "category" | "extra_cost_type" | "company" | "department" | "product" | "subtype";

/**
 * The parent an entry belongs to and its names are unique inside: a department's branch (04 rule
 * 3: "department names inside a branch"; plan of 1.6). It is set on create and never changed
 * (decision 1): the update input has no such field, and the update's name check reads it from
 * the locked row, never from the input (plan review of 1.6, Should fix 2).
 */
export type CatalogParent = {
  /** The input field and the key of the saved entry, as `branchId`. */
  key: string;
  column: AnyPgColumn;
  /**
   * Locks and checks the parent a create names, inside the transaction, before the insert; throws
   * an ActionError when it may not take a new entry.
   */
  check(tx: Executor, id: string): Promise<void>;
  /** What the create's history row keeps of the parent besides its id, as the branch's code. */
  shown(tx: Executor, id: string): Promise<AuditRecord>;
  /**
   * Whether the update and activate rows keep it too, in `before` and `after` alike (unchanged,
   * so the history does not list it): a subtype's product (plan of 1.8, decision 9).
   */
  onEveryRow?: boolean;
};

export type CatalogConfig<Fields extends Record<string, unknown>> = {
  kind: EntryKind;
  /** For the log: "Measure" makes createMeasure, updateMeasure, setMeasureActive. */
  name: string;
  table: CatalogTable;
  prefix: AuditPrefix;
  /** The column of each field, in the order of CATALOGS[kind].fields. */
  columns: { [Key in keyof Fields & string]: AnyPgColumn };
  /** The Zod check of each field as the Head sends it; it returns the stored form. */
  shape: { [Key in keyof Fields & string]: z.ZodType<Fields[Key]> };
  /** The fields that are unique ignoring capital letters and extra spaces (04 rule 3). */
  unique: readonly (keyof Fields & string)[];
  /** The parent the unique fields are unique inside; none for a catalog of the whole school. */
  within?: CatalogParent;
  /**
   * The checks of one catalog beyond the name (plan of 1.7, review Should fix 1): run under the
   * table's lock before the name check, with the actor and the fields the write would store (every field on
   * create, `current` null; the changed ones on update, `current` the locked row). Throws an
   * ActionError with field errors. Measures lock "Allows decimals" here, products their references,
   * photo and the lock after first use.
   */
  guard?(
    context: { tx: Executor; userId: string },
    sent: Partial<Fields>,
    current: SavedEntry<Fields> | null,
  ): Promise<void>;
  /** Fields set on create only and absent from the update input, as a product's price (1.7). */
  createOnly?: readonly (keyof Fields & string)[];
  /** A create check that differs from `shape`, as a type with its default (1.7, decision 8). */
  createShape?: { [Key in keyof Fields & string]?: z.ZodType<Fields[Key]> };
  /**
   * What an audit row keeps beside the ids it holds, on create and on update: the names of a
   * product's category, measure and company as they are at that moment (plan of 1.7, decision 11).
   */
  shownRefs?(tx: Executor, values: Partial<Fields>): Promise<AuditRecord>;
  /**
   * Written after the insert, in the same transaction, with the actor: a product's hidden default
   * subtype (04 rule 1; plan of 1.8) and the HEAD row of its price (plan of 1.9, decision 1; plan
   * review of 1.9, Must fix 2).
   */
  afterInsert?(context: { tx: Executor; userId: string }, entry: SavedEntry<Fields>): Promise<void>;
  /**
   * The rows update and setActive may reach; any other is "not found": a subtype's actions never
   * reach a hidden default row (plan of 1.8, decision 3; plan review, Should fix 2).
   */
  lockable?: SQL;
  /**
   * The check of a deactivation or an activation beyond "not the same twice", under the table's
   * lock: a product keeps one active subtype (plan of 1.8, decision 3, Look first).
   */
  checkActive?(tx: Executor, entry: SavedEntry<Fields>, active: boolean): Promise<void>;
};

export type SavedEntry<Fields> = Fields & { id: string; isActive: boolean };

export type UpdatedEntry<Fields> = {
  entry: SavedEntry<Fields>;
  changed: (keyof Fields & string)[];
  before: Partial<Fields>;
  after: Partial<Fields>;
};

export function defineCatalogActions<Fields extends Record<string, unknown>>(
  config: CatalogConfig<Fields>,
) {
  type Saved = SavedEntry<Fields>;
  type Key = keyof Fields & string;
  const { table, prefix, within, guard, shownRefs, afterInsert, lockable, checkActive } = config;
  const createOnly = new Set<string>(config.createOnly ?? []);
  const entity = CATALOG_ENTRIES[config.kind].entity;
  const fields = CATALOG_ENTRIES[config.kind].fields.map((field) => field.key) as Key[];
  const action = (verb: string) => `${prefix}.${verb}` as AuditAction;

  // The table's advisory lock: seed 1, apart from the wrapper's client-key locks (seed 0), as the
  // branches' (decisions 1.2 item 7). Every write of one catalog takes it before reading names.
  const tableLock = sql`select pg_advisory_xact_lock(hashtextextended(${entity}, 1))`;

  const columns = {
    id: table.id,
    ...(within ? { [within.key]: within.column } : {}),
    ...(config.columns as Record<string, AnyPgColumn>),
    isActive: table.isActive,
  };

  /**
   * Refuses a name (or a short name) another entry holds, active or not (D41), as field errors,
   * before the unique indexes refuse it (decision 13 of the plan of 1.2, followed here). Runs under
   * the table's lock, so two saves cannot both pass it. With a parent, only the entries of the same
   * parent count (`parentId`, from the input on create and from the locked row on update).
   */
  async function refuseTaken(
    tx: Executor,
    sent: Partial<Fields>,
    ownId: string | null,
    parentId: string | null,
  ) {
    const asked = config.unique.filter((field) => typeof sent[field] === "string");
    if (asked.length === 0) return;
    const matches = Object.fromEntries(
      asked.map((field) => [
        field,
        sql<boolean>`${compared(config.columns[field])} = ${compared(sent[field])}`,
      ]),
    );
    const rows = await tx
      .select(matches)
      .from(table)
      .where(
        and(
          or(...asked.map((field) => matches[field]!)),
          ownId === null ? undefined : ne(table.id, ownId),
          within ? eq(within.column, parentId) : undefined,
        ),
      );
    const taken: Record<string, FieldMessageKey> = {};
    for (const row of rows as Record<string, boolean>[]) {
      for (const field of asked) if (row[field]) taken[field] = TAKEN;
    }
    if (Object.keys(taken).length > 0) throw new ActionError("invalid_input", taken);
  }

  async function lockEntry(tx: Executor, id: string): Promise<Saved | null> {
    await tx.execute(tableLock);
    const [row] = await tx
      .select(columns)
      .from(table)
      .where(and(eq(table.id, id), lockable))
      .for("update");
    return (row as Saved | undefined) ?? null;
  }

  /** The parent kept on an update or activate row, when `within.onEveryRow` (plan of 1.8). */
  async function parentOf(tx: Executor, entry: Saved): Promise<AuditRecord> {
    if (!within?.onEveryRow) return {};
    return within.shown(tx, (entry as Record<string, unknown>)[within.key] as string);
  }

  function pick(values: Partial<Fields>, keys: readonly Key[]): Partial<Fields> {
    return Object.fromEntries(keys.map((key) => [key, values[key]])) as Partial<Fields>;
  }

  /** What the history keeps of a whole entry: every field and the active flag. */
  function shown(entry: Saved) {
    return { ...pick(entry, fields), isActive: entry.isActive };
  }

  const shape = config.shape as Record<string, z.ZodType>;

  const createInput = z.object({
    clientKey: z.string().refine(isClientKey),
    ...(within ? { [within.key]: z.uuid() } : {}),
    ...shape,
    ...(config.createShape as Record<string, z.ZodType> | undefined),
  });

  const create = defineAction({
    name: `create${config.name}`,
    permission: "catalog.manage",
    input: createInput,
    async target() {
      return GLOBAL_TARGET;
    },
    repeat: {
      clientKey: (input) => input.clientKey,
      // The maker is the actor of the entry's own `<prefix>.create` row: the tables have no maker
      // column (review of the 1.2 plan, correction 1; plan of 1.5, decision 7).
      async find(tx, clientKey) {
        const [row] = await tx
          .select({ ...columns, userId: auditLog.actorId })
          .from(table)
          .innerJoin(
            auditLog,
            and(
              eq(auditLog.entity, entity),
              eq(auditLog.action, action("create")),
              eq(auditLog.entityId, sql`${table.id}::text`),
            ),
          )
          .where(eq(table.clientKey, clientKey));
        if (!row) return null;
        const { userId, ...result } = row as Record<string, unknown> & { userId: string };
        return { result: result as Saved, userId, branchId: null };
      },
    },
    async write({ tx, input, userId }): Promise<Saved> {
      await tx.execute(tableLock);
      const sent = pick(input as unknown as Partial<Fields>, fields);
      const parentId = within ? ((input as Record<string, unknown>)[within.key] as string) : null;
      if (within) await within.check(tx, parentId!);
      if (guard) await guard({ tx, userId }, sent, null);
      await refuseTaken(tx, sent, null, parentId);
      const [row] = await tx
        .insert(table)
        .values({
          ...sent,
          ...(within ? { [within.key]: parentId } : {}),
          isActive: true,
          clientKey: input.clientKey,
          createdAt: now(),
        } as never)
        .returning(columns);
      if (afterInsert) await afterInsert({ tx, userId }, row as Saved);
      return row as Saved;
    },
    async history({ tx, userId }, entry) {
      // The parent's id is a field of the entry; its code is read here, as it is now (decision 7).
      const parent = within
        ? await within.shown(tx, (entry as Record<string, unknown>)[within.key] as string)
        : {};
      await audit(
        { tx, userId },
        {
          action: action("create"),
          entity,
          entityId: entry.id,
          before: null,
          after: {
            ...parent,
            ...shown(entry),
            ...(shownRefs ? await shownRefs(tx, pick(entry, fields)) : {}),
          },
          at: now(),
        },
      );
    },
  });

  /**
   * Only the fields the Head changed are sent (plan of 1.5, decision 8). A create-only field is not
   * part of it: one sent anyway is dropped by the parse (plan of 1.7, decision 2).
   */
  const updateInput = z.object({
    id: z.uuid(),
    ...Object.fromEntries(
      Object.entries(shape)
        .filter(([key]) => !createOnly.has(key))
        .map(([key, check]) => [key, check.optional()]),
    ),
  });

  const update = defineAction({
    name: `update${config.name}`,
    permission: "catalog.manage",
    input: updateInput,
    async target() {
      return GLOBAL_TARGET;
    },
    async lock({ tx, input }) {
      const row = await lockEntry(tx, input.id);
      return row ? { target: GLOBAL_TARGET, rows: row } : null;
    },
    // An inactive entry is edited too, so its name can be freed (D41).
    async write({ tx, input, locked, userId }): Promise<UpdatedEntry<Fields>> {
      const current = locked!.rows;
      const sent = pick(input as unknown as Partial<Fields>, fields);
      const changed = changedCatalogFields(fields, current, sent);
      if (changed.length === 0) return { entry: current, changed, before: {}, after: {} };
      const after = pick(sent, changed);
      const parentId = within ? ((current as Record<string, unknown>)[within.key] as string) : null;
      if (guard) await guard({ tx, userId }, after, current);
      await refuseTaken(tx, after, current.id, parentId);
      const [row] = await tx
        .update(table)
        .set(after as never)
        .where(eq(table.id, current.id))
        .returning(columns);
      return { entry: row as Saved, changed, before: pick(current, changed), after };
    },
    async history({ tx, userId }, result) {
      // No change, no row (04 rule 9 shows changes, not saves).
      if (result.changed.length === 0) return;
      const parent = await parentOf(tx, result.entry);
      await audit(
        { tx, userId },
        {
          action: action("update"),
          entity,
          entityId: result.entry.id,
          before: {
            ...parent,
            ...result.before,
            ...(shownRefs ? await shownRefs(tx, result.before) : {}),
          },
          after: {
            ...parent,
            ...result.after,
            ...(shownRefs ? await shownRefs(tx, result.after) : {}),
          },
          at: now(),
        },
      );
    },
  });

  const setActive = defineAction({
    name: `set${config.name}Active`,
    permission: "catalog.manage",
    input: z.object({ id: z.uuid(), active: z.boolean() }),
    async target() {
      return GLOBAL_TARGET;
    },
    async lock({ tx, input }) {
      const row = await lockEntry(tx, input.id);
      return row ? { target: GLOBAL_TARGET, rows: row } : null;
    },
    // Deactivating moves nothing: old records keep the entry, the pickers drop it (04 rule 2). A
    // second click of the same is refused.
    async check({ tx, input, locked }) {
      if (locked!.rows.isActive === input.active) throw new ActionError("wrong_status");
      if (checkActive) await checkActive(tx, locked!.rows, input.active);
    },
    async write({ tx, input }): Promise<Saved> {
      const [row] = await tx
        .update(table)
        .set({ isActive: input.active } as never)
        .where(eq(table.id, input.id))
        .returning(columns);
      return row as Saved;
    },
    async history({ tx, userId }, entry) {
      const parent = await parentOf(tx, entry);
      await audit(
        { tx, userId },
        {
          action: action(entry.isActive ? "activate" : "deactivate"),
          entity,
          entityId: entry.id,
          before: { ...parent, isActive: !entry.isActive },
          after: { ...parent, isActive: entry.isActive },
          at: now(),
        },
      );
    },
  });

  /** The table's lock, for a hand-written write of the same table (createSubtype, 1.8). */
  async function lockTable(tx: Executor) {
    await tx.execute(tableLock);
  }

  return { create, update, setActive, lockTable, refuseTaken };
}
