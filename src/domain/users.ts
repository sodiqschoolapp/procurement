import type { Role } from "./permissions";

// The rules of one user account (04-catalogs.md, Catalogs table: Users; 03-roles-and-permissions.md,
// Roles table and rules 2 to 5; 02-assumptions.md A3; build-plan 1.3). Pure: the actions of
// src/features/users/actions/users.ts and the form read them. The database holds the last
// defence: one role column, "exactly one branch for a Principal", "at most one active Principal
// per branch" (migration 0002) and "at least one active Head" (migration 0009).

/** The longest full name and phone, counted by code point (plan of 1.3, decision 11). */
export const FULL_NAME_MAX = 120;
export const PHONE_MIN = 7;
export const PHONE_MAX = 30;

/** "25 rows per page, loaded from the server" (11-screens-and-ux.md rule 8; plan of 1.3, decision 15). */
export const USERS_PAGE_SIZE = 25;

/** The roles a branch must have one active user of (03 rule 5). */
export const STAFFED_ROLES = ["MANAGER", "PRINCIPAL", "FINANCE"] as const satisfies readonly Role[];
export type StaffedRole = (typeof STAFFED_ROLES)[number];

/**
 * The roles a branch is warned about now: all three, but not Finance while the Finance step is off
 * (03 rule 5; 10 Notifications, "Branch has no active user for a role"; plan of 4.10c).
 */
export function staffedRoles(principalStep: boolean, financeStep: boolean): StaffedRole[] {
  return STAFFED_ROLES.filter(
    (role) => (financeStep || role !== "FINANCE") && (principalStep || role !== "PRINCIPAL"),
  );
}

/** Digits, spaces and `+ ( ) -`, such as "+998 90 123-45-67" (decision 11). */
const PHONE_PATTERN = /^[0-9+()\- ]+$/;

function lengthOf(value: string): number {
  return Array.from(value).length;
}

/** The full name as it is stored: trimmed, inner spaces collapsed to one. */
export function fullName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** A stored full name: 1 to 120 code points, already in the form of fullName(). */
export function isFullName(value: unknown): value is string {
  if (typeof value !== "string" || fullName(value) !== value) return false;
  const length = lengthOf(value);
  return length >= 1 && length <= FULL_NAME_MAX;
}

/** The phone as it is stored: trimmed. */
export function phone(value: string): string {
  return value.trim();
}

/** A stored phone: 7 to 30 digits, spaces and `+ ( ) -`, trimmed. */
export function isPhone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  const length = lengthOf(value);
  return length >= PHONE_MIN && length <= PHONE_MAX && PHONE_PATTERN.test(value);
}

/**
 * Whether a role may hold this many branches (03, Roles table): a Head none ("All"), a Principal
 * exactly one, a Manager and a Finance user one or more (decisions 0.7 item 2: "one or more" is
 * the user form's).
 */
export function branchCountFits(role: Role, count: number): boolean {
  if (role === "HEAD") return count === 0;
  if (role === "PRINCIPAL") return count === 1;
  return count >= 1;
}

export type UserFields = {
  fullName: string;
  username: string;
  phone: string;
  locale: "uz" | "ru" | "en";
  branchIds: readonly string[];
};
export type UserField = keyof UserFields;

const USER_FIELDS: readonly UserField[] = ["fullName", "username", "phone", "locale", "branchIds"];

function sameBranches(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
}

/** The fields of `sent` whose value differs from `current`, in a fixed order; branches as a set. */
export function changedUserFields(current: UserFields, sent: Partial<UserFields>): UserField[] {
  return USER_FIELDS.filter((field) => {
    const value = sent[field];
    if (value === undefined) return false;
    if (field === "branchIds") return !sameBranches(current.branchIds, value as readonly string[]);
    return value !== current[field];
  });
}

/** One role of one branch: "branch X has no active Finance user" (03 rule 5). */
export type Place = { branchId: string; role: StaffedRole };

function placeKey(place: Place): string {
  return `${place.branchId} ${place.role}`;
}

/**
 * The places held before a change and empty after it, each once, in the order of `before`
 * (10, Notifications: "Branch has no active user for a role"; plan of 1.3, decision 7). A place
 * empty before is no news. A role `staffedRoles()` leaves out (the Principal or Finance while its
 * step is off) is no news either.
 */
export function vacatedPlaces(
  before: readonly Place[],
  after: readonly Place[],
  principalStep: boolean,
  financeStep: boolean,
): Place[] {
  const warned = new Set<string>(staffedRoles(principalStep, financeStep));
  const held = new Set(after.map(placeKey));
  const seen = new Set<string>();
  const vacated: Place[] = [];
  for (const place of before) {
    const key = placeKey(place);
    if (held.has(key) || seen.has(key) || !warned.has(place.role)) continue;
    seen.add(key);
    vacated.push(place);
  }
  return vacated;
}
