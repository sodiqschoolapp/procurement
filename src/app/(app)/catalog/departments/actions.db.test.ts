import { beforeEach, expect, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { describePermissionMatrix } from "../../../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser } from "../../../../../tests/helpers/users";

// The page actions of /catalog/departments (plan of 1.6, "Server actions and queries"): each runs
// its department action in the wrapper, under catalog.manage (03, "Manage catalogs, users,
// branches, settings"). Tested through the page actions themselves, as those of 1.5.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { createDepartmentAction, setDepartmentActiveAction, updateDepartmentAction } =
  await import("./actions");

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
  store.user = null;
});

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

async function createdByHead(branchId: string): Promise<string> {
  signedIn(await insertUser("HEAD"));
  const result = await createDepartmentAction({
    clientKey: newClientKey(),
    branchId,
    name: `Sahifa ${newClientKey()}`,
  });
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: { id: string } }).data.id;
}

describePermissionMatrix("createDepartmentAction", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    signedIn(user);
    asMatrixAnswer(
      await createDepartmentAction({
        clientKey: newClientKey(),
        branchId,
        name: `Matritsa ${newClientKey()}`,
      }),
    );
  },
});

describePermissionMatrix("updateDepartmentAction", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const id = await createdByHead(branchId);
    signedIn(user);
    asMatrixAnswer(await updateDepartmentAction({ id, name: `Matritsa ${newClientKey()}` }));
  },
});

describePermissionMatrix("setDepartmentActiveAction", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const id = await createdByHead(branchId);
    signedIn(user);
    asMatrixAnswer(await setDepartmentActiveAction({ id, active: false }));
  },
});
