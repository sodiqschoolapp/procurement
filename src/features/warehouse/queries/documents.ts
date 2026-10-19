import { type SQL, and, asc, count, desc, eq, gte, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as z from "zod";

import { isBusinessDate } from "@/domain/business-date";
import {
  DOCUMENTS_PAGE_SIZE,
  DOCUMENT_TYPES,
  type DocumentStatus,
  type DocumentType,
} from "@/domain/stock-documents";
import type { Actor } from "@/domain/permissions";
import { authorize, authorizeList, branchFilter } from "@/server/authorize";
import { branches, departments, stockDocuments, users } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

// Warehouse documents, /warehouse/documents (09-warehouse.md, Stock screens: Documents; 11-
// screens-and-ux.md, Screens: "Warehouse documents | All", rules 8 and 12; plan of 5.12). Under
// `data.view` with the branch inside the SQL (03 matrix "See orders, stock and reports": Head all
// branches, Manager own branches, Principal own branch, Finance own branches; developer-rules.md
// rule 4); an asked branch the user may not see is "Not found" (03 rule 1). Every type is listed,
// direct entries too (decided item 5). A transfer is listed for its sending and its receiving
// branch (documentWall(); plan of 7.2, decided item 3, Look first). Filters by type, by date from and to on the document's
// Tashkent business date (decided item 6) and by department; no money (decided item 7). Count
// and rows in one snapshot (.claude/rules/server-actions.md).

export type DocumentRow = {
  id: string;
  number: string;
  type: DocumentType;
  status: DocumentStatus;
  docDate: string;
  branchCode: string;
  /** A transfer's receiving branch; null for the other types. */
  toBranchCode: string | null;
  /** An issue's or a return's department; null for the other types. */
  departmentName: string | null;
  createdBy: string;
};

export type DocumentsPage = { rows: DocumentRow[]; page: number; pages: number; found: number };

export type DocumentFilters = {
  branch?: string | null;
  type?: string | null;
  /** `YYYY-MM-DD`, the first and last business date shown. */
  from?: string | null;
  to?: string | null;
  department?: string | null;
};

export type DepartmentChoice = {
  id: string;
  name: string;
  branchCode: string;
  isActive: boolean;
};

const idInput = z.uuid().nullable().catch(null);

/**
 * The branch wall of a warehouse document, inside the SQL (03 rule 1; developer-rules.md rule 4):
 * a document of one of the user's branches, or a transfer to one of them (09 Other documents,
 * Transfer: "The receiving Manager enters what really arrived"; plan of 7.2, decided item 3, Look
 * first). The Head sees every branch: no condition. The one wall of the list, the page and the
 * note.
 */
export function documentWall(actor: Actor): SQL | undefined {
  const own = branchFilter(actor, stockDocuments.branchId);
  if (!own) return undefined;
  return or(
    own,
    and(eq(stockDocuments.type, "TRANSFER"), branchFilter(actor, stockDocuments.toBranchId)),
  );
}

/** The asked branch: the document's own, or a transfer's receiving branch. */
function ofBranch(branchId: string): SQL {
  return or(
    eq(stockDocuments.branchId, branchId),
    and(eq(stockDocuments.type, "TRANSFER"), eq(stockDocuments.toBranchId, branchId)),
  )!;
}
const typeInput = z.enum(DOCUMENT_TYPES).nullable().catch(null);
const dateInput = z.string().refine(isBusinessDate).nullable().catch(null);

/**
 * One page of the documents the user sees, newest first: by date, then by when each was made. A
 * filter that is not a type, a date or an id is ignored; a page past the last gives the last.
 */
export async function listStockDocuments(
  userId: string,
  filters: DocumentFilters = {},
  page = 1,
): Promise<DocumentsPage> {
  const actor = await authorizeList(userId, "data.view");
  const branch = idInput.parse(filters.branch ?? null);
  const type = typeInput.parse(filters.type ?? null);
  const from = dateInput.parse(filters.from ?? null);
  const to = dateInput.parse(filters.to ?? null);
  const department = idInput.parse(filters.department ?? null);
  if (branch) await authorize(userId, "data.view", { branchId: branch });

  const where = and(
    documentWall(actor),
    branch ? ofBranch(branch) : undefined,
    type ? eq(stockDocuments.type, type) : undefined,
    from ? gte(stockDocuments.docDate, from) : undefined,
    to ? lte(stockDocuments.docDate, to) : undefined,
    department ? eq(stockDocuments.departmentId, department) : undefined,
  );

  const toBranch = alias(branches, "to_branch");
  return readSnapshot(async (db) => {
    const [total] = await db.select({ found: count() }).from(stockDocuments).where(where);
    const found = total?.found ?? 0;
    const pages = Math.max(1, Math.ceil(found / DOCUMENTS_PAGE_SIZE));
    const shown = Math.min(Number.isInteger(page) && page >= 1 ? page : 1, pages);
    const rows = await db
      .select({
        id: stockDocuments.id,
        number: stockDocuments.number,
        type: stockDocuments.type,
        status: stockDocuments.status,
        docDate: stockDocuments.docDate,
        branchCode: branches.code,
        toBranchCode: toBranch.code,
        departmentName: departments.name,
        createdBy: users.fullName,
      })
      .from(stockDocuments)
      .innerJoin(branches, eq(branches.id, stockDocuments.branchId))
      .leftJoin(toBranch, eq(toBranch.id, stockDocuments.toBranchId))
      .innerJoin(users, eq(users.id, stockDocuments.createdBy))
      .leftJoin(departments, eq(departments.id, stockDocuments.departmentId))
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

/**
 * The department filter's choices: the departments of the branches the user sees, or of the asked
 * branch, inactive ones too, since old documents name them (04 rule 2; decided item 6). By branch
 * code, then name.
 */
export async function documentDepartmentChoices(
  userId: string,
  branchId: string | null = null,
): Promise<DepartmentChoice[]> {
  const actor = await authorizeList(userId, "data.view");
  const branch = idInput.parse(branchId);
  if (branch) await authorize(userId, "data.view", { branchId: branch });
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  return db
    .select({
      id: departments.id,
      name: departments.name,
      branchCode: branches.code,
      isActive: departments.isActive,
    })
    .from(departments)
    .innerJoin(branches, eq(branches.id, departments.branchId))
    .where(
      and(
        branchFilter(actor, departments.branchId),
        branch ? eq(departments.branchId, branch) : undefined,
      ),
    )
    .orderBy(asc(branches.code), asc(departments.name), asc(departments.id));
}
