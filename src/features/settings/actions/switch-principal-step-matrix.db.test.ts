import { vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { readSettings } from "@/server/settings";

import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import type { InsertedUser } from "../../../../tests/helpers/users";
import { switchPrincipalStep } from "./switch-principal-step";

// The Principal step switch (build plan 4.10d) in the permission matrix: the feature definition
// and the page export of `src/app/(app)/settings/actions.ts`, each called directly
// (03-roles-and-permissions.md, Permission matrix: "Manage catalogs, users, branches, settings",
// the Head only; 06 Principal step switched off: "The Head can switch the Principal step off"; plan
// of 4.10d, decided item 7, Look first). No order of this file waits, so only the permission can
// refuse; each run switches the step to the other value, so every allowed cell writes.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { switchPrincipalStepAction } = await import("@/app/(app)/settings/actions");

function signedIn(user: InsertedUser): void {
  store.user = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    locale: "uz",
  } as CurrentUser;
}

/** A refusal of the matrix is thrown; every allowed cell must switch. */
function asMatrixAnswer(result: ActionResult<{ changed: boolean }>): void {
  if (result.ok) {
    if (!result.data.changed) throw new Error("The switch wrote nothing.");
    return;
  }
  const code = result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

async function other() {
  return { on: !(await readSettings(db)).principal_step };
}

describePermissionMatrix("switchPrincipalStep", {
  permission: "catalog.manage",
  async run({ user }) {
    asMatrixAnswer(await runAction(switchPrincipalStep, user.id, await other()));
  },
});

describePermissionMatrix("switchPrincipalStepAction (the page export)", {
  permission: "catalog.manage",
  async run({ user }) {
    const sent = await other();
    signedIn(user);
    asMatrixAnswer(await switchPrincipalStepAction(sent));
  },
});
