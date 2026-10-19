import { and, count, desc, eq, sql } from "drizzle-orm";
import * as z from "zod";

import { DOCUMENTS_PAGE_SIZE, type DocumentStatus } from "@/domain/stock-documents";
import { authorize, authorizeList, branchFilter } from "@/server/authorize";
import { branches, stockDocuments, users } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

// The counts of /warehouse/counts (09-warehouse.md, Other documents, Stock count; 11-screens-and-
// ux.md, Screens: "Stock counts | /warehouse/counts | Manager, Head"; plan of 7.3). Under
// `data.view` with the branch inside the SQL (03 matrix "See orders, stock and reports";
// developer-rules.md rule 4): a count is of its own branch only (documentWall() opens a transfer
// only; progress 7.2). An asked branch the user may not see is "Not found" (03 rule 1). Newest
// first, 25 a page; each count with how many of its lines are counted. Count and rows in one
// snapshot (.claude/rules/server-actions.md). Which roles open the page is the page's (11 Screens).

export type CountRow = {
  id: string;
  number: string;
  status: DocumentStatus;
  docDate: string;
  branchCode: string;
  createdBy: string;
  /** The lines of the count, and how many of them carry a counted quantity. */
  lines: number;
  counted: number;
};

export type CountsPage = { rows: CountRow[]; page: number; pages: number; found: number };

const idInput = z.uuid().nullable().catch(null);

/** One page of the counts the user sees, newest first; a page past the last gives the last. */
export async function listCounts(
  userId: string,
  filters: { branch?: string | null } = {},
  page = 1,
): Promise<CountsPage> {
  const actor = await authorizeList(userId, "data.view");
  const branch = idInput.parse(filters.branch ?? null);
  if (branch) await authorize(userId, "data.view", { branchId: branch });

  const where = and(
    eq(stockDocuments.type, "COUNT"),
    branchFilter(actor, stockDocuments.branchId),
    branch ? eq(stockDocuments.branchId, branch) : undefined,
  );
  return readSnapshot(async (db) => {
    const [total] = await db.select({ found: count() }).from(stockDocuments).where(where);
    const found = total?.found ?? 0;
    const pages = Math.max(1, Math.ceil(found / DOCUMENTS_PAGE_SIZE));
    const shown = Math.min(Number.isInteger(page) && page >= 1 ? page : 1, pages);
    const rows = await db
      .select({
        id: stockDocuments.id,
        number: stockDocuments.number,
        status: stockDocuments.status,
        docDate: stockDocuments.docDate,
        branchCode: branches.code,
        createdBy: users.fullName,
        lines: sql<number>`(select count(*)::int from stock_document_lines l
          where l.document_id = ${stockDocuments.id})`,
        counted: sql<number>`(select count(*)::int from stock_document_lines l
          where l.document_id = ${stockDocuments.id} and l.counted_qty is not null)`,
      })
      .from(stockDocuments)
      .innerJoin(branches, eq(branches.id, stockDocuments.branchId))
      .innerJoin(users, eq(users.id, stockDocuments.createdBy))
      .where(where)
      .orderBy(
        desc(stockDocuments.docDate),
        desc(stockDocuments.createdAt),
        desc(stockDocuments.id),
      )
      .limit(DOCUMENTS_PAGE_SIZE)
      .offset((shown - 1) * DOCUMENTS_PAGE_SIZE);
    return { rows, page: shown, pages, found };
  });
}
