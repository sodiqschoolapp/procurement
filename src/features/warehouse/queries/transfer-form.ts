import { and, asc, eq, ne } from "drizzle-orm";
import * as z from "zod";

import { authorize } from "@/server/authorize";
import { branches } from "@/server/db/schema";

import type { IssueBranch } from "./issue-form";

// The receiving branches of the transfer form, /warehouse/documents/new?type=TRANSFER
// (09-warehouse.md, Other documents, Transfer: "The sender picks the other branch and the items";
// plan of 7.1, decided item 1, Look first). Asked under `stock.transfer` on the sending branch, so
// only a person who may send from it sees the list; then every active branch but the sender,
// also one the sender does not belong to, with its code and name only: nothing of its stock,
// orders or money.

const branchInput = z.uuid();

/** Every active branch but the sending one, by code. */
export async function transferDestinationChoices(
  userId: string,
  options: { branchId: string },
): Promise<IssueBranch[]> {
  const branchId = branchInput.parse(options.branchId);
  await authorize(userId, "stock.transfer", { branchId });
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  return db
    .select({ id: branches.id, code: branches.code, name: branches.name })
    .from(branches)
    .where(and(eq(branches.isActive, true), ne(branches.id, branchId)))
    .orderBy(asc(branches.code));
}
