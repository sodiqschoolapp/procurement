import { type SQL, sql } from "drizzle-orm";

import { type AuditAction, type AuditRecord, auditValue } from "@/domain/audit";
import type { Executor } from "@/server/authorize";

import { insertAuditRow } from "./audit-row.mjs";

// audit(): one row of the audit log, inside the caller's transaction (developer-rules.md rule
// 13; build-plan 0.9). An action calls it from its `history` step with `WriteContext.tx`, so the
// change and its row commit together and roll back together (rule 3). It never opens a
// transaction and checks no permission: the action did (plan of 0.9).

export type AuditEntry = {
  action: AuditAction;
  /** The table name: `users`, `settings`. */
  entity: string;
  /** The row's id, or a settings key. */
  entityId: string;
  /** The changed fields before; `null` for a create. */
  before: AuditRecord | null;
  /** The changed fields after. */
  after: AuditRecord | null;
  /** From the injected clock (CLAUDE.md rule 10); no database default. */
  at: Date;
};

/** `$1 … $n` of a statement as bound parameters of Drizzle's `sql`. */
function bound(text: string, values: readonly unknown[]): SQL {
  const parts = text.split(/\$(\d+)/);
  return sql.join(
    parts.map((part, index) =>
      index % 2 === 0 ? sql.raw(part) : sql`${values[Number(part) - 1]}`,
    ),
  );
}

/**
 * Writes one audit row with the action's transaction. The actor is the user the wrapper
 * authorized (`WriteContext.userId`), never a field the action builds: no row is written in
 * another person's name (03-roles-and-permissions.md, Manager rights: "with the Head's name";
 * permission review of 0.9).
 */
export async function audit(
  context: { tx: Executor; userId: string },
  entry: AuditEntry,
): Promise<void> {
  const { tx, userId } = context;
  await insertAuditRow((text, values) => tx.execute(bound(text, values)), {
    ...entry,
    actorId: userId,
    before: entry.before === null ? null : auditValue(entry.before),
    after: entry.after === null ? null : auditValue(entry.after),
  });
}
