import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { auditLog, departments } from "@/server/db/schema";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { runTogether } from "../../../../tests/helpers/together";
import { insertUser } from "../../../../tests/helpers/users";
import { createDepartment, setDepartmentActive, updateDepartment } from "./departments";

// build-plan 1.6, Done when: "the same name in two branches is allowed; twice in one branch is
// refused". 04-catalogs.md, Catalogs table (Departments); rule 2 (deactivate, never delete); rule
// 3 (department names unique inside a branch, ignoring capital letters and extra spaces); rule 9
// (change history); A6; developer-rules.md rules 8 and 13; plan of 1.6 and its review
// (correction 1: the refusal keys of a branch that is unknown or inactive). Every fixture is
// asserted (D38); every passing case has the refused data beside it (D40).

type Department = {
  id: string;
  branchId: string;
  name: string;
  responsibleName: string | null;
  responsiblePhone: string | null;
  isActive: boolean;
};

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

const TAKEN = {
  ok: false,
  error: { code: "invalid_input", fields: { name: "errors.field.taken" } },
};

async function create(
  headId: string,
  branchId: string,
  name: string,
  rest: Partial<Pick<Department, "responsibleName" | "responsiblePhone">> = {},
): Promise<Department> {
  return expectOk(
    (await runAction(createDepartment, headId, {
      clientKey: newClientKey(),
      branchId,
      name,
      ...rest,
    })) as ActionResult<Department>,
  );
}

function auditRowsOf(entityId: string) {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, "departments"), eq(auditLog.entityId, entityId)))
    .orderBy(auditLog.createdAt, auditLog.id);
}

async function rowsOf(branchId: string) {
  return db.select().from(departments).where(eq(departments.branchId, branchId));
}

describe("departments: names unique inside a branch (04 rule 3; build-plan 1.6, Done when)", () => {
  it("the same name in two branches is allowed", async () => {
    const head = await insertUser("HEAD");
    const first = await insertBranch();
    const second = await insertBranch();
    const a = await create(head.id, first.id, "Oshxona");
    const b = await create(head.id, second.id, "Oshxona");
    expect(a).toMatchObject({ branchId: first.id, name: "Oshxona", isActive: true });
    expect(b).toMatchObject({ branchId: second.id, name: "Oshxona", isActive: true });
  });

  it("twice in one branch is refused, also as ' OSHXONA ' or 'oshxona'; nothing is written", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const other = await insertBranch();
    await create(head.id, branch.id, "Oshxona");
    await create(head.id, other.id, "Kutubxona");
    for (const name of ["Oshxona", " OSHXONA ", "oshxona"]) {
      expect(
        await runAction(createDepartment, head.id, {
          clientKey: newClientKey(),
          branchId: branch.id,
          name,
        }),
        name,
      ).toMatchObject(TAKEN);
    }
    expect(await rowsOf(branch.id)).toHaveLength(1);
    // The name held in the other branch is free here.
    await create(head.id, branch.id, "Kutubxona");
  });

  it("on update: a name held in the same branch is refused; one held only in the other branch is taken", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const other = await insertBranch();
    await create(head.id, branch.id, "Sport zali");
    await create(head.id, other.id, "Musiqa xonasi");
    const own = await create(head.id, branch.id, "Fizika xonasi");
    expect(
      await runAction(updateDepartment, head.id, { id: own.id, name: " SPORT  zali " }),
    ).toMatchObject(TAKEN);
    const renamed = expectOk(
      (await runAction(updateDepartment, head.id, {
        id: own.id,
        name: "Musiqa xonasi",
      })) as ActionResult<{ entry: Department; changed: string[] }>,
    );
    expect(renamed).toMatchObject({
      entry: { name: "Musiqa xonasi", branchId: branch.id },
      changed: ["name"],
    });
  });

  it("an inactive department keeps its name held; renaming it frees the name (D41)", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const old = await create(head.id, branch.id, "Ombor xonasi");
    expectOk(await runAction(setDepartmentActive, head.id, { id: old.id, active: false }));
    expect(
      await runAction(createDepartment, head.id, {
        clientKey: newClientKey(),
        branchId: branch.id,
        name: "Ombor xonasi",
      }),
    ).toMatchObject(TAKEN);
    expectOk(
      await runAction(updateDepartment, head.id, { id: old.id, name: "Ombor xonasi (eski)" }),
    );
    await create(head.id, branch.id, "Ombor xonasi");
  });

  it("two creates of one name in one branch at once: one is saved, the other refused as taken", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const outcomes = await runTogether(
      ["Kimyo xonasi", "kimyo xonasi"].map((name) => async (meet: () => Promise<void>) => {
        const input = { clientKey: newClientKey(), branchId: branch.id, name };
        await meet();
        return runAction(createDepartment, head.id, input);
      }),
    );
    const answers = outcomes.map((outcome) => {
      expect(outcome.status).toBe("fulfilled");
      return (outcome as PromiseFulfilledResult<ActionResult<Department>>).value;
    });
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.find((answer) => !answer.ok)).toMatchObject(TAKEN);
    expect(await rowsOf(branch.id)).toHaveLength(1);
  });
});

describe("departments: the branch (A6; plan of 1.6, decisions 1 and 3)", () => {
  it("a create in an inactive branch is refused with branchInactive; in an active one it passes", async () => {
    const head = await insertUser("HEAD");
    const closed = await insertBranch({ isActive: false });
    const open = await insertBranch();
    expect(
      await runAction(createDepartment, head.id, {
        clientKey: newClientKey(),
        branchId: closed.id,
        name: "Oshxona",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { branchId: "errors.field.branchInactive" } },
    });
    expect(await rowsOf(closed.id)).toHaveLength(0);
    await create(head.id, open.id, "Oshxona");
  });

  it("a create in an unknown branch is refused with notAllowed; a branch id that is no id is invalid", async () => {
    const head = await insertUser("HEAD");
    expect(
      await runAction(createDepartment, head.id, {
        clientKey: newClientKey(),
        branchId: randomUUID(),
        name: "Oshxona",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { branchId: "errors.field.notAllowed" } },
    });
    expect(
      await runAction(createDepartment, head.id, {
        clientKey: newClientKey(),
        branchId: "abc",
        name: "Oshxona",
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });

  it("an update that carries another branch id leaves the branch as it was (decision 1)", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const other = await insertBranch();
    const saved = await create(head.id, branch.id, "Kutubxona");
    const result = expectOk(
      (await runAction(updateDepartment, head.id, {
        id: saved.id,
        branchId: other.id,
        name: "Kutubxona 2",
      })) as ActionResult<{ entry: Department; changed: string[] }>,
    );
    expect(result).toMatchObject({ entry: { branchId: branch.id }, changed: ["name"] });
    expect(await rowsOf(other.id)).toHaveLength(0);
  });

  it("the departments of a branch deactivated later stay as they are (decisions 1.2 item 2)", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const saved = await create(head.id, branch.id, "Sinf 1-A");
    const { setBranchActive } = await import("./branches");
    expectOk(await runAction(setBranchActive, head.id, { id: branch.id, active: false }));
    const [row] = await rowsOf(branch.id);
    expect(row).toMatchObject({ id: saved.id, isActive: true });
    expectOk(await runAction(updateDepartment, head.id, { id: saved.id, name: "Sinf 1-B" }));
  });
});

describe("departments: the responsible person (04, Catalogs table; plan of 1.6, decision 4)", () => {
  it("is optional; empty is stored as null; filled values are stored trimmed", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const empty = await create(head.id, branch.id, "Hovli", {
      responsibleName: "",
      responsiblePhone: "  ",
    });
    expect(empty).toMatchObject({ responsibleName: null, responsiblePhone: null });
    const filled = await create(head.id, branch.id, "Oshxona", {
      responsibleName: "  Sinov   Shaxsov ",
      responsiblePhone: " +998 90 000 00 01 ",
    });
    expect(filled).toMatchObject({
      responsibleName: "Sinov Shaxsov",
      responsiblePhone: "+998 90 000 00 01",
    });
  });

  it("a phone outside the users' rule is refused; a valid one passes", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    expect(
      await runAction(createDepartment, head.id, {
        clientKey: newClientKey(),
        branchId: branch.id,
        name: "Kutubxona",
        responsiblePhone: "telefon",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { responsiblePhone: expect.any(String) } },
    });
    await create(head.id, branch.id, "Kutubxona", { responsiblePhone: "90 000 00 02" });
  });
});

describe("departments: deactivate and change history (04 rules 2 and 9; developer-rules.md rule 13)", () => {
  it("each change writes one audit row; the create row holds the branch id and code", async () => {
    setClock("2026-10-15T08:00:00Z");
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const saved = await create(head.id, branch.id, "Oshxona", { responsibleName: "Sinov Oshpaz" });
    setClock("2026-10-15T08:01:00Z");
    expectOk(
      await runAction(updateDepartment, head.id, {
        id: saved.id,
        responsiblePhone: "90 000 00 03",
      }),
    );
    // Nothing changed: no row.
    expectOk(await runAction(updateDepartment, head.id, { id: saved.id, name: "Oshxona" }));
    setClock("2026-10-15T08:02:00Z");
    expectOk(await runAction(setDepartmentActive, head.id, { id: saved.id, active: false }));
    expect(
      await runAction(setDepartmentActive, head.id, { id: saved.id, active: false }),
    ).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    setClock("2026-10-15T08:03:00Z");
    expectOk(await runAction(setDepartmentActive, head.id, { id: saved.id, active: true }));
    const rows = await auditRowsOf(saved.id);
    expect(rows.map((row) => row.action)).toEqual([
      "department.create",
      "department.update",
      "department.deactivate",
      "department.activate",
    ]);
    expect(rows[0]).toMatchObject({
      actorId: head.id,
      before: null,
      after: {
        branchId: branch.id,
        branch: branch.code,
        name: "Oshxona",
        responsibleName: "Sinov Oshpaz",
        responsiblePhone: null,
        isActive: true,
      },
      createdAt: new Date("2026-10-15T08:00:00Z"),
    });
    expect(rows[1]).toMatchObject({
      before: { responsiblePhone: null },
      after: { responsiblePhone: "90 000 00 03" },
    });
    expect(rows[2]).toMatchObject({ before: { isActive: true }, after: { isActive: false } });
  });

  it("the same client key twice returns the first department and writes one row (developer-rules.md rule 8)", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const clientKey = newClientKey();
    const first = expectOk(
      (await runAction(createDepartment, head.id, {
        clientKey,
        branchId: branch.id,
        name: "Kompyuter xonasi",
      })) as ActionResult<Department>,
    );
    const again = expectOk(
      (await runAction(createDepartment, head.id, {
        clientKey,
        branchId: branch.id,
        name: "Kompyuter xonasi",
      })) as ActionResult<Department>,
    );
    expect(again.id).toBe(first.id);
    expect(await rowsOf(branch.id)).toHaveLength(1);
    expect(await auditRowsOf(first.id)).toHaveLength(1);
  });
});

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

// "Manage catalogs, users, branches, settings": the Head only (03, Permission matrix).
describePermissionMatrix("createDepartment", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    asMatrixAnswer(
      await runAction(createDepartment, user.id, {
        clientKey: newClientKey(),
        branchId,
        name: `Matritsa ${newClientKey()}`,
      }),
    );
  },
});

describePermissionMatrix("updateDepartment", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const head = await insertUser("HEAD");
    const saved = await create(head.id, branchId, `Matritsa ${newClientKey()}`);
    asMatrixAnswer(
      await runAction(updateDepartment, user.id, {
        id: saved.id,
        name: `Matritsa ${newClientKey()}`,
      }),
    );
  },
});

describePermissionMatrix("setDepartmentActive", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const head = await insertUser("HEAD");
    const saved = await create(head.id, branchId, `Matritsa ${newClientKey()}`);
    asMatrixAnswer(await runAction(setDepartmentActive, user.id, { id: saved.id, active: false }));
  },
});
