import { describe, expect, it } from "vitest";

import { setDraftsNeededBy } from "@/features/orders/actions/drafts";

import { insertBranch } from "../../tests/helpers/branches";
import { addDraft, insertDepartment, insertItem, orderRow } from "../../tests/helpers/orders";
import { insertUser } from "../../tests/helpers/users";
import type { CurrentUser } from "./auth/session";
import { draftsServerAction } from "./drafts-action";

// draftsServerAction() (plan of 2.5b, Server actions; review of the plan, Must fix 6): the page's
// "Apply to ticked" runs as the signed-in user through runDraftsAction(), all or nothing
// (05-order-request-form.md field 8; 06-approval-workflow.md rule 8; developer-rules.md rule 4).

function signedIn(user: { id: string; role: CurrentUser["role"] }): () => Promise<CurrentUser> {
  return async () => ({
    id: user.id,
    fullName: "Sinov Foydalanuvchi",
    username: `sinov_${user.id.slice(0, 8)}`,
    role: user.role,
    locale: "uz",
    sessionToken: "invented-token",
  });
}

async function scene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id);
  const item = await insertItem();
  const added = await addDraft(manager.id, {
    branchId: branch.id,
    variantId: item.variantId,
    departmentId: department.id,
  });
  expect(added).toMatchObject({ ok: true });
  const draft = (added as { ok: true; data: { id: string; version: number } }).data;
  return { branch, manager, draft };
}

describe("draftsServerAction (developer-rules.md rule 4; 05 field 8)", () => {
  it("refuses a signed-out caller and changes nothing", async () => {
    const { draft } = await scene();
    const run = draftsServerAction(setDraftsNeededBy, async () => null);
    expect(
      await run({ orders: [{ id: draft.id, version: draft.version }], neededBy: "2031-06-01" }),
    ).toMatchObject({ ok: false, error: { code: "signed_out" } });
    expect((await orderRow(draft.id))!.neededBy).toBeNull();
  });

  it("runs as the signed-in user: the owner's draft changes, another Manager's call is not found", async () => {
    const { branch, manager, draft } = await scene();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const input = { orders: [{ id: draft.id, version: draft.version }], neededBy: "2031-06-01" };

    expect(await draftsServerAction(setDraftsNeededBy, signedIn(colleague))(input)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: draft.id, code: "not_found" }] },
    });
    expect((await orderRow(draft.id))!.neededBy).toBeNull();

    expect(await draftsServerAction(setDraftsNeededBy, signedIn(manager))(input)).toMatchObject({
      ok: true,
      data: { orders: [{ id: draft.id, version: draft.version + 1 }] },
    });
    expect((await orderRow(draft.id))!.neededBy).toBe("2031-06-01");
  });
});
