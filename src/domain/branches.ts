// The rules of one branch (04-catalogs.md, Catalogs table: Branches; rule 3; build-plan 1.2).
// Pure: the actions of src/features/catalog/actions/branches.ts and the form read them, and the
// database holds the same code rule and the unique name as its last defence (14-data-model.md,
// branches; constraints of 0.7).

/** "The code is 2 to 4 Latin capital letters" (04, Branches). */
export const BRANCH_CODE_PATTERN = /^[A-Z]{2,4}$/;

/** The longest name and address, counted by code point (plan of 1.2, decision 9). */
export const BRANCH_NAME_MAX = 120;
export const BRANCH_ADDRESS_MAX = 300;

/** "25 rows per page, loaded from the server" (11-screens-and-ux.md rule 8). */
export const BRANCHES_PAGE_SIZE = 25;

export type BranchFields = { name: string; code: string; address: string };
export type BranchField = keyof BranchFields;

const BRANCH_FIELDS: readonly BranchField[] = ["name", "code", "address"];

/** Whether a code is 2 to 4 Latin capital letters; nothing is upper-cased (decision 8). */
export function isBranchCode(value: unknown): value is string {
  return typeof value === "string" && BRANCH_CODE_PATTERN.test(value);
}

/**
 * The name as it is stored: trimmed, inner spaces collapsed to one (04 rule 3, "ignoring capital
 * letters and extra spaces"; decision 9). Uniqueness itself is compared in the database.
 */
export function branchName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** The address as it is stored: trimmed. */
export function branchAddress(value: string): string {
  return value.trim();
}

function lengthOf(value: string): number {
  return Array.from(value).length;
}

/** A stored name: 1 to 120 code points, already in the form of branchName(). */
export function isBranchName(value: unknown): value is string {
  if (typeof value !== "string" || branchName(value) !== value) return false;
  const length = lengthOf(value);
  return length >= 1 && length <= BRANCH_NAME_MAX;
}

/** A stored address: 1 to 300 code points, trimmed. */
export function isBranchAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  const length = lengthOf(value);
  return length >= 1 && length <= BRANCH_ADDRESS_MAX;
}

/** The fields of `sent` whose value differs from `current`, in a fixed order. */
export function changedBranchFields(
  current: BranchFields,
  sent: Partial<BranchFields>,
): BranchField[] {
  return BRANCH_FIELDS.filter(
    (field) => sent[field] !== undefined && sent[field] !== current[field],
  );
}
