import { and, eq, ne, or, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import { type CatalogKind, CATALOGS, changedCatalogFields } from "@/domain/catalogs";
import type { AuditAction } from "@/domain/audit";
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

type AuditPrefix = "unit" | "category" | "extra_cost_type" | "company";

export type CatalogConfig<Fields extends Record<string, unknown>> = {
  kind: CatalogKind;
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
  const { table, prefix } = config;
  const entity = CATALOGS[config.kind].entity;
  const fields = CATALOGS[config.kind].fields.map((field) => field.key) as Key[];
  const action = (verb: string) => `${prefix}.${verb}` as AuditAction;

  // The table's advisory lock: seed 1, apart from the wrapper's client-key locks (seed 0), as the
  // branches' (decisions 1.2 item 7). Every write of one catalog takes it before reading names.
  const tableLock = sql`select pg_advisory_xact_lock(hashtextextended(${entity}, 1))`;

  const columns = {
    id: table.id,
    ...(config.columns as Record<string, AnyPgColumn>),
    isActive: table.isActive,
  };

  /**
   * Refuses a name (or a short name) another entry holds, active or not (D41), as field errors,
   * before the unique indexes refuse it (decision 13 of the plan of 1.2, followed here). Runs under
   * the table's lock, so two saves cannot both pass it.
   */
  async function refuseTaken(tx: Executor, sent: Partial<Fields>, ownId: string | null) {
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
    const [row] = await tx.select(columns).from(table).where(eq(table.id, id)).for("update");
    return (row as Saved | undefined) ?? null;
  }

  function pick(values: Partial<Fields>, keys: readonly Key[]): Partial<Fields> {
    return Object.fromEntries(keys.map((key) => [key, values[key]])) as Partial<Fields>;
  }

  /** What the history keeps of a whole entry: every field and the active flag. */
  function shown(entry: Saved) {
    return { ...pick(entry, fields), isActive: entry.isActive };
  }

  const shape = config.shape as Record<string, z.ZodType>;

  const createInput = z.object({ clientKey: z.string().refine(isClientKey), ...shape });

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
    async write({ tx, input }): Promise<Saved> {
      await tx.execute(tableLock);
      const sent = pick(input as unknown as Partial<Fields>, fields);
      await refuseTaken(tx, sent, null);
      const [row] = await tx
        .insert(table)
        .values({ ...sent, isActive: true, clientKey: input.clientKey, createdAt: now() } as never)
        .returning(columns);
      return row as Saved;
    },
    async history({ tx, userId }, entry) {
      await audit(
        { tx, userId },
        {
          action: action("create"),
          entity,
          entityId: entry.id,
          before: null,
          after: shown(entry),
          at: now(),
        },
      );
    },
  });

  /** Only the fields the Head changed are sent (plan of 1.5, decision 8). */
  const updateInput = z.object({
    id: z.uuid(),
    ...Object.fromEntries(Object.entries(shape).map(([key, check]) => [key, check.optional()])),
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
    async write({ tx, input, locked }): Promise<UpdatedEntry<Fields>> {
      const current = locked!.rows;
      const sent = pick(input as unknown as Partial<Fields>, fields);
      const changed = changedCatalogFields(fields, current, sent);
      if (changed.length === 0) return { entry: current, changed, before: {}, after: {} };
      const after = pick(sent, changed);
      await refuseTaken(tx, after, current.id);
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
      await audit(
        { tx, userId },
        {
          action: action("update"),
          entity,
          entityId: result.entry.id,
          before: result.before,
          after: result.after,
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
    check({ input, locked }) {
      if (locked!.rows.isActive === input.active) throw new ActionError("wrong_status");
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
      await audit(
        { tx, userId },
        {
          action: action(entry.isActive ? "activate" : "deactivate"),
          entity,
          entityId: entry.id,
          before: { isActive: !entry.isActive },
          after: { isActive: entry.isActive },
          at: now(),
        },
      );
    },
  });

  return { create, update, setActive };
}
