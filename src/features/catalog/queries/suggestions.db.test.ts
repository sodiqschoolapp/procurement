import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { fileForDownload } from "@/features/files/queries/file-for-download";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertCategory, insertFileRow, insertUnit } from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { updateProduct } from "../actions/products";
import { addSuggestedProduct, declineSuggestion, suggestProduct } from "../actions/suggestions";
import { countPendingSuggestions, getSuggestion, listSuggestions } from "./suggestions";

// The reads of product suggestions (04-catalogs.md rule 8; build-plan 1.12): the branch wall
// inside the SQL (developer-rules.md rule 4; CLAUDE.md rule 4; 03 rule 1: another branch is "Not
// found"), and who may download a suggestion's photo (src/server/files/owners.ts; plan of 1.12,
// decisions 1 and 3, Look first). Each allowed read has another branch's row beside it (D40).

type Suggested = { id: string; branchId: string; name: string };

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

async function suggest(userId: string, branchId: string, input: Record<string, unknown> = {}) {
  return expectOk(
    (await runAction(suggestProduct, userId, {
      clientKey: newClientKey(),
      branchId,
      name: `Taklif ${newClientKey().slice(0, 8)}`,
      unitText: "dona",
      ...input,
    })) as ActionResult<Suggested>,
  );
}

async function twoBranches() {
  const a = await insertBranch();
  const b = await insertBranch();
  const managerA = await insertUser("MANAGER", { branches: [a.id] });
  const managerB = await insertUser("MANAGER", { branches: [b.id] });
  return {
    a,
    b,
    managerA,
    managerB,
    inA: await suggest(managerA.id, a.id),
    inB: await suggest(managerB.id, b.id),
  };
}

describe("listSuggestions: the branch wall (CLAUDE.md rule 4; plan of 1.12, decision 1)", () => {
  it("a Manager lists the own branch's suggestions, a colleague's too, and never another branch's", async () => {
    const { a, managerA, inA, inB } = await twoBranches();
    const colleague = await insertUser("MANAGER", { branches: [a.id] });
    const byColleague = await suggest(colleague.id, a.id);
    const ids = (await listSuggestions(managerA.id)).rows.map((row) => row.id);
    expect(ids).toContain(inA.id);
    expect(ids).toContain(byColleague.id);
    expect(ids).not.toContain(inB.id);
  });

  it("a branch view of another branch is Not found; the own branch's view beside it lists", async () => {
    const { a, b, managerA, inA } = await twoBranches();
    await expect(listSuggestions(managerA.id, { branchId: b.id })).rejects.toMatchObject({
      kind: "not_found",
    });
    const ids = (await listSuggestions(managerA.id, { branchId: a.id })).rows.map((row) => row.id);
    expect(ids).toEqual([inA.id]);
  });

  it("the Head lists every branch, and one branch in its view", async () => {
    const { a, inA, inB } = await twoBranches();
    const head = await insertUser("HEAD");
    const all = (await listSuggestions(head.id)).rows.map((row) => row.id);
    expect(all).toEqual(expect.arrayContaining([inA.id, inB.id]));
    const one = (await listSuggestions(head.id, { branchId: a.id })).rows.map((row) => row.id);
    expect(one).toContain(inA.id);
    expect(one).not.toContain(inB.id);
  });

  it("lists pending ones first, then the newest", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const head = await insertUser("HEAD");
    const older = await suggest(manager.id, branch.id);
    const decided = await suggest(manager.id, branch.id);
    const newer = await suggest(manager.id, branch.id);
    expectOk(
      await runAction(declineSuggestion, head.id, { suggestionId: decided.id, reason: "Yo'q" }),
    );
    const rows = (await listSuggestions(manager.id, { branchId: branch.id })).rows;
    expect(rows.map((row) => row.status)).toEqual(["PENDING", "PENDING", "DECLINED"]);
    expect(rows.slice(0, 2).map((row) => row.id)).toEqual(
      expect.arrayContaining([older.id, newer.id]),
    );
  });

  it("Principal and Finance are forbidden (03, Permission matrix)", async () => {
    const { a } = await twoBranches();
    const principal = await insertUser("PRINCIPAL", { branches: [a.id] });
    const finance = await insertUser("FINANCE", { branches: [a.id] });
    for (const user of [principal, finance]) {
      await expect(listSuggestions(user.id)).rejects.toMatchObject({ kind: "forbidden" });
    }
  });
});

describe("getSuggestion: one suggestion (03 rule 1)", () => {
  it("another branch's is Not found; the own branch's beside it is read", async () => {
    const { managerA, inA, inB } = await twoBranches();
    await expect(getSuggestion(managerA.id, inB.id)).rejects.toMatchObject({ kind: "not_found" });
    expect(await getSuggestion(managerA.id, inA.id)).toMatchObject({ id: inA.id });
  });

  it("an unknown id or no id at all is null; a Principal is forbidden", async () => {
    const { a, managerA, inA } = await twoBranches();
    expect(await getSuggestion(managerA.id, newClientKey())).toBeNull();
    expect(await getSuggestion(managerA.id, "not-an-id")).toBeNull();
    const principal = await insertUser("PRINCIPAL", { branches: [a.id] });
    await expect(getSuggestion(principal.id, inA.id)).rejects.toMatchObject({
      kind: "forbidden",
    });
  });
});

describe("countPendingSuggestions: the Head's row on /catalog", () => {
  it("counts the pending suggestions of every branch, not the decided ones", async () => {
    const head = await insertUser("HEAD");
    const before = await countPendingSuggestions(head.id);
    const { inA } = await twoBranches();
    expectOk(await runAction(declineSuggestion, head.id, { suggestionId: inA.id, reason: "Yo'q" }));
    expect(await countPendingSuggestions(head.id)).toBe(before + 1);
  });
});

describe("a suggestion's photo (owners.ts; plan of 1.12, decision 3, Look first)", () => {
  async function productFields(name: string) {
    return { name, categoryId: (await insertCategory()).id, unitId: (await insertUnit()).id };
  }

  it("while pending: the Head and the branch's Managers, never another branch or a Principal", async () => {
    const a = await insertBranch();
    const b = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [a.id] });
    const colleague = await insertUser("MANAGER", { branches: [a.id] });
    const elsewhere = await insertUser("MANAGER", { branches: [b.id] });
    const principal = await insertUser("PRINCIPAL", { branches: [a.id] });
    const head = await insertUser("HEAD");
    const photo = await insertFileRow(manager.id);
    await suggest(manager.id, a.id, { photoFileId: photo.id });

    for (const user of [manager, colleague, head]) {
      await expect(fileForDownload(user.id, photo.id)).resolves.toMatchObject({
        mime: "image/jpeg",
      });
    }
    for (const user of [elsewhere, principal]) {
      await expect(fileForDownload(user.id, photo.id)).rejects.toMatchObject({
        kind: "not_found",
      });
    }
  });

  it("after an add that kept it: every role, as any product's photo; after the product dropped it: the branch again", async () => {
    const a = await insertBranch();
    const b = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [a.id] });
    const finance = await insertUser("FINANCE", { branches: [b.id] });
    const head = await insertUser("HEAD");
    const photo = await insertFileRow(manager.id);
    const sent = await suggest(manager.id, a.id, { photoFileId: photo.id });
    const added = expectOk(
      (await runAction(addSuggestedProduct, head.id, {
        clientKey: newClientKey(),
        suggestionId: sent.id,
        photoFileId: photo.id,
        ...(await productFields(`Rasmli ${newClientKey().slice(0, 8)}`)),
      })) as ActionResult<{ productId: string }>,
    );
    await expect(fileForDownload(finance.id, photo.id)).resolves.toMatchObject({
      mime: "image/jpeg",
    });

    expectOk(await runAction(updateProduct, head.id, { id: added.productId, photoFileId: null }));
    await expect(fileForDownload(finance.id, photo.id)).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(fileForDownload(manager.id, photo.id)).resolves.toMatchObject({
      mime: "image/jpeg",
    });
  });
});

describePermissionMatrix("listSuggestions", {
  permission: "catalog.suggest",
  async run({ user, branchId }) {
    // The list of one branch's view; the list of every branch is the wall test above.
    await listSuggestions(user.id, { branchId });
  },
});

describePermissionMatrix("getSuggestion", {
  permission: "catalog.suggest",
  async run({ user, branchId }) {
    const manager = await insertUser("MANAGER", { branches: [branchId] });
    const sent = await suggest(manager.id, branchId);
    await getSuggestion(user.id, sent.id);
  },
});

describePermissionMatrix("countPendingSuggestions", {
  permission: "catalog.manage",
  async run({ user }) {
    await countPendingSuggestions(user.id);
  },
});
