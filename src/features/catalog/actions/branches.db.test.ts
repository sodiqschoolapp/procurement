import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { ROLES } from "@/domain/permissions";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { auditLog, branches } from "@/server/db/schema";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { runTogether } from "../../../../tests/helpers/together";
import { insertUser } from "../../../../tests/helpers/users";
import { type SavedBranch, createBranch, setBranchActive, updateBranch } from "./branches";

// build-plan 1.2, Done when: "a lower-case code and a 5-letter code are refused; a duplicate code
// is refused by the database; a Manager cannot open the screen". 04-catalogs.md, Catalogs table:
// Branches ("2 to 4 Latin capital letters, unique"); rule 2 (deactivate, never delete); rule 3
// (names unique ignoring capital letters and extra spaces); rule 9 (change history);
// developer-rules.md rules 8 and 13; plan of 1.2 and its review corrections 1 to 3. Every
// fixture is asserted (D38).

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

async function branchRows(code: string) {
  return db.select().from(branches).where(eq(branches.code, code));
}

async function auditRowsOf(entityId: string) {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, "branches"), eq(auditLog.entityId, entityId)))
    .orderBy(auditLog.createdAt);
}

async function auditRowsBy(actorId: string) {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, "branches"), eq(auditLog.actorId, actorId)));
}

async function created(headId: string, fields: { name: string; code: string; address?: string }) {
  return expectOk(
    await runAction(createBranch, headId, {
      clientKey: newClientKey(),
      address: "Sinov ko'chasi 1",
      ...fields,
    }),
  );
}

const TAKEN = (field: string) => ({
  ok: false,
  error: { code: "invalid_input", fields: { [field]: "errors.field.taken" } },
});

describe("createBranch (build-plan 1.2)", () => {
  it("Done when: a lower-case code and a 5-letter code are refused; nothing is written", async () => {
    const head = await insertUser("HEAD");
    for (const code of ["chl", "CHLAB"]) {
      expect(
        await runAction(createBranch, head.id, {
          clientKey: newClientKey(),
          name: `Sinov ${code}`,
          code,
          address: "Sinov ko'chasi 1",
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { code: "errors.field.wrongFormat" } },
      });
      expect(await branchRows(code)).toEqual([]);
    }
    expect(await auditRowsBy(head.id)).toEqual([]);
  });

  it("creates an active branch with the name trimmed and collapsed, and one branch.create row (04 rule 9; decision 9)", async () => {
    setClock("2026-10-14T09:00:00Z");
    const head = await insertUser("HEAD");
    const branch = await created(head.id, {
      name: "  Olmazor   filiali ",
      code: "OLM",
      address: " Sinov  ko'chasi 5 ",
    });
    expect(branch).toMatchObject({
      name: "Olmazor filiali",
      code: "OLM",
      address: "Sinov  ko'chasi 5",
      isActive: true,
    });
    const audits = await auditRowsOf(branch.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: head.id,
      action: "branch.create",
      before: null,
      after: { name: "Olmazor filiali", code: "OLM", address: "Sinov  ko'chasi 5", isActive: true },
      createdAt: new Date("2026-10-14T09:00:00Z"),
    });
  });

  it("a code another branch holds, active or inactive, is taken; another code beside it passes (04, Branches; D40)", async () => {
    const head = await insertUser("HEAD");
    await insertBranch({ code: "TKA", name: "Sinov TKA" });
    await insertBranch({ code: "TKB", name: "Sinov TKB", isActive: false });

    for (const code of ["TKA", "TKB"]) {
      expect(
        await runAction(createBranch, head.id, {
          clientKey: newClientKey(),
          name: `Yangi ${code}`,
          code,
          address: "Sinov ko'chasi 1",
        }),
      ).toMatchObject(TAKEN("code"));
      expect(await branchRows(code)).toHaveLength(1);
    }
    expect(await auditRowsBy(head.id)).toEqual([]);
    await created(head.id, { name: "Yangi TKC", code: "TKC" });
  });

  it("a name differing only in capital letters and spaces is taken; another name passes (04 rule 3)", async () => {
    const head = await insertUser("HEAD");
    await insertBranch({ code: "NMA", name: "Chilonzor filiali" });
    expect(
      await runAction(createBranch, head.id, {
        clientKey: newClientKey(),
        name: "  CHILONZOR   Filiali",
        code: "NMB",
        address: "Sinov ko'chasi 1",
      }),
    ).toMatchObject(TAKEN("name"));
    expect(await branchRows("NMB")).toEqual([]);
    await created(head.id, { name: "Chilonzor filiali 2", code: "NMB" });
  });

  it("the same clientKey twice returns the first branch: one row, one audit row (developer-rules.md rule 8)", async () => {
    const head = await insertUser("HEAD");
    const input = {
      clientKey: newClientKey(),
      name: "Takror filiali",
      code: "TAK",
      address: "Sinov ko'chasi 1",
    };
    const first = expectOk(await runAction(createBranch, head.id, input));
    const second = expectOk(await runAction(createBranch, head.id, input));
    expect(second).toEqual(first);
    expect(await branchRows("TAK")).toHaveLength(1);
    expect(await auditRowsOf(first.id)).toHaveLength(1);
  });

  it("another Head sending the same clientKey gets not_found; no second branch, no second audit row (rule 8; review correction 1)", async () => {
    const head = await insertUser("HEAD");
    const otherHead = await insertUser("HEAD");
    const input = {
      clientKey: newClientKey(),
      name: "Ikkinchi filiali",
      code: "IKK",
      address: "Sinov ko'chasi 1",
    };
    const first = expectOk(await runAction(createBranch, head.id, input));
    expect(await runAction(createBranch, otherHead.id, input)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await branchRows("IKK")).toHaveLength(1);
    expect(await auditRowsOf(first.id)).toHaveLength(1);
    expect(await auditRowsBy(otherHead.id)).toEqual([]);
  });

  it("two creates at once with one code, and two with one name: one branch, the other taken (the advisory lock; decision 7)", async () => {
    const head = await insertUser("HEAD");
    const sameCode = await runTogether(
      ["Birinchi", "Ikkinchi"].map((name) => async (meet: () => Promise<void>) => {
        await meet();
        return runAction(createBranch, head.id, {
          clientKey: newClientKey(),
          name: `${name} LCK`,
          code: "LCK",
          address: "Sinov ko'chasi 1",
        });
      }),
    );
    const sameName = await runTogether(
      ["LNA", "LNB"].map((code) => async (meet: () => Promise<void>) => {
        await meet();
        return runAction(createBranch, head.id, {
          clientKey: newClientKey(),
          name: "Bir xil filial",
          code,
          address: "Sinov ko'chasi 1",
        });
      }),
    );
    for (const [outcomes, field] of [
      [sameCode, "code"],
      [sameName, "name"],
    ] as const) {
      const answers = outcomes.map((outcome) => {
        expect(outcome.status).toBe("fulfilled");
        return (outcome as PromiseFulfilledResult<ActionResult<SavedBranch>>).value;
      });
      expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
      expect(answers.find((answer) => !answer.ok)).toMatchObject(TAKEN(field));
    }
    expect(await branchRows("LCK")).toHaveLength(1);
  });

  it.each(ROLES.filter((role) => role !== "HEAD"))(
    "%s is refused; no branch and no audit row (03, Permission matrix)",
    async (role) => {
      const user = await insertUser(role);
      const code = { MANAGER: "RMA", PRINCIPAL: "RPR", FINANCE: "RFI" }[role as string]!;
      expect(
        await runAction(createBranch, user.id, {
          clientKey: newClientKey(),
          name: `Rad ${code}`,
          code,
          address: "Sinov ko'chasi 1",
        }),
      ).toMatchObject({ ok: false, error: { code: "forbidden" } });
      expect(await branchRows(code)).toEqual([]);
      expect(await auditRowsBy(user.id)).toEqual([]);
    },
  );
});

describe("updateBranch (build-plan 1.2)", () => {
  it("Done when: a lower-case code and a 5-letter code are refused; the branch is unchanged", async () => {
    const head = await insertUser("HEAD");
    const branch = await created(head.id, { name: "Ozgarmas filiali", code: "OZG" });
    for (const code of ["ozg", "OZGAR"]) {
      expect(await runAction(updateBranch, head.id, { id: branch.id, code })).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { code: "errors.field.wrongFormat" } },
      });
    }
    expect(await branchRows("OZG")).toHaveLength(1);
    expect(await auditRowsOf(branch.id)).toHaveLength(1);
  });

  it("writes only the changed fields, with one branch.update row of them (04 rule 9; decision 1)", async () => {
    setClock("2026-10-14T10:00:00Z");
    const head = await insertUser("HEAD");
    const branch = await created(head.id, { name: "Eski nom", code: "ESK" });
    setClock("2026-10-14T11:00:00Z");
    const result = expectOk(
      await runAction(updateBranch, head.id, {
        id: branch.id,
        name: "Yangi nom",
        code: "ESK",
        address: "Sinov ko'chasi 1",
      }),
    );
    expect(result.changed).toEqual(["name"]);
    expect(result.branch).toMatchObject({ name: "Yangi nom", code: "ESK" });
    const audits = await auditRowsOf(branch.id);
    expect(audits).toHaveLength(2);
    expect(audits[1]).toMatchObject({
      actorId: head.id,
      action: "branch.update",
      before: { name: "Eski nom" },
      after: { name: "Yangi nom" },
      createdAt: new Date("2026-10-14T11:00:00Z"),
    });
  });

  it("nothing changed: success with the branch as it is, no audit row (review correction 3)", async () => {
    const head = await insertUser("HEAD");
    const branch = await created(head.id, { name: "Bir xil", code: "BXL" });
    const result = expectOk(
      await runAction(updateBranch, head.id, { id: branch.id, name: "  Bir   xil " }),
    );
    expect(result.changed).toEqual([]);
    expect(result.branch).toEqual(branch);
    expect(await auditRowsOf(branch.id)).toHaveLength(1);
  });

  it("a code or name another branch holds is taken; its own name by case or spacing passes (04 rule 3; D40)", async () => {
    const head = await insertUser("HEAD");
    await insertBranch({ code: "UPA", name: "Sergeli filiali" });
    const branch = await created(head.id, { name: "Yashnobod filiali", code: "UPB" });

    expect(await runAction(updateBranch, head.id, { id: branch.id, code: "UPA" })).toMatchObject(
      TAKEN("code"),
    );
    expect(
      await runAction(updateBranch, head.id, { id: branch.id, name: "SERGELI  filiali" }),
    ).toMatchObject(TAKEN("name"));
    expect(
      expectOk(await runAction(updateBranch, head.id, { id: branch.id, name: "YASHNOBOD Filiali" }))
        .changed,
    ).toEqual(["name"]);
    expect(await branchRows("UPB")).toMatchObject([{ name: "YASHNOBOD Filiali" }]);
  });

  it("renaming an inactive branch frees its old name for a new branch (D41)", async () => {
    const head = await insertUser("HEAD");
    const old = await created(head.id, { name: "Bektemir filiali", code: "BKA" });
    expectOk(await runAction(setBranchActive, head.id, { id: old.id, active: false }));
    expect(
      await runAction(createBranch, head.id, {
        clientKey: newClientKey(),
        name: "Bektemir filiali",
        code: "BKB",
        address: "Sinov ko'chasi 1",
      }),
    ).toMatchObject(TAKEN("name"));

    expectOk(
      await runAction(updateBranch, head.id, { id: old.id, name: "Bektemir filiali (eski)" }),
    );
    await created(head.id, { name: "Bektemir filiali", code: "BKB" });
  });

  it("an unknown id is not_found", async () => {
    const head = await insertUser("HEAD");
    expect(
      await runAction(updateBranch, head.id, {
        id: "00000000-0000-4000-8000-000000000000",
        name: "Hech qayer",
      }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

describe("setBranchActive (04 rule 2: deactivate instead of delete)", () => {
  it("deactivates and keeps the row; a second deactivate is wrong_status; activating brings it back; each move one row", async () => {
    const head = await insertUser("HEAD");
    const branch = await created(head.id, { name: "Uchtepa filiali", code: "UCH" });

    const off = expectOk(
      await runAction(setBranchActive, head.id, { id: branch.id, active: false }),
    );
    expect(off.isActive).toBe(false);
    expect(await branchRows("UCH")).toMatchObject([{ isActive: false }]);
    expect(
      await runAction(setBranchActive, head.id, { id: branch.id, active: false }),
    ).toMatchObject({ ok: false, error: { code: "wrong_status" } });

    const on = expectOk(await runAction(setBranchActive, head.id, { id: branch.id, active: true }));
    expect(on.isActive).toBe(true);
    expect(
      await runAction(setBranchActive, head.id, { id: branch.id, active: true }),
    ).toMatchObject({
      ok: false,
      error: { code: "wrong_status" },
    });

    const audits = await auditRowsOf(branch.id);
    expect(audits.map((row) => [row.action, row.before, row.after])).toEqual([
      ["branch.create", null, expect.anything()],
      ["branch.deactivate", { isActive: true }, { isActive: false }],
      ["branch.activate", { isActive: false }, { isActive: true }],
    ]);
  });

  it("an unknown id is not_found", async () => {
    const head = await insertUser("HEAD");
    expect(
      await runAction(setBranchActive, head.id, {
        id: "00000000-0000-4000-8000-000000000000",
        active: false,
      }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

/** The answer as the matrix reads it: a refusal of authorize() is thrown again as its kind. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

let matrixRuns = 0;

/** A code no other case of this file uses: M and three letters from a count. */
function matrixCode(): string {
  matrixRuns += 1;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let rest = matrixRuns;
  let code = "";
  for (let place = 0; place < 3; place += 1) {
    code = letters[rest % 26]! + code;
    rest = Math.floor(rest / 26);
  }
  return `M${code}`;
}

describePermissionMatrix("createBranch", {
  permission: "catalog.manage",
  async run({ user }) {
    asMatrixAnswer(
      await runAction(createBranch, user.id, {
        clientKey: newClientKey(),
        name: `Matritsa ${newClientKey()}`,
        code: matrixCode(),
        address: "Sinov ko'chasi 1",
      }),
    );
  },
});

describePermissionMatrix("updateBranch", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    asMatrixAnswer(
      await runAction(updateBranch, user.id, { id: branchId, address: `Manzil ${newClientKey()}` }),
    );
  },
});

describePermissionMatrix("setBranchActive", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    asMatrixAnswer(await runAction(setBranchActive, user.id, { id: branchId, active: false }));
  },
});
