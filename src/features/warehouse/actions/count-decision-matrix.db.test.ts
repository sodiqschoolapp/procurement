import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/action";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { receive } from "../../../../tests/helpers/stock-documents";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { saveCountedQuantities, startCount } from "./count";
import { decideCount } from "./count-decision";

// The count's decision in the permission matrix (15-quality-and-acceptance.md, Test layers: "each
// action × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission
// matrix "Approve a write-off or stock correction": the Head only; plan of 7.4, decided item 5,
// Look first). The count is made complete by a Head of that branch; the page export is proved
// through itself with the session mock (.claude/rules/server-actions.md). The expected answers
// come from tests/permission-matrix-expected.ts (`stock.approve_write_off`).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { decideCountAction } = await import("@/app/(app)/warehouse/documents/[id]/actions");

function signedIn(user: InsertedUser): void {
  store.user = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    locale: "uz",
    sessionToken: "invented-token",
  };
}

beforeEach(() => {
  setClock("2031-05-03T06:00:00Z");
  store.user = null;
});

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

/** A complete waiting count of the branch, and the approval input the Head would send. */
async function completeCount(branchId: string) {
  const { variantId } = await insertItem();
  const keeper = await insertUser("HEAD");
  await receive(branchId, variantId, "5", 1000n, keeper.id);
  const started = await runAction(startCount, keeper.id, {
    clientKey: randomUUID(),
    branchId,
    categoryId: null,
    comment: null,
  });
  if (!started.ok) throw new Error(`fixture: ${started.error.code}`);
  const documentId = started.data.documentId;
  const line = await db.execute<{ id: string }>(
    sql`select id from stock_document_lines where document_id = ${documentId}`,
  );
  const lineId = line.rows[0]!.id;
  const saved = await runAction(saveCountedQuantities, keeper.id, {
    documentId,
    lines: [{ lineId, countedQty: "4" }],
  });
  if (!saved.ok) throw new Error(`fixture: ${saved.error.code}`);
  return { documentId, outcome: "APPROVE" as const, seen: [{ lineId, countedQty: "4" }] };
}

describePermissionMatrix("decideCount", {
  permission: "stock.approve_write_off",
  async run({ user, branchId }) {
    asMatrixAnswer(await runAction(decideCount, user.id, await completeCount(branchId)));
  },
});

describePermissionMatrix("decideCountAction", {
  permission: "stock.approve_write_off",
  async run({ user, branchId }) {
    const input = await completeCount(branchId);
    signedIn(user);
    asMatrixAnswer(await decideCountAction(input));
  },
});
