// The checks at submit of one draft (05-order-request-form.md, Checks at submit: "Every required
// field of every ticked order is filled, and no order uses a deactivated catalog entry. No
// needed-by date is in the past."; Order fields 1 to 14; edge-cases/requests-and-approval.md, "A
// product is deactivated while it sits in a draft": "Submit is blocked and the draft is marked").
// Pure: the Submit action reads every fact under its locks and asks submitRefusals() for each
// ticked order; one order with a refusal stops the whole submit (06 rule 8). The grid's mark of an
// inactive entry reads inactiveEntries() (plan of 2.7, decided item 9).

import { type BusinessDate } from "./business-date";
import { type QuantityRefusal, isUrgentReason, quantityRefusal } from "./drafts";

/**
 * The facts of one draft at submit, each read from the database. An entry's `…Active` is whether
 * the entry the draft names is active; `null` when the draft names none. The catalog entries are
 * those the order itself holds: branch, product and subtype, department, brand or company, each
 * extra cost type; never the product's measure or category (review of the plan of 2.7,
 * correction 1: field 9 is "Automatic from the product", the category is no order field).
 */
export type SubmitFacts = {
  branchActive: boolean;
  variantId: string | null;
  /** The subtype and its product are both active (04 rule 2; decisions 2.5a item 20). */
  subtypeActive: boolean | null;
  /** The measure of the product allows decimals (05 field 10); `null` without a subtype. */
  allowsDecimals: boolean | null;
  departmentId: string | null;
  departmentActive: boolean | null;
  companyId: string | null;
  companyActive: boolean | null;
  neededBy: BusinessDate | null;
  quantity: string | null;
  price: bigint | null;
  priority: "NORMAL" | "URGENT";
  urgentReason: string | null;
  extras: readonly { active: boolean }[];
};

/** Why one field of a draft stops its submit, as a field error kind (`errors.field.<kind>`). */
export type SubmitRefusal = "required" | "inactive" | "inPast" | QuantityRefusal;

/**
 * The cells of the deactivated entries a draft names (edge case "A product is deactivated while
 * it sits in a draft": "the draft is marked"), by the field names of the draft actions.
 */
export function inactiveEntries(
  facts: Pick<
    SubmitFacts,
    | "branchActive"
    | "variantId"
    | "subtypeActive"
    | "departmentId"
    | "departmentActive"
    | "companyId"
    | "companyActive"
    | "extras"
  >,
): string[] {
  const cells: string[] = [];
  if (!facts.branchActive) cells.push("branchId");
  if (facts.variantId !== null && facts.subtypeActive === false) cells.push("variantId");
  if (facts.departmentId !== null && facts.departmentActive === false) cells.push("departmentId");
  if (facts.companyId !== null && facts.companyActive === false) cells.push("companyId");
  facts.extras.forEach((extra, at) => {
    if (!extra.active) cells.push(`extras.${at}.extraCostTypeId`);
  });
  return cells;
}

/**
 * Every field that stops this draft's submit, by the field names of the draft actions; empty when
 * it may be submitted. `today` is the business date of the submit in Tashkent
 * (`businessDate(now())`): a needed-by date of today passes, of yesterday fails (05 field 8; plan
 * of 2.7, decided item 2).
 */
export function submitRefusals(
  facts: SubmitFacts,
  today: BusinessDate,
): Record<string, SubmitRefusal> {
  const refused: Record<string, SubmitRefusal> = {};
  for (const cell of inactiveEntries(facts)) refused[cell] = "inactive";

  // 05 fields 2 and 3: the product and, where it has subtypes, the subtype; a draft names both
  // through its subtype.
  if (facts.variantId === null) refused.variantId = "required";
  // 05 field 7.
  if (facts.departmentId === null) refused.departmentId = "required";
  // 05 field 8: required, and not in the past at submit. Both are YYYY-MM-DD, so the text order
  // is the date order.
  if (facts.neededBy === null) refused.neededBy = "required";
  else if (facts.neededBy < today) refused.neededBy = "inPast";
  // 05 field 10: more than 0, decimals only where the measure allows them.
  const quantity =
    facts.quantity === null
      ? "required"
      : quantityRefusal(facts.quantity, facts.allowsDecimals ?? true);
  if (quantity) refused.quantity = quantity;
  // 05 field 11: whole so'm, more than 0.
  if (facts.price === null) refused.price = "required";
  else if (facts.price <= 0n) refused.price = "tooSmall";
  // 05 field 14: Urgent needs a short reason.
  if (facts.priority === "URGENT" && !isUrgentReason(facts.urgentReason)) {
    refused.urgentReason = "required";
  }
  return refused;
}
