import { and, desc, eq, or } from "drizzle-orm";
import * as z from "zod";

import type { AuditObject } from "@/domain/audit";
import { authorize } from "@/server/authorize";
import { auditLog, users } from "@/server/db/schema";

// The change history of one record (04-catalogs.md rule 9: "who changed what and when";
// build-plan 0.9). Head only, through "Manage catalogs, users, branches, settings": every page
// that shows it is the Head's (plan of 0.9, decision 3, Look first). Filtered on both `entity`
// and `entity_id` in the SQL, newest first, 50 a page (developer-rules.md rule 12).
// It has no branch filter, because the Head sees every branch. Before a permission another role
// holds is given to it, it needs branchFilter() on the audited record's branch: otherwise a
// branch's history would show to another branch (developer-rules.md rule 4; permission review
// of 0.9).

const CHANGE_HISTORY_PAGE_SIZE = 50;

const record = {
  entity: z.string().regex(/^[a-z][a-z_]*$/),
  entityId: z.string().trim().min(1).max(200),
};

const changeHistoryInput = z.object({
  ...record,
  /**
   * The rows of one more record shown with it: the `price.add` rows of a product's hidden default
   * subtype on the product's page (04 rule 9; plan review of 1.9, Should fix 5).
   */
  also: z.object(record).optional(),
  page: z.number().int().min(1).default(1),
});

export type ChangeHistoryRow = {
  id: string;
  action: string;
  actorName: string;
  before: AuditObject | null;
  after: AuditObject | null;
  createdAt: Date;
};

export type ChangeHistoryPage = { rows: ChangeHistoryRow[]; page: number; hasMore: boolean };

/** One page of the audit rows of one record, with the name of who made each. */
export async function listChangeHistory(
  userId: string,
  rawInput: z.input<typeof changeHistoryInput>,
): Promise<ChangeHistoryPage> {
  await authorize(userId, "catalog.manage");
  const input = changeHistoryInput.parse(rawInput);

  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const found = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorName: users.fullName,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .where(
      or(
        and(eq(auditLog.entity, input.entity), eq(auditLog.entityId, input.entityId)),
        input.also
          ? and(eq(auditLog.entity, input.also.entity), eq(auditLog.entityId, input.also.entityId))
          : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(CHANGE_HISTORY_PAGE_SIZE + 1)
    .offset((input.page - 1) * CHANGE_HISTORY_PAGE_SIZE);

  const rows = found.slice(0, CHANGE_HISTORY_PAGE_SIZE).map((row) => ({
    ...row,
    before: row.before as AuditObject | null,
    after: row.after as AuditObject | null,
  }));
  return { rows, page: input.page, hasMore: found.length > CHANGE_HISTORY_PAGE_SIZE };
}
