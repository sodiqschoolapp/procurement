import { and, eq, ne, or, sql } from "drizzle-orm";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import {
  type BranchField,
  type BranchFields,
  branchAddress,
  branchName,
  changedBranchFields,
  isBranchAddress,
  isBranchCode,
  isBranchName,
} from "@/domain/branches";
import { FINISHED_REQUEST_STATUSES } from "@/domain/request-status";
import { GLOBAL_TARGET, ActionError, defineAction } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import { audit } from "@/server/audit";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { auditLog, branches, orders, stockBalances, stockDocuments } from "@/server/db/schema";

// The Head's branches (build-plan 1.2; 04-catalogs.md, Catalogs table: Branches; rules 2, 3, 9).
// "Manage catalogs, users, branches, settings": catalog.manage, Head only, global (03, Permission
// matrix). Nothing deletes a branch: it is deactivated, and can be activated again (04 rule 2;
// plan of 1.2, decision 6). Every change writes its audit row in the same transaction (04 rule 9;
// developer-rules.md rule 13), entity `branches`, as the seed's rows have it (decision 10). No
// version column: two Heads saving at once each write only the fields they changed, under the
// row lock (decision 1, Look first).

/** The branches advisory lock: seed 1, apart from the wrapper's client-key locks (seed 0). */
const BRANCHES_LOCK = sql`select pg_advisory_xact_lock(hashtextextended('branches', 1))`;

const TAKEN: FieldMessageKey = "errors.field.taken";

const name = z.string().transform(branchName).refine(isBranchName);
const code = z.string().refine(isBranchCode);
const address = z.string().transform(branchAddress).refine(isBranchAddress);

/** The name as the unique index `branches_name_key` compares it; never a JavaScript copy. */
function comparedName(value: unknown) {
  return sql`lower(regexp_replace(btrim(${value}), '\\s+', ' ', 'g'))`;
}

/**
 * Refuses a code or a name another branch holds, active or not (decisions 0.7 item 11), as field
 * errors, before the unique constraints refuse it (plan of 1.2, decision 7). Runs under
 * BRANCHES_LOCK, so two saves cannot both pass it.
 */
async function refuseTaken(
  tx: Executor,
  sent: Partial<BranchFields>,
  ownId: string | null,
): Promise<void> {
  if (sent.code === undefined && sent.name === undefined) return;
  const held = [];
  if (sent.code !== undefined) held.push(eq(branches.code, sent.code));
  if (sent.name !== undefined) {
    held.push(sql`${comparedName(branches.name)} = ${comparedName(sent.name)}`);
  }
  const rows = await tx
    .select({
      code: branches.code,
      sameName:
        sent.name === undefined
          ? sql<boolean>`false`
          : sql<boolean>`${comparedName(branches.name)} = ${comparedName(sent.name)}`,
    })
    .from(branches)
    .where(and(or(...held), ownId === null ? undefined : ne(branches.id, ownId)));
  const fields: Record<string, FieldMessageKey> = {};
  for (const row of rows) {
    if (sent.code !== undefined && row.code === sent.code) fields.code = TAKEN;
    if (row.sameName) fields.name = TAKEN;
  }
  if (Object.keys(fields).length > 0) throw new ActionError("invalid_input", fields);
}

export type SavedBranch = BranchFields & { id: string; isActive: boolean };

const branchColumns = {
  id: branches.id,
  name: branches.name,
  code: branches.code,
  address: branches.address,
  isActive: branches.isActive,
};

async function lockBranch(tx: Executor, id: string): Promise<SavedBranch | null> {
  await tx.execute(BRANCHES_LOCK);
  const [row] = await tx
    .select(branchColumns)
    .from(branches)
    .where(eq(branches.id, id))
    .for("update");
  return row ?? null;
}

export const createBranchInput = z.object({
  clientKey: z.string().refine(isClientKey),
  name,
  code,
  address,
});

export type CreateBranchInput = z.input<typeof createBranchInput>;

export const createBranch = defineAction({
  name: "createBranch",
  permission: "catalog.manage",
  input: createBranchInput,
  async target() {
    return GLOBAL_TARGET;
  },
  repeat: {
    clientKey: (input) => input.clientKey,
    // The maker is the actor of the branch's own `branch.create` row: branches has no maker
    // column (plan review of 1.2, correction 1). A seed branch has no client key.
    async find(tx, clientKey) {
      const [row] = await tx
        .select({ ...branchColumns, userId: auditLog.actorId })
        .from(branches)
        .innerJoin(
          auditLog,
          and(
            eq(auditLog.entity, "branches"),
            eq(auditLog.action, "branch.create"),
            eq(auditLog.entityId, sql`${branches.id}::text`),
          ),
        )
        .where(eq(branches.clientKey, clientKey));
      if (!row) return null;
      const { userId, ...result } = row;
      return { result, userId, branchId: null };
    },
  },
  async write({ tx, input }): Promise<SavedBranch> {
    await tx.execute(BRANCHES_LOCK);
    await refuseTaken(tx, input, null);
    const [row] = await tx
      .insert(branches)
      .values({
        name: input.name,
        code: input.code,
        address: input.address,
        isActive: true,
        clientKey: input.clientKey,
        createdAt: now(),
      })
      .returning(branchColumns);
    return row!;
  },
  async history({ tx, userId }, branch) {
    await audit(
      { tx, userId },
      {
        action: "branch.create",
        entity: "branches",
        entityId: branch.id,
        before: null,
        after: {
          name: branch.name,
          code: branch.code,
          address: branch.address,
          isActive: branch.isActive,
        },
        at: now(),
      },
    );
  },
});

/** Only the fields the Head changed are sent (plan of 1.2, decision 1). */
export const updateBranchInput = z.object({
  id: z.uuid(),
  name: name.optional(),
  code: code.optional(),
  address: address.optional(),
});

export type UpdateBranchInput = z.input<typeof updateBranchInput>;

export type UpdatedBranch = {
  branch: SavedBranch;
  changed: BranchField[];
  before: Partial<BranchFields>;
  after: Partial<BranchFields>;
};

function pick(
  values: Partial<BranchFields>,
  fields: readonly BranchField[],
): Partial<BranchFields> {
  return Object.fromEntries(fields.map((field) => [field, values[field]]));
}

/**
 * Whether the branch's code is locked: it has an order with a number (04 Catalogs table,
 * Branches: "It locks after the first order"; plan of 2.7, decided item 8, Look first). The
 * trigger `branches_code_locked` of migration 0021 says the same as the last defence.
 */
export async function branchCodeLocked(tx: Executor, branchId: string): Promise<boolean> {
  const [row] = await tx
    .select({ one: sql<number>`1` })
    .from(orders)
    .where(and(eq(orders.branchId, branchId), sql`${orders.number} is not null`))
    .limit(1);
  return row !== undefined;
}

export const updateBranch = defineAction({
  name: "updateBranch",
  permission: "catalog.manage",
  input: updateBranchInput,
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx, input }) {
    const row = await lockBranch(tx, input.id);
    return row ? { target: GLOBAL_TARGET, rows: row } : null;
  },
  // An inactive branch is edited too, so its name can be freed (D41; decisions 0.7 item 11). The
  // code is free to change until the branch's first numbered order locks it (plan of 2.7, decided
  // item 8); the branch row is locked FOR UPDATE, and a submit holds it FOR SHARE, so the two
  // cannot pass each other.
  async write({ tx, input, locked }): Promise<UpdatedBranch> {
    const current = locked!.rows;
    const { id, ...sent } = input;
    const changed = changedBranchFields(current, sent);
    if (changed.length === 0) return { branch: current, changed, before: {}, after: {} };
    if (changed.includes("code") && (await branchCodeLocked(tx, id))) {
      throw new ActionError("invalid_input", { code: "errors.field.locked" });
    }
    const after = pick(sent, changed);
    await refuseTaken(tx, after, id);
    const [row] = await tx
      .update(branches)
      .set(after)
      .where(eq(branches.id, id))
      .returning(branchColumns);
    return { branch: row!, changed, before: pick(current, changed), after };
  },
  async history({ tx, userId }, result) {
    // No change, no row (04 rule 9 shows changes, not saves; plan review, correction 3).
    if (result.changed.length === 0) return;
    await audit(
      { tx, userId },
      {
        action: "branch.update",
        entity: "branches",
        entityId: result.branch.id,
        before: result.before,
        after: result.after,
        at: now(),
      },
    );
  },
});

export const setBranchActiveInput = z.object({ id: z.uuid(), active: z.boolean() });

export const setBranchActive = defineAction({
  name: "setBranchActive",
  permission: "catalog.manage",
  input: setBranchActiveInput,
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx, input }) {
    const row = await lockBranch(tx, input.id);
    return row ? { target: GLOBAL_TARGET, rows: row } : null;
  },
  // A second click of the same is refused. Deactivating moves nothing: users, stock and records
  // stay (decision 2, Look first). It is refused while the branch has unfinished orders or stock
  // above 0, each named with its count (edge-cases/requests-and-approval.md, "The Head wants to
  // close a branch"; plan of 5.12, decided items 1 and 2, Look first), or while a transfer from or
  // to it is In transit: its goods are still stock of the two branches, and a closed branch could
  // not receive them (plan of 7.1, decided item 4, Look first). Read under the branch row's
  // FOR UPDATE lock: drafts, submit and the warehouse documents hold the branch FOR SHARE, so they
  // queue behind it and then find it inactive (decided item 4, Look first).
  async check({ tx, input, locked }) {
    if (locked!.rows.isActive === input.active) throw new ActionError("wrong_status");
    if (input.active) return;
    const [left] = await tx
      .select({
        // A draft never submitted (DRAFT without a number, isNeverSubmitted() of
        // src/domain/drafts.ts) is no order of the approval flow yet and does not block.
        orders: sql<number>`(select count(*)::int from ${orders}
          where ${orders.branchId} = ${input.id}
            and ${orders.status}::text not in (${sql.join(
              FINISHED_REQUEST_STATUSES.map((status) => sql`${status}`),
              sql`, `,
            )})
            and not (${orders.status} = 'DRAFT' and ${orders.number} is null))`,
        stock: sql<number>`(select count(*)::int from ${stockBalances}
          where ${stockBalances.branchId} = ${input.id} and ${stockBalances.qty} > 0)`,
        transfers: sql<number>`(select count(*)::int from ${stockDocuments}
          where ${stockDocuments.type} = 'TRANSFER' and ${stockDocuments.status} = 'IN_TRANSIT'
            and (${stockDocuments.branchId} = ${input.id}
              or ${stockDocuments.toBranchId} = ${input.id}))`,
      })
      .from(sql`(select 1) as one`);
    const fields: Record<string, FieldMessageKey> = {};
    const counts: Record<string, string> = {};
    if (left!.orders > 0) {
      fields.orders = "errors.field.unfinishedOrders";
      counts.orders = String(left!.orders);
    }
    if (left!.stock > 0) {
      fields.stock = "errors.field.stockLeft";
      counts.stock = String(left!.stock);
    }
    if (left!.transfers > 0) {
      fields.transfers = "errors.field.transfersInTransit";
      counts.transfers = String(left!.transfers);
    }
    if (Object.keys(fields).length > 0) throw new ActionError("invalid_input", fields, counts);
  },
  async write({ tx, input }): Promise<SavedBranch> {
    const [row] = await tx
      .update(branches)
      .set({ isActive: input.active })
      .where(eq(branches.id, input.id))
      .returning(branchColumns);
    return row!;
  },
  async history({ tx, userId }, branch) {
    await audit(
      { tx, userId },
      {
        action: branch.isActive ? "branch.activate" : "branch.deactivate",
        entity: "branches",
        entityId: branch.id,
        before: { isActive: !branch.isActive },
        after: { isActive: branch.isActive },
        at: now(),
      },
    );
  },
});
