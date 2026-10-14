import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

import { insertBranch } from "../../../../tests/helpers/branches";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { createDepartment, setDepartmentActive } from "../actions/departments";
import { countActiveCatalogEntries } from "./catalog-entries";
import { getDepartment, listDepartments } from "./departments";

// build-plan 1.6: departments per branch, deactivated ones kept (04-catalogs.md rules 2 and 3);
// the list shows the top bar's branch view (plan of 1.6, decision 10) and finds by search
// (decision 8); 11-screens-and-ux.md rule 8 (25 a page). Every fixture is asserted (D38); every
// filter test has the excluded row beside it (D40).

function data<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

async function department(
  headId: string,
  branchId: string,
  name: string,
  options: { active?: boolean; responsibleName?: string; responsiblePhone?: string } = {},
): Promise<string> {
  const { active = true, ...rest } = options;
  const saved = data(
    await runAction(createDepartment, headId, {
      clientKey: newClientKey(),
      branchId,
      name,
      ...rest,
    }),
  ) as { id: string };
  if (!active) data(await runAction(setDepartmentActive, headId, { id: saved.id, active: false }));
  return saved.id;
}

describe("listDepartments (build-plan 1.6; 04 rule 2)", () => {
  it("one branch's view lists only that branch's departments, the inactive ones too", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const other = await insertBranch();
    const kept = await department(head.id, branch.id, "Oshxona");
    const dropped = await department(head.id, branch.id, "Eski ombor", { active: false });
    const elsewhere = await department(head.id, other.id, "Oshxona");

    const list = await listDepartments(head.id, { branchId: branch.id });
    expect(list.rows.map((row) => row.id)).toEqual([kept, dropped]);
    expect(list.rows[0]).toMatchObject({
      branchId: branch.id,
      branchCode: branch.code,
      branchName: branch.name,
      isActive: true,
    });
    expect(list).toMatchObject({ active: 1, inactive: 1, found: 2, page: 1, pages: 1 });
    expect(list.rows.map((row) => row.id)).not.toContain(elsewhere);
  });

  it("the view of every branch lists both branches' departments", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const other = await insertBranch();
    const a = await department(head.id, branch.id, "Barcha ko'rinish A");
    const b = await department(head.id, other.id, "Barcha ko'rinish B");
    const list = await listDepartments(head.id, { q: "Barcha ko'rinish" });
    expect(list.rows.map((row) => row.id).sort()).toEqual([a, b].sort());
  });

  it("search finds part of the name, the responsible person or the phone, any case; % is literal", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const byName = await department(head.id, branch.id, "Kimyo laboratoriyasi");
    const byPerson = await department(head.id, branch.id, "Hovli", {
      responsibleName: "Sinov Laborantov",
    });
    const byPhone = await department(head.id, branch.id, "Qorovulxona", {
      responsiblePhone: "+998 90 555 44 33",
    });
    const neither = await department(head.id, branch.id, "Sport zali");

    const ids = async (q: string) =>
      (await listDepartments(head.id, { branchId: branch.id, q })).rows.map((row) => row.id);
    expect((await ids("LABOR")).sort()).toEqual([byName, byPerson].sort());
    expect(await ids("555 44")).toEqual([byPhone]);
    expect(await ids("%")).toEqual([]);
    expect(await ids("")).toContain(neither);
  });

  it("25 a page; a page past the last gives the last (11 rule 8)", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    for (let index = 1; index <= 26; index += 1) {
      await department(head.id, branch.id, `Xona ${String(index).padStart(2, "0")}`);
    }
    const first = await listDepartments(head.id, { branchId: branch.id });
    expect(first.rows).toHaveLength(25);
    expect(first.pages).toBe(2);
    const last = await listDepartments(head.id, { branchId: branch.id, page: 9 });
    expect(last).toMatchObject({ page: 2 });
    expect(last.rows.map((row) => row.name)).toEqual(["Xona 26"]);
  });
});

describe("getDepartment", () => {
  it("gives the department with its branch; an unknown id or no id is null", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const id = await department(head.id, branch.id, "Kutubxona", {
      responsibleName: "Sinov Kitobov",
    });
    expect(await getDepartment(head.id, id)).toMatchObject({
      id,
      branchCode: branch.code,
      name: "Kutubxona",
      responsibleName: "Sinov Kitobov",
      responsiblePhone: null,
    });
    expect(await getDepartment(head.id, randomUUID())).toBeNull();
    expect(await getDepartment(head.id, "abc")).toBeNull();
  });
});

describe("countActiveCatalogEntries (plan of 1.6, What will exist)", () => {
  it("counts active departments only", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const before = await countActiveCatalogEntries(head.id);
    await department(head.id, branch.id, "Sanoq faol");
    await department(head.id, branch.id, "Sanoq nofaol", { active: false });
    const after = await countActiveCatalogEntries(head.id);
    expect(after.departments).toBe(before.departments + 1);
    expect(after.categories).toBe(before.categories);
  });
});

// "Manage catalogs, users, branches, settings": the Head only (03, Permission matrix).
describePermissionMatrix("listDepartments", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    await listDepartments(user.id, { branchId });
  },
});

describePermissionMatrix("getDepartment", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const head = await insertUser("HEAD");
    const id = await department(head.id, branchId, `Matritsa ${newClientKey()}`);
    await getDepartment(user.id, id);
  },
});
