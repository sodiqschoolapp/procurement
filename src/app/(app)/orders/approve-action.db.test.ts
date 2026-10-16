import { beforeEach, describe, expect, it, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import type { CurrentUser } from "@/server/auth/session";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder } from "../../../../tests/helpers/orders";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";

// "Already approved by … at …" through the page's own export (06-approval-workflow.md rule 7;
// 03-roles-and-permissions.md rule 1; plan of 2.10, decided item 3, Look first, worked example
// of the review: Heads Aziz and Bekzod tick 0141 and 0142 at v1; Aziz commits at 14:32; Bekzod is
// refused and told who and when; a Principal of another branch who forged 0141 into a tick gets
// `not_found` and no name). Names are invented.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { approveOrdersAction } = await import("./actions");

function signedIn(user: InsertedUser): void {
  store.user = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    locale: "en",
    sessionToken: "invented-token",
  };
}

beforeEach(() => {
  store.user = null;
});

describe("approveOrdersAction: the slower Head is told who approved (06 rule 7)", () => {
  it("names Aziz and the time for both orders; the other branch's Principal hears no name", async () => {
    setClock("2026-10-16T09:32:00Z");
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const aziz = await insertUser("HEAD", { fullName: "Aziz Karimov" });
    const bekzod = await insertUser("HEAD", { fullName: "Bekzod Toshev" });
    const a = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
    });
    const b = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
    });
    const seen = [a, b].map((order) => ({ id: order.id, version: 1 }));

    signedIn(aziz);
    expect(await approveOrdersAction({ clientKey: newClientKey(), orders: seen })).toMatchObject({
      ok: true,
    });

    signedIn(bekzod);
    const late = await approveOrdersAction({ clientKey: newClientKey(), orders: seen });
    expect(late).toMatchObject({
      ok: false,
      error: { code: "stale_version" },
      decided: [
        { orderId: a.id, name: "Aziz Karimov", at: "2026-10-16T09:32:00.000Z" },
        { orderId: b.id, name: "Aziz Karimov", at: "2026-10-16T09:32:00.000Z" },
      ],
    });

    // Aziz himself, sending the old version again with a new key, is not told of himself.
    signedIn(aziz);
    expect(await approveOrdersAction({ clientKey: newClientKey(), orders: seen })).toMatchObject({
      ok: false,
      decided: [],
    });

    const elsewhere = await insertBranch();
    const stranger = await insertUser("PRINCIPAL", { branches: [elsewhere.id] });
    signedIn(stranger);
    expect(await approveOrdersAction({ clientKey: newClientKey(), orders: [seen[0]!] })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "not_found",
        orders: [{ orderId: a.id, code: "not_found" }],
      }),
      decided: [],
    });
  });
});
