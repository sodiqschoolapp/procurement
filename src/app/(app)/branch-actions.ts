"use server";

import { cookies } from "next/headers";

import { BRANCH_COOKIE, branchCookieOptions } from "@/features/catalog/branch-cookie";
import { chooseBranch } from "@/features/catalog/branch-choice";
import { type ActionResult, failure } from "@/server/action-result";
import { getCurrentUser } from "@/server/auth/session";

// The branch switcher of the top bar (11-screens-and-ux.md rule 1). It writes a cookie only and
// calls authorize() outside the action wrapper (plan of 0.10b, decision 3, Look first).

/** Keeps the branch view: `{ branch: "all" }` or a branch id the person sees. */
export async function chooseBranchAction(input: unknown): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return failure("signed_out");
  const result = await chooseBranch(user.id, input);
  if (!result.ok) return result;
  (await cookies()).set(BRANCH_COOKIE, result.data.cookie, branchCookieOptions());
  return { ok: true, data: null };
}
