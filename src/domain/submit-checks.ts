// The checks at submit of one draft (05-order-request-form.md, Checks at submit: "Every required
// field of every ticked order is filled, and no order uses a deactivated catalog entry. No
// needed-by date is in the past."; Order fields 1 to 14; edge-cases/requests-and-approval.md, "A
// product is deactivated while it sits in a draft": "Submit is blocked and the draft is marked").
// Pure: the Submit action reads every fact under its locks and asks submitRefusals() for each
// ticked order; one order with a refusal stops the whole submit (06 rule 8). The grid's mark of an
// inactive entry reads inactiveEntries() (plan of 2.7, decided item 9).

import { type BusinessDate } from "./business-date";
import { type QuantityRefusal, isUrgentReason, quantityRefusal } from "./drafts";
import { ORDER_ACTION_MAX } from "./order-moves";
import {
  ORDER_FIELDS_DEFAULT,
  type OrderField,
  type OrderFields,
  isHidden,
  isRequired,
} from "./order-fields";

/**
 * The facts of one draft at submit, each read from the database. An entry's `…Active` is whether
 * the entry the draft names is active; `null` when the draft names none. The catalog entries are
 * those the order itself holds: branch, product and subtype, department, brand or company, each
 * extra cost type; never the product's measure or category (review of the plan of 2.7,
 * correction 1: field 9 is "Automatic from the product", the category is no order field).
 */
export type SubmitFacts = {
  /**
   * The order has a number: it was submitted before (sent back or taken back), and keeps what it
   * holds in a hidden field (05 Fields the Head sets 4; plan of 2.5d, decided item 2).
   */
  numbered: boolean;
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
  requesterName: string | null;
  comment: string | null;
  referencePhotoFileId: string | null;
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

/** The cell of each field of 05's table, by the field names of the draft actions. */
const CELL_OF: { [Field in OrderField]: string } = {
  department: "departmentId",
  neededBy: "neededBy",
  price: "price",
  paymentType: "paymentType",
  priority: "urgentReason",
  brand: "companyId",
  requesterName: "requesterName",
  comment: "comment",
  referencePhoto: "referencePhotoFileId",
  extras: "extras",
};

/**
 * Every field that stops this draft's submit, by the field names of the draft actions; empty when
 * it may be submitted. `today` is the business date of the submit in Tashkent
 * (`businessDate(now())`): a needed-by date of today passes, of yesterday fails (05 field 8; plan
 * of 2.7, decided item 2). `fields` is the setting `order_fields` at the moment of the submit (05
 * Fields the Head sets 4; Checks at submit: "Every field the Head's field settings require is
 * filled"). A hidden field of a draft that never had a number is not checked: the submit stores its
 * hidden value (05 rule 2; plan of 2.5d, decided item 2). A numbered order keeps what it holds, so
 * a hidden field of it is checked as an optional one.
 */
export function submitRefusals(
  facts: SubmitFacts,
  today: BusinessDate,
  fields: OrderFields = ORDER_FIELDS_DEFAULT,
): Record<string, SubmitRefusal> {
  const refused: Record<string, SubmitRefusal> = {};
  for (const cell of inactiveEntries(facts)) refused[cell] = "inactive";
  const required = (field: OrderField) => isRequired(fields, field);

  // 05 fields 2 and 3: the product and, where it has subtypes, the subtype; a draft names both
  // through its subtype. Always asked (05 Fields the Head sets).
  if (facts.variantId === null) refused.variantId = "required";
  // 05 field 7, as the Head set it.
  if (facts.departmentId === null && required("department")) refused.departmentId = "required";
  // 05 field 8, as the Head set it; a date that is given is not in the past at submit (Checks at
  // submit: "No needed-by date that is given is in the past"). Both are YYYY-MM-DD, so the text
  // order is the date order.
  if (facts.neededBy === null) {
    if (required("neededBy")) refused.neededBy = "required";
  } else if (facts.neededBy < today) refused.neededBy = "inPast";
  // 05 field 10: more than 0, decimals only where the measure allows them. Always asked.
  const quantity =
    facts.quantity === null
      ? "required"
      : quantityRefusal(facts.quantity, facts.allowsDecimals ?? true);
  if (quantity) refused.quantity = quantity;
  // 05 field 11: whole so'm, more than 0, as the Head set it.
  if (facts.price === null) {
    if (required("price")) refused.price = "required";
  } else if (facts.price <= 0n) refused.price = "tooSmall";
  // 05 field 6 and the requester name, comment and reference photo, as the Head set them.
  if (facts.companyId === null && required("brand")) refused.companyId = "required";
  if (facts.requesterName === null && required("requesterName")) refused.requesterName = "required";
  if (facts.comment === null && required("comment")) refused.comment = "required";
  if (facts.referencePhotoFileId === null && required("referencePhoto")) {
    refused.referencePhotoFileId = "required";
  }
  // 05 field 14: Urgent needs a short reason.
  if (facts.priority === "URGENT" && !isUrgentReason(facts.urgentReason)) {
    refused.urgentReason = "required";
  }

  if (!facts.numbered) {
    for (const field of Object.keys(CELL_OF) as OrderField[]) {
      if (!isHidden(fields, field)) continue;
      const cell = CELL_OF[field];
      for (const key of Object.keys(refused)) {
        if (key === cell || key.startsWith(`${cell}.`)) delete refused[key];
      }
    }
  }
  return refused;
}

/** A draft as the order sheet shows it: its cells, and the cells of its deactivated entries. */
export type ShownDraft = {
  /** The draft's number, if it has one (sent back or taken back). */
  number: string | null;
  variantId: string | null;
  allowsDecimals: boolean | null;
  departmentId: string | null;
  companyId: string | null;
  neededBy: BusinessDate | null;
  quantity: string | null;
  price: bigint | null;
  priority: "NORMAL" | "URGENT";
  urgentReason: string | null;
  requesterName: string | null;
  comment: string | null;
  referencePhotoFileId: string | null;
  extras: readonly unknown[];
  /** inactiveEntries() of the draft as read: the cells of its deactivated entries. */
  inactive: readonly string[];
};

/**
 * The facts of a draft as the sheet shows it, for submitRefusals(): the page query and the sheet
 * read readiness from the one function the server asks again (plan of 2.5c, Build 3).
 */
export function shownFacts(draft: ShownDraft): SubmitFacts {
  const inactive = new Set(draft.inactive);
  return {
    numbered: draft.number !== null,
    branchActive: !inactive.has("branchId"),
    variantId: draft.variantId,
    subtypeActive: draft.variantId === null ? null : !inactive.has("variantId"),
    allowsDecimals: draft.allowsDecimals,
    departmentId: draft.departmentId,
    departmentActive: draft.departmentId === null ? null : !inactive.has("departmentId"),
    companyId: draft.companyId,
    companyActive: draft.companyId === null ? null : !inactive.has("companyId"),
    neededBy: draft.neededBy,
    quantity: draft.quantity,
    price: draft.price,
    priority: draft.priority,
    urgentReason: draft.urgentReason,
    requesterName: draft.requesterName,
    comment: draft.comment,
    referencePhotoFileId: draft.referencePhotoFileId,
    extras: draft.extras.map((_, at) => ({
      active: !inactive.has(`extras.${at}.extraCostTypeId`),
    })),
  };
}

/**
 * Whether a draft may be submitted: no field stops it (05 Checks at submit). The one readiness the
 * order sheet marks and counts and the server decides again (plan of 2.5c, Build 3).
 */
export function isReady(
  facts: SubmitFacts,
  today: BusinessDate,
  fields: OrderFields = ORDER_FIELDS_DEFAULT,
): boolean {
  return Object.keys(submitRefusals(facts, today, fields)).length === 0;
}

/**
 * The most own drafts the order sheet loads and a Submit with nothing ticked takes in (plan of
 * 2.5c, decided item 1, Look first); at most ORDER_ACTION_MAX of them are sent.
 */
export const SUBMIT_SET_MAX = 1000;

/**
 * Which drafts of a Submit with nothing ticked go (05 Drafts 4; Checks at submit: "At most 200
 * orders in one submit. With more ready drafts, the first 200 in the order they were added are
 * sent"): the ready ones, oldest first (then by id), up to 200; the ready ones after them are held
 * back for the next Submit; a draft that is not ready stays and takes no place (decided item 4).
 */
export function submitSelection<Draft extends { id: string; createdAt: Date; ready: boolean }>(
  drafts: readonly Draft[],
): { send: Draft[]; heldBack: Draft[]; stay: Draft[] } {
  const ready = drafts
    .filter((draft) => draft.ready)
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  return {
    send: ready.slice(0, ORDER_ACTION_MAX),
    heldBack: ready.slice(ORDER_ACTION_MAX),
    stay: drafts.filter((draft) => !draft.ready),
  };
}

/** What a Cancel of a Draft reads of its plan, each column as the order row holds it. */
export type CancelPlan = {
  variantId: string | null;
  departmentId: string | null;
  neededBy: string | null;
  quantity: string | null;
  price: bigint | null;
  total: bigint | null;
  priority: "NORMAL" | "URGENT";
  urgentReason: string | null;
};

/**
 * The cells a taken-back Draft must have filled before it is cancelled (06 Allowed moves, Cancel
 * row; plan of 2.3b, decided item 14, Look first): a cancelled order keeps the plan that
 * `orders_submitted_plan_check`, `orders_planned_price_total_check` and
 * `orders_urgent_reason_check` ask of every status but Draft. Since D67 that is the subtype, the
 * quantity, and a price only with its total (since 2.5d-b a cancel may be without a price: plan
 * of 2.5d-b, decided item 6, Look first); the department and the needed-by date are free, and the field settings decide a submit, never a Cancel (plan of
 * 2.5d, decided item 6, Look first). Unlike Submit, a date in the past and an
 * inactive entry are no refusal: nothing is bought.
 */
export function cancelPlanGaps(plan: CancelPlan): Record<string, SubmitRefusal> {
  const refused: Record<string, SubmitRefusal> = {};
  if (plan.variantId === null) refused.variantId = "required";
  if (plan.quantity === null) refused.quantity = "required";
  // A cancelled order may be without a price, which every reader of `planned_price` takes since
  // 2.5d-b (plan of 2.5d-b, decided item 6, Look first). A price with a quantity and no total,
  // which the draft writes never leave (the grid's draftTotal()), still refuses on the price cell,
  // so `orders_planned_price_total_check` is never met with a raw error.
  if (plan.price !== null && plan.quantity !== null && plan.total === null) {
    refused.price = "required";
  }
  if (plan.priority === "URGENT" && !isUrgentReason(plan.urgentReason)) {
    refused.urgentReason = "required";
  }
  return refused;
}
