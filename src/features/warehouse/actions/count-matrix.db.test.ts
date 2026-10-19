import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/action";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { receive } from "../../../../tests/helpers/stock-documents";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { countBranchChoices } from "../queries/issue-form";
import { saveCountedQuantities, startCount } from "./count";

// Stock counts in the permission matrix (15-quality-and-acceptance.md, Test layers: "each action ×
// each role × own branch and other branch"; 03-roles-and-permissions.md, Permission matrix "Ask
// for a write-off or stock correction", Manager rights WRITE_OFF_COUNT "Ask for write-offs and run
// stock counts"; plan of 7.3, decided item 4, Look first). The start's branch is the input's (a
// Manager with the right starting a count on a branch not theirs is the matrix's "other" case);
// the save's is the count's, made by a Head in that branch. The page exports are proved through
// themselves with the session mock (.claude/rules/server-actions.md). The expected answers come
// from tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { startCountAction } = await import("@/app/(app)/warehouse/counts/actions");
const { saveCountedQuantitiesAction } =
  await import("@/app/(app)/warehouse/documents/[id]/actions");

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

/** An item in stock in the branch, so a count of it has a line. */
async function stocked(branchId: string) {
  const { variantId } = await insertItem();
  const keeper = await insertUser("HEAD");
  await receive(branchId, variantId, "5", 1000n, keeper.id);
  return keeper;
}

function startInput(branchId: string) {
  return { clientKey: randomUUID(), branchId, categoryId: null, comment: null };
}

/** A waiting count of the branch, started by a Head, and the input that types its one line. */
async function waitingCount(branchId: string) {
  const keeper = await stocked(branchId);
  const started = await runAction(startCount, keeper.id, startInput(branchId));
  expect(started).toMatchObject({ ok: true });
  const documentId = started.ok ? started.data.documentId : "";
  const line = await db.execute<{ id: string }>(
    sql`select id from stock_document_lines where document_id = ${documentId}`,
  );
  return { documentId, lines: [{ lineId: line.rows[0]!.id, countedQty: "4" }] };
}

describePermissionMatrix("startCount", {
  permission: "stock.start_count",
  async run({ user, branchId }) {
    await stocked(branchId);
    asMatrixAnswer(await runAction(startCount, user.id, startInput(branchId)));
  },
});

describePermissionMatrix("startCountAction", {
  permission: "stock.start_count",
  async run({ user, branchId }) {
    await stocked(branchId);
    signedIn(user);
    asMatrixAnswer(await startCountAction(startInput(branchId)));
  },
});

describePermissionMatrix("saveCountedQuantities", {
  permission: "stock.start_count",
  async run({ user, branchId }) {
    asMatrixAnswer(await runAction(saveCountedQuantities, user.id, await waitingCount(branchId)));
  },
});

describePermissionMatrix("saveCountedQuantitiesAction", {
  permission: "stock.start_count",
  async run({ user, branchId }) {
    const input = await waitingCount(branchId);
    signedIn(user);
    asMatrixAnswer(await saveCountedQuantitiesAction(input));
  },
});

describe("a count is typed by any Manager of its branch with the right, not only its starter (plan of 7.3, decided item 4)", () => {
  it("a colleague types; with WRITE_OFF_COUNT off the same colleague is refused", async () => {
    const branch = await insertBranch();
    const starter = await insertUser("MANAGER", { branches: [branch.id] });
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    await stocked(branch.id);
    const started = await runAction(startCount, starter.id, startInput(branch.id));
    expect(started).toMatchObject({ ok: true });
    const documentId = started.ok ? started.data.documentId : "";
    const line = await db.execute<{ id: string }>(
      sql`select id from stock_document_lines where document_id = ${documentId}`,
    );
    const input = { documentId, lines: [{ lineId: line.rows[0]!.id, countedQty: "4" }] };
    expect(await runAction(saveCountedQuantities, colleague.id, input)).toMatchObject({
      ok: true,
    });
    await setManagerRight(colleague.id, "WRITE_OFF_COUNT", false);
    expect(await runAction(saveCountedQuantities, colleague.id, input)).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
  });
});

// A list without a branch: refused for a role without the right before any branch is read, so its
// cases are written by hand (the wall itself is the branch filter in the SQL), as for the transfer.
describe("countBranchChoices: the branches the user may start a count in (03 matrix; plan of 7.3)", () => {
  it("the Head every active branch; a Manager their own with WRITE_OFF_COUNT; Principal and Finance refused", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const closed = await insertBranch();
    await db.execute(sql`update branches set is_active = false where id = ${closed.id}`);
    const head = await insertUser("HEAD");
    const listed = (await countBranchChoices(head.id)).map((each) => each.id);
    expect(listed).toEqual(expect.arrayContaining([own.id, other.id]));
    expect(listed).not.toContain(closed.id);

    const manager = await insertUser("MANAGER", { branches: [own.id, closed.id] });
    expect((await countBranchChoices(manager.id)).map((each) => each.id)).toEqual([own.id]);
    await setManagerRight(manager.id, "WRITE_OFF_COUNT", false);
    await expect(countBranchChoices(manager.id)).rejects.toMatchObject({ kind: "forbidden" });

    const principal = await insertUser("PRINCIPAL", { branches: [own.id] });
    const finance = await insertUser("FINANCE", { branches: [own.id] });
    for (const user of [principal, finance]) {
      await expect(countBranchChoices(user.id)).rejects.toMatchObject({ kind: "forbidden" });
    }
  });
});
