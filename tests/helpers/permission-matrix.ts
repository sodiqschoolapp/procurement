import { describe, expect, it } from "vitest";

import { type Permission, ROLES, type Role } from "@/domain/permissions";
import { AuthorizationError } from "@/server/authorize";

import { EXPECTED_MATRIX, type Answer, type Place, expectedAnswer } from "../permission-matrix-expected";
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
  return { user, branchId: place === "own" ? own.id : other.id, ownBranchId: own.id };
}

/**
 * Writes one database test per role × own branch × other branch, and for a permission guarded by
 * a Manager right one more: the Manager with that right switched off, in the own branch.
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

    const right = entry.right;
    if (right) {
      it(`MANAGER with ${right} switched off: forbidden; HEAD still allowed`, async () => {
        const each = await setUp("MANAGER", "own");
        await setManagerRight(each.user.id, right, false);
        expect(await answerOf(() => run(each))).toBe("forbidden");

        const head = await insertUser("HEAD");
        expect(await answerOf(() => run({ ...each, user: head }))).toBe("allow");
      });
    }
  });
}
