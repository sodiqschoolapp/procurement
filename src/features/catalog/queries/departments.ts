import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import * as z from "zod";

import { CATALOG_PAGE_SIZE } from "@/domain/catalogs";
import { authorize } from "@/server/authorize";
import { branches, departments } from "@/server/db/schema";

// Departments, read (build-plan 1.6; 04-catalogs.md rules 2 and 3). The Head's list and one
// department are under "Manage catalogs, users, branches, settings": catalog.manage, Head only
// (03). The Head sees every branch, so the list's branch is a filter, the branch view of the top
// bar, not the branch wall (plan of 1.6, decision 10; plan review). Inactive departments stay in
// the list (04 rule 2). A picker comes with the first task that picks a department (Left out).

export type DepartmentRow = {
  id: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  name: string;
  responsibleName: string | null;
  responsiblePhone: string | null;
  isActive: boolean;
};

export type DepartmentPage = {
  rows: DepartmentRow[];
  page: number;
  pages: number;
  /** Every department of the view, not only the search's. */
  active: number;
  inactive: number;
  /** How many match the search (all when there is none). */
  found: number;
};

const searchInput = z.string().trim().max(200).catch("");
const branchInput = z.uuid().nullable().catch(null);

const columns = {
  id: departments.id,
  branchId: departments.branchId,
  branchCode: branches.code,
  branchName: branches.name,
  name: departments.name,
  responsibleName: departments.responsibleName,
  responsiblePhone: departments.responsiblePhone,
  isActive: departments.isActive,
};

/** `%`, `_` and `\` typed by a person are matched as themselves (as 1.5, decision 13). */
function containing(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * One page of departments for the Head: of one branch, or of every branch when `branchId` is
 * null; active first, then by branch name and name (decision 8). `q` finds part of the name, the
 * responsible person's name or the phone, any case. A page past the last gives the last.
 */
export async function listDepartments(
  userId: string,
  options: { page?: number; q?: string; branchId?: string | null } = {},
): Promise<DepartmentPage> {
  await authorize(userId, "catalog.manage");
  const q = searchInput.parse(options.q ?? "");
  const branchId = branchInput.parse(options.branchId ?? null);
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const inView = branchId ? eq(departments.branchId, branchId) : undefined;
  const pattern = containing(q);
  const matching =
    q === ""
      ? undefined
      : or(
          ilike(departments.name, pattern),
          ilike(departments.responsibleName, pattern),
          ilike(departments.responsiblePhone, pattern),
        );
  const [totals] = await db
    .select({
      active: sql<number>`count(*) filter (where ${departments.isActive})::int`,
      all: count(),
      found: matching ? sql<number>`count(*) filter (where ${matching})::int` : count(),
    })
    .from(departments)
    .where(inView);
  const active = totals?.active ?? 0;
  const all = totals?.all ?? 0;
  const found = totals?.found ?? 0;
  const pages = Math.max(1, Math.ceil(found / CATALOG_PAGE_SIZE));
  const asked = Number.isInteger(options.page) && options.page! >= 1 ? options.page! : 1;
  const page = Math.min(asked, pages);
  const rows = await db
    .select(columns)
    .from(departments)
    .innerJoin(branches, eq(branches.id, departments.branchId))
    .where(and(inView, matching))
    .orderBy(
      desc(departments.isActive),
      asc(branches.name),
      asc(departments.name),
      asc(departments.id),
    )
    .limit(CATALOG_PAGE_SIZE)
    .offset((page - 1) * CATALOG_PAGE_SIZE);
  return { rows, page, pages, active, inactive: all - active, found };
}

/** One department, or `null` for an id that is unknown or not an id at all (the page: "not found"). */
export async function getDepartment(userId: string, id: string): Promise<DepartmentRow | null> {
  await authorize(userId, "catalog.manage");
  if (!z.uuid().safeParse(id).success) return null;
  const { db } = await import("@/server/db/client");
  const [row] = await db
    .select(columns)
    .from(departments)
    .innerJoin(branches, eq(branches.id, departments.branchId))
    .where(eq(departments.id, id));
  return row ?? null;
}
