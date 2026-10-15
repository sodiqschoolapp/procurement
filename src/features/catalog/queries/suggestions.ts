import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as z from "zod";

import { SUGGESTIONS_PAGE_SIZE, type SuggestionStatus } from "@/domain/suggestions";
import { authorize, authorizeList, branchFilter } from "@/server/authorize";
import { branches, catalogSuggestions, products, users } from "@/server/db/schema";

// Product suggestions, read (04-catalogs.md rule 8; build-plan 1.12). Under catalog.suggest:
// the Head sees every branch, a Manager the suggestions of their own branches, inside the SQL
// (developer-rules.md rule 4; plan of 1.12, decision 1, Look first); Principal and Finance are
// forbidden. One suggestion of another branch is "Not found" (03 rule 1). The count of pending
// ones for the Head's /catalog row is under catalog.manage.

export type SuggestionRow = {
  id: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  name: string;
  unitText: string;
  photoFileId: string | null;
  note: string | null;
  status: SuggestionStatus;
  suggestedBy: string;
  suggestedByName: string;
  createdAt: Date;
  decidedByName: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  productId: string | null;
  productName: string | null;
};

export type SuggestionPage = { rows: SuggestionRow[]; page: number; pages: number; total: number };

const branchInput = z.uuid().nullable().catch(null);

const suggester = alias(users, "suggester");
const decider = alias(users, "decider");

const columns = {
  id: catalogSuggestions.id,
  branchId: catalogSuggestions.branchId,
  branchCode: branches.code,
  branchName: branches.name,
  name: catalogSuggestions.name,
  unitText: catalogSuggestions.unitText,
  photoFileId: catalogSuggestions.photoFileId,
  note: catalogSuggestions.note,
  status: catalogSuggestions.status,
  suggestedBy: catalogSuggestions.suggestedBy,
  suggestedByName: suggester.fullName,
  createdAt: catalogSuggestions.createdAt,
  decidedByName: decider.fullName,
  decidedAt: catalogSuggestions.decidedAt,
  decisionNote: catalogSuggestions.decisionNote,
  productId: catalogSuggestions.productId,
  productName: products.name,
};

/**
 * One page of suggestions: of the branch view's branch, or of every branch the person sees when
 * `branchId` is null; pending first, then newest. A page past the last gives the last. A branch
 * view is authorized on that branch, so another branch is "Not found" (03 rule 1); the branch
 * filter stays in the SQL either way.
 */
export async function listSuggestions(
  userId: string,
  options: { page?: number; branchId?: string | null } = {},
): Promise<SuggestionPage> {
  const branchId = branchInput.parse(options.branchId ?? null);
  const actor = branchId
    ? await authorize(userId, "catalog.suggest", { branchId })
    : await authorizeList(userId, "catalog.suggest");
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const where = and(
    branchFilter(actor, catalogSuggestions.branchId),
    branchId ? eq(catalogSuggestions.branchId, branchId) : undefined,
  );
  const [totals] = await db.select({ total: count() }).from(catalogSuggestions).where(where);
  const total = totals?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / SUGGESTIONS_PAGE_SIZE));
  const asked = Number.isInteger(options.page) && options.page! >= 1 ? options.page! : 1;
  const page = Math.min(asked, pages);
  const rows = await db
    .select(columns)
    .from(catalogSuggestions)
    .innerJoin(branches, eq(branches.id, catalogSuggestions.branchId))
    .innerJoin(suggester, eq(suggester.id, catalogSuggestions.suggestedBy))
    .leftJoin(decider, eq(decider.id, catalogSuggestions.decidedBy))
    .leftJoin(products, eq(products.id, catalogSuggestions.productId))
    .where(where)
    .orderBy(
      desc(sql`${catalogSuggestions.status} = 'PENDING'`),
      desc(catalogSuggestions.createdAt),
      asc(catalogSuggestions.id),
    )
    .limit(SUGGESTIONS_PAGE_SIZE)
    .offset((page - 1) * SUGGESTIONS_PAGE_SIZE);
  return { rows, page, pages, total };
}

/**
 * One suggestion, or `null` for an id that is unknown or not an id at all. Another branch's is
 * "Not found" through authorize() on the row's own branch (03 rule 1).
 */
export async function getSuggestion(userId: string, id: string): Promise<SuggestionRow | null> {
  if (!z.uuid().safeParse(id).success) {
    await authorizeList(userId, "catalog.suggest");
    return null;
  }
  const { db } = await import("@/server/db/client");
  const [branch] = await db
    .select({ branchId: catalogSuggestions.branchId })
    .from(catalogSuggestions)
    .where(eq(catalogSuggestions.id, id));
  if (!branch) {
    await authorizeList(userId, "catalog.suggest");
    return null;
  }
  const actor = await authorize(userId, "catalog.suggest", { branchId: branch.branchId });
  const [row] = await db
    .select(columns)
    .from(catalogSuggestions)
    .innerJoin(branches, eq(branches.id, catalogSuggestions.branchId))
    .innerJoin(suggester, eq(suggester.id, catalogSuggestions.suggestedBy))
    .leftJoin(decider, eq(decider.id, catalogSuggestions.decidedBy))
    .leftJoin(products, eq(products.id, catalogSuggestions.productId))
    .where(and(eq(catalogSuggestions.id, id), branchFilter(actor, catalogSuggestions.branchId)));
  return row ?? null;
}

/** How many suggestions wait for the Head, for the row on /catalog. */
export async function countPendingSuggestions(userId: string): Promise<number> {
  await authorize(userId, "catalog.manage");
  const { db } = await import("@/server/db/client");
  const [row] = await db
    .select({ pending: count() })
    .from(catalogSuggestions)
    .where(eq(catalogSuggestions.status, "PENDING"));
  return row?.pending ?? 0;
}
