import { beforeEach, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/action";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import type { InsertedUser } from "../../../../tests/helpers/users";
import { setStockMinimum } from "./minimum";

// Set a minimum in the permission matrix (15-quality-and-acceptance.md, Test layers: "each action
// × each role × own branch and other branch"; 03-roles-and-permissions.md, Manager rights:
// SET_MINIMUMS, "Only the Head sets them" when off; 04-catalogs.md rule 5; plan of 5.10, decided
// item 5, Look first; review of the plan, correction 4). The pages' exports are proved through
// themselves with the session mock (.claude/rules/server-actions.md). The expected answers, the
// Manager with SET_MINIMUMS off among them, come from tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const stockPage = await import("@/app/(app)/warehouse/stock/actions");
const cardPage = await import("@/app/(app)/warehouse/items/[id]/actions");

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

/** The answer as the matrix reads it: a refusal of the wall or the matrix is thrown. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

describePermissionMatrix("setStockMinimum", {
  permission: "stock.set_minimums",
  async run({ user, branchId }) {
    const { variantId } = await insertItem();
    asMatrixAnswer(await runAction(setStockMinimum, user.id, { branchId, variantId, minQty: "3" }));
  },
});

describePermissionMatrix("setStockMinimumAction (Stock on hand)", {
  permission: "stock.set_minimums",
  async run({ user, branchId }) {
    const { variantId } = await insertItem();
    signedIn(user);
    asMatrixAnswer(await stockPage.setStockMinimumAction({ branchId, variantId, minQty: "3" }));
  },
});

describePermissionMatrix("setStockMinimumAction (item card)", {
  permission: "stock.set_minimums",
  async run({ user, branchId }) {
    const { variantId } = await insertItem();
    signedIn(user);
    asMatrixAnswer(await cardPage.setStockMinimumAction({ branchId, variantId, minQty: "3" }));
  },
});
