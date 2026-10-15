import { describe, expect, it } from "vitest";

import { EXPECTED_MATRIX, expectedAnswer } from "../../tests/permission-matrix-expected";
import {
  type Actor,
  MANAGER_RIGHTS,
  PERMISSIONS,
  type Permission,
  ROLES,
  type Role,
  decide,
  decideList,
} from "./permissions";

// 03-roles-and-permissions.md (Rules 1; Manager rights; Permission matrix); developer-rules.md
// rule 4. The expected answers come from the hand-written tests/permission-matrix-expected.ts.

const OWN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ME = "33333333-3333-4333-8333-333333333333";
const COLLEAGUE = "44444444-4444-4444-8444-444444444444";

const PERMISSION_NAMES = Object.keys(PERMISSIONS) as Permission[];

function actor(role: Role, overrides: Partial<Actor> = {}): Actor {
  return {
    userId: ME,
    role,
    branchIds: role === "HEAD" ? [] : [OWN],
    disabledRights: [],
    ...overrides,
  };
}

describe("PERMISSIONS (03-roles-and-permissions.md, Permission matrix)", () => {
  it("has exactly the permissions of the hand-written table", () => {
    expect(PERMISSION_NAMES.toSorted()).toEqual(Object.keys(EXPECTED_MATRIX).toSorted());
  });

  it.each(PERMISSION_NAMES)("%s: the roles and the Manager right match the table", (name) => {
    const rule = PERMISSIONS[name];
    const expected = EXPECTED_MATRIX[name];
    for (const role of ROLES) expect(rule.roles[role], role).toBe(expected[role]);
    expect("right" in rule ? rule.right : undefined).toBe(expected.right);
  });

  it("guards a permission with every one of the nine Manager rights", () => {
    const used = new Set(PERMISSION_NAMES.map((name) => EXPECTED_MATRIX[name].right));
    for (const right of MANAGER_RIGHTS) expect(used.has(right), right).toBe(true);
  });
});

describe("decide() (03 rule 1; Permission matrix)", () => {
  for (const name of PERMISSION_NAMES) {
    for (const role of ROLES) {
      for (const place of ["own", "other"] as const) {
        const expected = expectedAnswer(name, role, place);
        it(`${name} × ${role} × ${place} branch: ${expected}`, () => {
          const target = { branchId: place === "own" ? OWN : OTHER, ownerId: ME };
          expect(decide(name, actor(role), target)).toBe(expected);
        });
      }
    }
  }

  it("answers not_found for another branch before it looks at the role (rule 1)", () => {
    // Finance has no right to step 1 at all, yet another branch still says only "Not found".
    expect(decide("request.approve_step1", actor("FINANCE"), { branchId: OTHER })).toBe(
      "not_found",
    );
    expect(decide("request.approve_step1", actor("FINANCE"), { branchId: OWN })).toBe("forbidden");
  });

  it("refuses the Head at step 2 in any branch: the matrix says No", () => {
    expect(decide("request.approve_step2", actor("HEAD"), { branchId: OTHER })).toBe("forbidden");
  });

  it("lets a Manager act on own requests only, and refuses a colleague's request of the same branch", () => {
    const manager = actor("MANAGER");
    expect(decide("purchase.record", manager, { branchId: OWN, ownerId: ME })).toBe("allow");
    expect(decide("purchase.record", manager, { branchId: OWN, ownerId: COLLEAGUE })).toBe(
      "forbidden",
    );
    // The Head records on any request of any branch.
    expect(decide("purchase.record", actor("HEAD"), { branchId: OTHER, ownerId: COLLEAGUE })).toBe(
      "allow",
    );
  });

  it.each(MANAGER_RIGHTS)("%s switched off refuses the Manager in every own branch", (right) => {
    const guarded = PERMISSION_NAMES.filter((name) => EXPECTED_MATRIX[name].right === right);
    const manager = actor("MANAGER", { branchIds: [OWN, OTHER], disabledRights: [right] });
    for (const name of guarded) {
      for (const branchId of [OWN, OTHER]) {
        expect(decide(name, manager, { branchId, ownerId: ME }), name).toBe("forbidden");
      }
    }
    // A switch takes away only its own actions: the Manager still sees the branch.
    expect(decide("data.view", manager, { branchId: OWN })).toBe("allow");
  });

  it("never refuses the Head by a right: switches apply to Managers only", () => {
    const head = actor("HEAD", { disabledRights: [...MANAGER_RIGHTS] });
    expect(decide("request.create", head, { branchId: OWN })).toBe("allow");
    expect(decide("stock.issue", head, { branchId: OTHER })).toBe("allow");
  });

  it("throws, as a programming error, for a branch permission asked without a branch", () => {
    expect(() => decide("request.create", actor("MANAGER"))).toThrow(/needs a branch/);
  });

  it("throws for an own-requests permission asked without the owner", () => {
    expect(() => decide("purchase.record", actor("MANAGER"), { branchId: OWN })).toThrow(
      /needs the request's owner/,
    );
  });
});

describe("decideList(): a list of a branch permission (developer-rules.md rule 4; plan of 1.12, decision 1)", () => {
  it("lets every role with a grant list, and no role without one", () => {
    expect(decideList("catalog.suggest", actor("HEAD"))).toBe("allow");
    expect(decideList("catalog.suggest", actor("MANAGER"))).toBe("allow");
    expect(decideList("catalog.suggest", actor("PRINCIPAL"))).toBe("forbidden");
    expect(decideList("catalog.suggest", actor("FINANCE"))).toBe("forbidden");
  });

  it("refuses a Manager whose right guarding the permission is off (03, Manager rights)", () => {
    const off = actor("MANAGER", { disabledRights: ["ISSUE_STOCK"] });
    expect(decideList("stock.issue", off)).toBe("forbidden");
    expect(decideList("stock.transfer", off)).toBe("allow");
  });

  it("answers a global permission as decide() does", () => {
    expect(decideList("catalog.manage", actor("HEAD"))).toBe("allow");
    expect(decideList("catalog.manage", actor("MANAGER"))).toBe("forbidden");
  });

  it("is never asked about a permission of own requests", () => {
    expect(() => decideList("request.edit", actor("MANAGER"))).toThrow();
  });
});
