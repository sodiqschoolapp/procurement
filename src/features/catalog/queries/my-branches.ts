import { asc } from "drizzle-orm";

import { authorize, branchFilter } from "@/server/authorize";
import { branches } from "@/server/db/schema";

import { branchOfCookie } from "../branch-cookie";

// The branches of the top bar's branch view (11-screens-and-ux.md rule 1; plan of 0.10b). The
// Head sees every branch; everyone else the branches of user_branches, filtered in the SQL
// (developer-rules.md rule 4). Inactive branches stay, marked (decisions 0.7 item 9).

export type MyBranch = { id: string; code: string; name: string; isActive: boolean };

/** The branches the person sees, ordered by code. */
export async function listMyBranches(userId: string): Promise<MyBranch[]> {
  const actor = await authorize(userId, "profile.edit");
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  return db
    .select({
      id: branches.id,
      code: branches.code,
      name: branches.name,
      isActive: branches.isActive,
    })
    .from(branches)
    .where(branchFilter(actor, branches.id))
    .orderBy(asc(branches.code));
}

/**
 * The branch of the view: the cookie's branch when it names this person and is one of their
 * branches now, else null, "All my branches" (03 rule 1: a branch taken away reads as All).
 */
export async function currentBranchChoice(
  userId: string,
  cookieValue: string | undefined,
): Promise<string | null> {
  const chosen = branchOfCookie(cookieValue, userId);
  const mine = await listMyBranches(userId);
  if (!chosen) return null;
  return mine.some((branch) => branch.id === chosen) ? chosen : null;
}
