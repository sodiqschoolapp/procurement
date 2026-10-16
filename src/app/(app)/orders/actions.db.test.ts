import { beforeEach, describe, expect, it, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import type { CurrentUser } from "@/server/auth/session";

import { insertBranch } from "../../../../tests/helpers/branches";
import {
  insertDepartment,
  insertExtraCostType,
  insertItem,
} from "../../../../tests/helpers/orders";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";

// The page actions of the drafts grid (plan of 2.5b, Tests): they pass the 2.5a refusals through
// unchanged (03-roles-and-permissions.md rule 1 and the permission matrix; the feature's own
// matrix tests are drafts-matrix.db.test.ts and draft-picker.db.test.ts) and send money and
// quantity as text (plan of 2.5a, decided item 23). Each passing case has the refused one beside
// it (D40).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const {
  createDraftAction,
  getDraftAction,
  listDraftChoicesAction,
  searchDraftProductsAction,
  updateDraftAction,
} = await import("./actions");

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

async function scene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id);
  const item = await insertItem({ referencePrice: 5_000n });
  const base = { branchId: branch.id, variantId: item.variantId, departmentId: department.id };
  return { branch, manager, department, item, base };
}

describe("the drafts grid's page actions (03 rule 1; 2.5a decided item 23)", () => {
  it("a Principal's createDraftAction is refused; the Manager's own add is made", async () => {
    const { branch, manager, base } = await scene();
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    signedIn(principal);
    expect(
      await createDraftAction({ ...base, clientKey: newClientKey(), quantity: "10" }),
    ).toMatchObject({ ok: false, error: { code: "forbidden" } });

    signedIn(manager);
    expect(
      await createDraftAction({ ...base, clientKey: newClientKey(), quantity: "10" }),
    ).toMatchObject({ ok: true, data: { merged: false, version: 1 } });
  });

  it("getDraftAction: another branch's draft is null; the same user's own-branch draft is its row, money as text", async () => {
    const own = await scene();
    const other = await scene();
    signedIn(other.manager);
    const foreign = await createDraftAction({
      ...other.base,
      clientKey: newClientKey(),
      quantity: "10",
    });
    const foreignId = (foreign as { ok: true; data: { id: string } }).data.id;

    signedIn(own.manager);
    const added = await createDraftAction({
      ...own.base,
      clientKey: newClientKey(),
      quantity: "10",
    });
    const id = (added as { ok: true; data: { id: string } }).data.id;
    const extraType = await insertExtraCostType();
    expect(
      await updateDraftAction({
        id,
        version: 1,
        price: "6750",
        extras: [{ extraCostTypeId: extraType.id, amount: "1000" }],
      }),
    ).toEqual({ ok: true, data: { version: 2, total: "68500", priceHint: "35" } });

    expect(await getDraftAction({ id: foreignId })).toEqual({ ok: true, data: null });
    const row = await getDraftAction({ id });
    expect(row).toMatchObject({
      ok: true,
      data: { id, quantity: "10", price: "6750", total: "68500", priceHint: "35" },
    });
    const extras = (row as { ok: true; data: { extras: { amount: unknown }[] } }).data.extras;
    expect(extras.map((extra) => extra.amount)).toEqual(["1000"]);
  });

  it("the picker and the choices: another branch is not found; the own branch answers with prices as text", async () => {
    const own = await scene();
    const other = await scene();
    signedIn(own.manager);
    expect(await searchDraftProductsAction({ branchId: other.branch.id, q: "" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await listDraftChoicesAction({ branchId: other.branch.id })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });

    const found = await searchDraftProductsAction({ branchId: own.branch.id, q: own.item.name });
    expect(found).toMatchObject({ ok: true });
    const products = (
      found as { ok: true; data: { id: string; subtypes: { referencePrice: unknown }[] }[] }
    ).data;
    const hit = products.find((product) => product.id === own.item.id);
    expect(hit!.subtypes[0]!.referencePrice).toBe("5000");
    const choices = await listDraftChoicesAction({ branchId: own.branch.id });
    expect(choices).toMatchObject({ ok: true, data: { departments: [{ id: own.department.id }] } });
  });

  it("signed out, every action answers signed_out", async () => {
    const { base } = await scene();
    expect(
      await createDraftAction({ ...base, clientKey: newClientKey(), quantity: "1" }),
    ).toMatchObject({
      ok: false,
      error: { code: "signed_out" },
    });
    expect(await listDraftChoicesAction({ branchId: base.branchId })).toMatchObject({
      ok: false,
      error: { code: "signed_out" },
    });
  });
});
