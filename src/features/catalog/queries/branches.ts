import { asc, count, eq, sql } from "drizzle-orm";
import * as z from "zod";

import { BRANCHES_PAGE_SIZE } from "@/domain/branches";
import { authorize } from "@/server/authorize";
import { branches } from "@/server/db/schema";

import { branchCodeLocked } from "../actions/branches";

// The Head's branch list and one branch (build-plan 1.2; 11-screens-and-ux.md, Screens: "Users
// and branches, /branches, Head"). "Manage catalogs, users, branches, settings": catalog.manage,
// Head only (03). No branch filter: only the Head reads these, and the Head sees every branch.
// Inactive branches are listed too (04 rule 2).

export type BranchRow = {
  id: string;
  name: string;
  code: string;
  address: string;
  isActive: boolean;
};

export type BranchPage = {
  rows: BranchRow[];
  page: number;
  pages: number;
  active: number;
  inactive: number;
};

const columns = {
  id: branches.id,
  name: branches.name,
  code: branches.code,
  address: branches.address,
  isActive: branches.isActive,
};

/** One page of every branch, ordered by code; a page past the last gives the last. */
export async function listBranches(
  userId: string,
  options: { page?: number } = {},
): Promise<BranchPage> {
  await authorize(userId, "catalog.manage");
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const [totals] = await db
    .select({
      active: sql<number>`count(*) filter (where ${branches.isActive})::int`,
      all: count(),
    })
    .from(branches);
  const active = totals?.active ?? 0;
  const all = totals?.all ?? 0;
  const pages = Math.max(1, Math.ceil(all / BRANCHES_PAGE_SIZE));
  const asked = Number.isInteger(options.page) && options.page! >= 1 ? options.page! : 1;
  const page = Math.min(asked, pages);
  const rows = await db
    .select(columns)
    .from(branches)
    .orderBy(asc(branches.code))
    .limit(BRANCHES_PAGE_SIZE)
    .offset((page - 1) * BRANCHES_PAGE_SIZE);
  return { rows, page, pages, active, inactive: all - active };
}

/** One branch and whether its code is locked (04, Branches; plan of 2.7, decided item 8). */
export type BranchDetail = BranchRow & { codeLocked: boolean };

/** One branch, or `null` for an id that is unknown or not an id at all (the page: "not found"). */
export async function getBranch(userId: string, id: string): Promise<BranchDetail | null> {
  await authorize(userId, "catalog.manage");
  if (!z.uuid().safeParse(id).success) return null;
  const { db } = await import("@/server/db/client");
  const [row] = await db.select(columns).from(branches).where(eq(branches.id, id));
  if (!row) return null;
  return { ...row, codeLocked: await branchCodeLocked(db, row.id) };
}
