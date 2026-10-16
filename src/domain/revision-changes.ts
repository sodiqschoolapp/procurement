// What changed on a re-submitted order (06-approval-workflow.md rule 5: "On a re-submitted order,
// approvers see the changed fields highlighted, with old and new values side by side"; 15 S5;
// plan of 2.11, decided item 3, Look first). The two sides are full copies of the order taken at
// submit (14-data-model.md, order_revisions): the newest copy of the revision before and the
// newest of the current one. Pure: the caller reads the copies and puts names to the ids.

import Decimal from "decimal.js";

/** One full copy of an order at submit, as Submit writes it (plan of 2.7, decided item 12). */
export type RevisionSnapshot = {
  variantId: string | null;
  companyId: string | null;
  departmentId: string | null;
  requesterName: string | null;
  neededBy: string | null;
  /** numeric(14,3) as text. */
  quantity: string | null;
  /** Whole so'm as text. */
  price: string | null;
  extras: readonly { extraCostTypeId: string; amount: string }[];
  plannedTotal: string | null;
  paymentType: string | null;
  priority: string | null;
  urgentReason: string | null;
  comment: string | null;
  referencePhotoFileId: string | null;
};

/**
 * The fields compared, in the order they are shown: the plan fields of `orders_plan_frozen`
 * (migration 0019) and the planned total. Not the number, the branch or the stock at submit:
 * none of them is the owner's edit (review of the plan, decision 3).
 */
export const REVISION_FIELDS = [
  "variantId",
  "companyId",
  "departmentId",
  "requesterName",
  "neededBy",
  "quantity",
  "price",
  "paymentType",
  "priority",
  "urgentReason",
  "comment",
  "referencePhotoFileId",
] as const;
export type RevisionField = (typeof REVISION_FIELDS)[number];

export type RevisionChange =
  | { kind: "field"; field: RevisionField; from: string | null; to: string | null }
  /** One extra cost type: its amount before and after, null where the order had none. */
  | { kind: "extra"; extraCostTypeId: string; from: string | null; to: string | null }
  | { kind: "total"; from: string | null; to: string | null };

/** Quantities and amounts are compared as numbers, never as text ("80.000" is 80). */
function sameNumber(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Decimal(a).equals(new Decimal(b));
}

/** The extra costs per type: the sum of the order's rows of that type, whole so'm as text. */
function extrasByType(extras: RevisionSnapshot["extras"]): Map<string, string> {
  const sums = new Map<string, bigint>();
  for (const { extraCostTypeId, amount } of extras) {
    sums.set(extraCostTypeId, (sums.get(extraCostTypeId) ?? 0n) + BigInt(amount));
  }
  return new Map([...sums].map(([type, sum]) => [type, sum.toString()]));
}

/**
 * Every field that differs between the copy before and the copy now, in the order of
 * REVISION_FIELDS, then the extra costs in the order they first appear, then the planned total.
 * Nothing when the order was submitted again unchanged.
 */
export function revisionChanges(
  before: RevisionSnapshot,
  after: RevisionSnapshot,
): RevisionChange[] {
  const changes: RevisionChange[] = [];
  for (const field of REVISION_FIELDS) {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    const same = field === "quantity" || field === "price" ? sameNumber(from, to) : from === to;
    if (!same) changes.push({ kind: "field", field, from, to });
  }

  const extrasBefore = extrasByType(before.extras);
  const extrasAfter = extrasByType(after.extras);
  for (const type of new Set([...extrasBefore.keys(), ...extrasAfter.keys()])) {
    const from = extrasBefore.get(type) ?? null;
    const to = extrasAfter.get(type) ?? null;
    if (!sameNumber(from, to)) changes.push({ kind: "extra", extraCostTypeId: type, from, to });
  }

  if (!sameNumber(before.plannedTotal, after.plannedTotal)) {
    changes.push({ kind: "total", from: before.plannedTotal, to: after.plannedTotal });
  }
  return changes;
}
