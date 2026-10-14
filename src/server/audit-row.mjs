// The one statement that writes an audit row (developer-rules.md rule 13). Plain .mjs, so the
// first-Head script (scripts/first-head.mjs) writes its row the same way as audit() of
// src/server/audit.ts (plan of 0.9; decisions 0.2: no tsx). The caller gives the query and so
// the transaction; this file never opens one.
import { refuseSecretFields } from "../domain/audit-secrets.mjs";

/**
 * @typedef {{ [key: string]: unknown }} AuditObject
 * @typedef {{
 *   actorId: string,
 *   action: string,
 *   entity: string,
 *   entityId: string,
 *   before: AuditObject | null,
 *   after: AuditObject | null,
 *   at: Date,
 * }} AuditRow
 */

export const INSERT_AUDIT_ROW = `insert into audit_log
     (actor_id, action, entity, entity_id, before, after, created_at)
   values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`;

/**
 * Writes one audit row through `query`, in the caller's transaction. `before` and `after` are
 * already JSON values (src/domain/audit.ts, auditValue()); a secret field name is refused.
 * @param {(text: string, values: unknown[]) => Promise<unknown>} query
 * @param {AuditRow} row
 * @returns {Promise<void>}
 */
export async function insertAuditRow(query, row) {
  refuseSecretFields(row.before);
  refuseSecretFields(row.after);
  if (!(row.at instanceof Date) || Number.isNaN(row.at.getTime())) {
    throw new Error("Refused: an audit row needs the moment of the clock (CLAUDE.md rule 10).");
  }
  await query(INSERT_AUDIT_ROW, [
    row.actorId,
    row.action,
    row.entity,
    row.entityId,
    row.before === null ? null : JSON.stringify(row.before),
    row.after === null ? null : JSON.stringify(row.after),
    row.at,
  ]);
}
