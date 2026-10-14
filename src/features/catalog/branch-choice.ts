import * as z from "zod";

import { type ActionResult, failure } from "@/server/action-result";
import { AuthorizationError, authorize } from "@/server/authorize";

import { branchCookieValue } from "./branch-cookie";
import { listMyBranches } from "./queries/my-branches";

// Choosing the branch view (11-screens-and-ux.md rule 1; plan of 0.10b, decision 3): it checks
// the choice and returns the cookie's value; the server action of src/app/(app)/branch-actions.ts
// writes the cookie.

const choiceInput = z.union([z.literal("all"), z.uuid()]);

/**
 * Checks a choice of the branch view and returns the cookie's value. "all" needs profile.edit; a
 * branch must be one the person sees (data.view on it, so another branch is "Not found"), and
 * one of the branches that exist (a Head with an id of no branch is "Not found" too).
 */
export async function chooseBranch(
  userId: string,
  input: unknown,
): Promise<ActionResult<{ cookie: string }>> {
  const parsed = choiceInput.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  try {
    if (parsed.data === "all") {
      await authorize(userId, "profile.edit");
    } else {
      await authorize(userId, "data.view", { branchId: parsed.data });
      const mine = await listMyBranches(userId);
      if (!mine.some((branch) => branch.id === parsed.data)) return failure("not_found");
    }
    return { ok: true, data: { cookie: branchCookieValue(userId, parsed.data) } };
  } catch (error) {
    if (error instanceof AuthorizationError) return failure(error.kind);
    throw error;
  }
}
