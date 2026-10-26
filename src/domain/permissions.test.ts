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
  actorMay,
  mayInSomeBranch,
  roleMay,
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
    expect("alsoRight" in rule ? rule.alsoRight : undefined).toBe(expected.alsoRight);
  });

  it("guards a permission with every one of the ten Manager rights", () => {
    const used = new Set(
      PERMISSION_NAMES.flatMap((name) => [
        EXPECTED_MATRIX[name].right,
        EXPECTED_MATRIX[name].alsoRight,
      ]),
    );
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
    const guarded = PERMISSION_NAMES.filter(
      (name) => EXPECTED_MATRIX[name].right === right || EXPECTED_MATRIX[name].alsoRight === right,
    );
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
    // A global permission with a right too (plan of 1.12b, decided item 1, Look first).
    expect(decide("catalog.add", head)).toBe("allow");
  });

  it("a global permission's right refuses a Manager whose switch is off, and only that Manager (03 Manager rights: ADD_PRODUCTS)", () => {
    expect(decide("catalog.add", actor("MANAGER"))).toBe("allow");
    expect(decide("catalog.add", actor("MANAGER", { disabledRights: ["ADD_PRODUCTS"] }))).toBe(
      "forbidden",
    );
    // Another switch leaves it alone.
    expect(decide("catalog.add", actor("MANAGER", { disabledRights: ["SET_MINIMUMS"] }))).toBe(
      "allow",
    );
    expect(decideList("catalog.add", actor("MANAGER", { disabledRights: ["ADD_PRODUCTS"] }))).toBe(
      "forbidden",
    );
  });

  it("adding needs both rights: CREATE_REQUESTS off refuses the Manager with ADD_PRODUCTS on, never the Head (03 Manager rights: ADD_PRODUCTS 'works only while Add and submit orders is on too'; D66)", () => {
    const off = actor("MANAGER", { disabledRights: ["CREATE_REQUESTS"] });
    expect(decide("catalog.add", off)).toBe("forbidden");
    expect(decideList("catalog.add", off)).toBe("forbidden");
    expect(
      decide(
        "catalog.add",
        actor("MANAGER", { disabledRights: ["CREATE_REQUESTS", "ADD_PRODUCTS"] }),
      ),
    ).toBe("forbidden");
    expect(decide("catalog.add", actor("HEAD", { disabledRights: ["CREATE_REQUESTS"] }))).toBe(
      "allow",
    );
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

describe("roleMay(): a button shown only when it works (11-screens-and-ux.md)", () => {
  it("answers a global permission by role, as the matrix does", () => {
    expect(roleMay("catalog.manage", "HEAD")).toBe(true);
    for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      expect(roleMay("catalog.manage", role)).toBe(false);
    }
  });

  it("is never asked about a branch permission", () => {
    expect(() => roleMay("catalog.suggest", "HEAD")).toThrow();
  });
});

describe("actorMay(): the product search's Add line (plan of 1.12b, decided item 10)", () => {
  it("answers with the role and the Manager's switch", () => {
    expect(actorMay("catalog.add", actor("HEAD", { disabledRights: ["ADD_PRODUCTS"] }))).toBe(true);
    expect(actorMay("catalog.add", actor("MANAGER"))).toBe(true);
    expect(actorMay("catalog.add", actor("MANAGER", { disabledRights: ["ADD_PRODUCTS"] }))).toBe(
      false,
    );
    // Either right off hides the line (D66).
    expect(actorMay("catalog.add", actor("MANAGER", { disabledRights: ["CREATE_REQUESTS"] }))).toBe(
      false,
    );
    expect(actorMay("catalog.add", actor("PRINCIPAL"))).toBe(false);
    expect(actorMay("catalog.add", actor("FINANCE"))).toBe(false);
  });

  it("is never asked about a branch permission", () => {
    expect(() => actorMay("request.create", actor("HEAD"))).toThrow();
  });
});

describe("mayInSomeBranch(): the Manager home's three buttons (11 Interface per role; 03 Manager rights; plan of 6.1, decided item 3)", () => {
  const BUTTONS = ["request.create", "purchase.record", "stock.issue"] as const;

  it("the Manager and the Head may use each; the Principal and Finance none", () => {
    for (const permission of BUTTONS) {
      expect(mayInSomeBranch(permission, actor("MANAGER")), permission).toBe(true);
      expect(mayInSomeBranch(permission, actor("HEAD")), permission).toBe(true);
      expect(mayInSomeBranch(permission, actor("PRINCIPAL")), permission).toBe(false);
      expect(mayInSomeBranch(permission, actor("FINANCE")), permission).toBe(false);
    }
  });

  it("an 'own orders' grant counts, where decideList() throws", () => {
    expect(() => decideList("purchase.record", actor("MANAGER"))).toThrow();
    expect(mayInSomeBranch("purchase.record", actor("MANAGER"))).toBe(true);
  });

  it("each switched-off right takes its own button away, and only that one", () => {
    const rights = {
      "request.create": "CREATE_REQUESTS",
      "purchase.record": "RECORD_PURCHASES",
      "stock.issue": "ISSUE_STOCK",
    } as const;
    for (const permission of BUTTONS) {
      const off = actor("MANAGER", { disabledRights: [rights[permission]] });
      for (const other of BUTTONS) {
        expect(mayInSomeBranch(other, off), `${rights[permission]} off, ${other}`).toBe(
          other !== permission,
        );
      }
    }
  });

  it("a switch never applies to the Head (03 Manager rights)", () => {
    const head = actor("HEAD", { disabledRights: [...MANAGER_RIGHTS] });
    for (const permission of BUTTONS) expect(mayInSomeBranch(permission, head)).toBe(true);
  });

  it("a Manager without a branch may use none", () => {
    for (const permission of BUTTONS) {
      expect(mayInSomeBranch(permission, actor("MANAGER", { branchIds: [] }))).toBe(false);
    }
  });

  it("a global permission is a programming error", () => {
    expect(() => mayInSomeBranch("catalog.manage", actor("HEAD"))).toThrow();
  });
});
