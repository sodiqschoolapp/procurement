import { describe, expect, it } from "vitest";

import { type Permission, ROLES, type Role } from "@/domain/permissions";
import { AuthorizationError } from "@/server/authorize";

import {
  EXPECTED_MATRIX,
  type Answer,
  type Place,
  expectedAnswer,
} from "../permission-matrix-expected";
import { insertBranch, setManagerRight } from "./branches";
import { type InsertedUser, insertUser } from "./users";

// The permission-matrix test generator (15-quality-and-acceptance.md, Test layers: "The full
// permission matrix: each action × each role × own branch and other branch"). Every later task
// calls it with its server action as `run`; the answer each case expects comes from the hand-
// written table of tests/permission-matrix-expected.ts, never from src/domain/permissions.ts.

export type MatrixCase = {
  /** The user who acts: of the role under test, member of `ownBranchId` (the Head of none). */
  user: InsertedUser;
  /** The branch the action is about: the user's own, or another one. */
  branchId: string;
  /** The user's own branch, also when `branchId` is the other one. */
  ownBranchId: string;
  /**
   * Who owns the request an "own requests" action works on: `user` in the cases of the table, a
   * colleague Manager of the own branch in the colleague case. `run` builds the request with
   * this owner and lets the action read the owner from it.
   */
  ownerId: string;
};

/** Runs the action and reads its answer: no error is "allow", an AuthorizationError its kind. */
async function answerOf(action: () => Promise<unknown>): Promise<Answer> {
  try {
    await action();
    return "allow";
  } catch (error) {
    if (error instanceof AuthorizationError) return error.kind;
    throw error;
  }
}

async function setUp(role: Role, place: Place): Promise<MatrixCase> {
  const own = await insertBranch();
  const other = await insertBranch();
  // Another user of the same role in the other branch, so "other" is a branch where the role
  // does act (D40: the refused data is beside the allowed case).
  if (role !== "HEAD") await insertUser(role, { branches: [other.id] });
  const user = await insertUser(role, { branches: role === "HEAD" ? [] : [own.id] });
  return {
    user,
    branchId: place === "own" ? own.id : other.id,
    ownBranchId: own.id,
    ownerId: user.id,
  };
}

/**
 * Writes one database test per role × own branch × other branch, and for a permission guarded by
 * a Manager right one more: the Manager of two branches with that right switched off, refused in
 * both (A13; build-plan 1.4). For an
 * "own requests" permission one more: the Manager on a colleague's request of the own branch.
 * `run` acts as `user` on `branchId`; for an "own requests" permission it acts on a request the
 * user owns.
 */
export function describePermissionMatrix(
  name: string,
  options: { permission: Permission; run: (each: MatrixCase) => Promise<unknown> },
): void {
  const { permission, run } = options;
  const entry = EXPECTED_MATRIX[permission];

  describe(`${name}: permission matrix, "${entry.row}" (03-roles-and-permissions.md)`, () => {
    for (const role of ROLES) {
      for (const place of ["own", "other"] as const) {
        const expected = expectedAnswer(permission, role, place);
        it(`${role} in ${place} branch: ${expected}`, async () => {
          const each = await setUp(role, place);
          expect(await answerOf(() => run(each))).toBe(expected);
        });
      }
    }

    // Each right that guards the permission, the second of 03's ADD_PRODUCTS row too (D66).
    for (const right of [entry.right, entry.alsoRight]) {
      if (!right) continue;
      // A13: "The switches … apply to a Manager in all of their branches" (build-plan 1.4).
      it(`MANAGER with ${right} switched off: forbidden in each own branch; HEAD still allowed`, async () => {
        const first = await insertBranch();
        const second = await insertBranch();
        const user = await insertUser("MANAGER", { branches: [first.id, second.id] });
        await setManagerRight(user.id, right, false);
        const cases = [first, second].map((branch) => ({
          user,
          branchId: branch.id,
          ownBranchId: branch.id,
          ownerId: user.id,
        }));
        for (const each of cases) expect(await answerOf(() => run(each))).toBe("forbidden");

        const head = await insertUser("HEAD");
        for (const each of cases) {
          expect(await answerOf(() => run({ ...each, user: head }))).toBe("allow");
        }
      });
    }

    if (entry.MANAGER === "owner") {
      it("MANAGER on a colleague's request of the own branch: forbidden; HEAD on it: allow", async () => {
        const each = await setUp("MANAGER", "own");
        const colleague = await insertUser("MANAGER", { branches: [each.ownBranchId] });
        const onColleagues = { ...each, ownerId: colleague.id };
        expect(await answerOf(() => run(onColleagues))).toBe("forbidden");

        const head = await insertUser("HEAD");
        expect(await answerOf(() => run({ ...onColleagues, user: head }))).toBe("allow");
      });
    }
  });
}
