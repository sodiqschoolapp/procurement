"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { type IssueResult, issueStock } from "@/features/warehouse/actions/issue";
import { type ReturnResult, returnStock } from "@/features/warehouse/actions/return";
import {
  type IssueDepartment,
  type IssueItem,
  issueFormChoices,
  searchIssueItems,
} from "@/features/warehouse/queries/issue-form";
import {
  type ReturnDepartment,
  type ReturnItem,
  returnFormChoices,
  searchReturnItems,
} from "@/features/warehouse/queries/return-form";
import { serverAction } from "@/server/action";
import { type ActionResult, failure } from "@/server/action-result";
import { getCurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

// The page actions of the issue form (09-warehouse.md, Issue to a department; plan of 5.4) and of
// the return form (09 Other documents, Return from a department; plan of 5.6). The definition's
// wrapper and the queries check everything again: `stock.issue` or `stock.return_reverse` on the
// branch, the fields, the stock under the lock, the amount the department received.

const issue = serverAction(issueStock);
const giveBack = serverAction(returnStock);

/** A query as an answer: a refusal of authorize() or of the input is returned, never thrown. */
async function asked<T>(read: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user) return failure("signed_out");
  try {
    return { ok: true, data: await read(user.id) };
  } catch (error) {
    if (error instanceof AuthorizationError) return failure(error.kind);
    if (error instanceof z.ZodError) return failure("invalid_input");
    throw error;
  }
}

/** Posts one issue (09 Issue 1 and 2); safe to repeat with the same browser id. */
export async function issueStockAction(input: unknown): Promise<ActionResult<IssueResult>> {
  const result = await issue(input);
  if (result.ok) revalidatePath("/warehouse", "layout");
  return result;
}

/** The branch's active departments with their responsible person (09 Issue: Department, Received by). */
export async function issueFormChoicesAction(input: {
  branchId: string;
}): Promise<ActionResult<IssueDepartment[]>> {
  return asked((userId) => issueFormChoices(userId, { branchId: input?.branchId }));
}

/** The items in stock in the branch whose name holds `q` (09 Issue: Lines, current stock). */
export async function searchIssueItemsAction(input: {
  branchId: string;
  q: string;
}): Promise<ActionResult<IssueItem[]>> {
  return asked((userId) => searchIssueItems(userId, { branchId: input?.branchId, q: input?.q }));
}

/** Posts one return (09 Other documents, Return); safe to repeat with the same browser id. */
export async function returnStockAction(input: unknown): Promise<ActionResult<ReturnResult>> {
  const result = await giveBack(input);
  if (result.ok) revalidatePath("/warehouse", "layout");
  return result;
}

/** The branch's active departments (09 Return: "Pick the department"). */
export async function returnFormChoicesAction(input: {
  branchId: string;
}): Promise<ActionResult<ReturnDepartment[]>> {
  return asked((userId) => returnFormChoices(userId, { branchId: input?.branchId }));
}

/** The items whose name holds `q`, with the stock and what the department received of each. */
export async function searchReturnItemsAction(input: {
  branchId: string;
  departmentId: string;
  q: string;
}): Promise<ActionResult<ReturnItem[]>> {
  return asked((userId) =>
    searchReturnItems(userId, {
      branchId: input?.branchId,
      departmentId: input?.departmentId,
      q: input?.q,
    }),
  );
}
