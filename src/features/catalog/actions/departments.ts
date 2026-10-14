import { eq } from "drizzle-orm";

import { fullName, isFullName, isPhone, phone } from "@/domain/users";
import { ActionError } from "@/server/action";
import { branches, departments } from "@/server/db/schema";

import { defineCatalogActions } from "./catalog-entries";
import { nameField, optionalText } from "./catalog-fields";

// Departments (04-catalogs.md, Catalogs table: "Branch, name, responsible person (name and
// phone)"; "The responsible person is plain text, not an app user"; A6; build-plan 1.6). Table
// `departments`, audit `department.*`. The name is unique inside the branch (04 rule 3). The
// branch is chosen once, on create, and never changes (plan of 1.6, decision 1, Look first): the
// update input has no branch. A new department needs an active branch (decision 3; refusal keys
// of the plan review, correction 1, as createUser's). The responsible person's name and phone are
// optional, with the users' rules when filled (decision 4).

export type DepartmentFields = {
  name: string;
  responsibleName: string | null;
  responsiblePhone: string | null;
};

const catalog = defineCatalogActions<DepartmentFields>({
  kind: "departments",
  name: "Department",
  table: departments,
  prefix: "department",
  columns: {
    name: departments.name,
    responsibleName: departments.responsibleName,
    responsiblePhone: departments.responsiblePhone,
  },
  shape: {
    name: nameField,
    responsibleName: optionalText(fullName, isFullName),
    responsiblePhone: optionalText(phone, isPhone),
  },
  unique: ["name"],
  within: {
    key: "branchId",
    column: departments.branchId,
    // FOR SHARE: a deactivation of the branch (FOR UPDATE in setBranchActive) waits for this
    // transaction, or this one sees the branch inactive.
    async check(tx, id) {
      const [branch] = await tx
        .select({ isActive: branches.isActive })
        .from(branches)
        .where(eq(branches.id, id))
        .for("share");
      if (!branch) throw new ActionError("invalid_input", { branchId: "errors.field.notAllowed" });
      if (!branch.isActive) {
        throw new ActionError("invalid_input", { branchId: "errors.field.branchInactive" });
      }
    },
    // The history shows the branch by its code as it was then (decision 7).
    async shown(tx, id) {
      const [branch] = await tx
        .select({ code: branches.code })
        .from(branches)
        .where(eq(branches.id, id));
      return { branchId: id, branch: branch!.code };
    },
  },
});

export const createDepartment = catalog.create;
export const updateDepartment = catalog.update;
export const setDepartmentActive = catalog.setActive;
