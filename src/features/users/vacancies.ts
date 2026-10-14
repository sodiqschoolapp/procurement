import { and, eq, inArray } from "drizzle-orm";

import { STAFFED_ROLES, type Place } from "@/domain/users";
import type { Executor } from "@/server/authorize";
import { branches, userBranches } from "@/server/db/schema";

// Which roles of which branches have an active user (03 rule 5: "a warning when a branch has no
// active Manager, Principal or Finance user"; 10, Notifications). The user actions count before
// and after their write, under the locks of the branches they touch, and vacatedPlaces() of
// src/domain/users.ts says what the change left empty. Active branches only: a closed branch
// needs nobody (plan of 1.3, decision 7). No authorize(): the calling action or query did.

/** The places of `branchIds` (active branches only) that have at least one active user. */
export async function staffedPlaces(tx: Executor, branchIds: readonly string[]): Promise<Place[]> {
  if (branchIds.length === 0) return [];
  const rows = await tx
    .selectDistinct({ branchId: userBranches.branchId, role: userBranches.userRole })
    .from(userBranches)
    .innerJoin(branches, eq(branches.id, userBranches.branchId))
    .where(
      and(
        inArray(userBranches.branchId, [...branchIds]),
        eq(userBranches.userIsActive, true),
        eq(branches.isActive, true),
        inArray(userBranches.userRole, [...STAFFED_ROLES]),
      ),
    );
  return rows as Place[];
}
