import { beforeEach, describe, expect, it, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";

// The page actions of /catalog/<kind> (plan of 1.5, "Server actions and queries"): each takes the
// catalog's segment and runs that catalog's own action in the wrapper, under catalog.manage (03,
// "Manage catalogs, users, branches, settings"). Tested through the dispatch itself, so a wrong
// entry of its table turns a test red (permission review of 1.5, Should fix 1).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { createCatalogEntryAction, setCatalogEntryActiveAction, updateCatalogEntryAction } =
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

const FIELDS = {
  measures: () => ({ shortName: `d${newClientKey().slice(0, 8)}`, allowDecimal: false }),
  categories: () => ({}),
  "extra-costs": () => ({}),
  companies: () => ({ kind: "BOTH", taxId: "", phone: "", note: "" }),
} as const;

type Kind = keyof typeof FIELDS;

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

async function createdByHead(kind: Kind): Promise<string> {
  signedIn(await insertUser("HEAD"));
  const result = await createCatalogEntryAction({
    catalog: kind,
    clientKey: newClientKey(),
    name: `Sahifa ${newClientKey()}`,
    ...FIELDS[kind](),
  });
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: { id: string } }).data.id;
}

describe("the dispatch (plan of 1.5, decision 12)", () => {
  it("each catalog's segment reaches its own table: an id of another catalog is not_found", async () => {
    const id = await createdByHead("categories");
    expect(
      await updateCatalogEntryAction({ catalog: "categories", id, name: "Yangi toifa" }),
    ).toMatchObject({ ok: true });
    expect(
      await updateCatalogEntryAction({ catalog: "companies", id, name: "Yangi" }),
    ).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("an unknown segment, or none, is invalid_input; signed out is signed_out", async () => {
    signedIn(await insertUser("HEAD"));
    for (const catalog of ["colours", undefined]) {
      expect(
        await createCatalogEntryAction({ catalog, clientKey: newClientKey(), name: "Qizil" }),
      ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    store.user = null;
    expect(
      await createCatalogEntryAction({
        catalog: "categories",
        clientKey: newClientKey(),
        name: "X",
      }),
    ).toMatchObject({ ok: false, error: { code: "signed_out" } });
  });
});

for (const kind of Object.keys(FIELDS) as Kind[]) {
  describePermissionMatrix(`createCatalogEntryAction (${kind})`, {
    permission: "catalog.manage",
    async run({ user }) {
      signedIn(user);
      asMatrixAnswer(
        await createCatalogEntryAction({
          catalog: kind,
          clientKey: newClientKey(),
          name: `Matritsa ${newClientKey()}`,
          ...FIELDS[kind](),
        }),
      );
    },
  });

  describePermissionMatrix(`updateCatalogEntryAction (${kind})`, {
    permission: "catalog.manage",
    async run({ user }) {
      const id = await createdByHead(kind);
      signedIn(user);
      asMatrixAnswer(
        await updateCatalogEntryAction({ catalog: kind, id, name: `Matritsa ${newClientKey()}` }),
      );
    },
  });

  describePermissionMatrix(`setCatalogEntryActiveAction (${kind})`, {
    permission: "catalog.manage",
    async run({ user }) {
      const id = await createdByHead(kind);
      signedIn(user);
      asMatrixAnswer(await setCatalogEntryActiveAction({ catalog: kind, id, active: false }));
    },
  });
}
