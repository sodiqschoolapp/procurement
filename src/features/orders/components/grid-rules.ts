import { draftComment, requesterName, urgentReason } from "@/domain/drafts";
import { parseSom } from "@/domain/money";
import {
  ORDER_FIELDS,
  ORDER_FIELDS_DEFAULT,
  type OrderField,
  type OrderFields,
  placeOf,
} from "@/domain/order-fields";
import { QUANTITY, quantityOf } from "@/domain/order-totals";
import type { WireDraftRow } from "@/features/orders/draft-wire";

// A rule of the drafts grid's screen that is not a business rule (plan of 2.5b, decided item 2,
// Look first; spec review of 2.5b, Must fix 3): "Apply to ticked" is offered only when every
// ticked row may be edited. A read-only row (a Manager with CREATE_REQUESTS off) may be ticked
// for the totals under the grid, never edited. The rights come from draftRowRights().

export function canApplyToTicked(
  ticked: readonly string[],
  rights: ReadonlyMap<string, { editable: boolean }>,
): boolean {
  return ticked.length > 0 && ticked.every((id) => rights.get(id)?.editable === true);
}

/**
 * Whether Submit is offered on the ticked rows (plan of 2.7): every one is submittable, as
 * draftSubmittable() of src/domain/drafts.ts says (the state machine offers SUBMIT; developer-rules
 * rule 2). A button every ticked row would refuse is not shown (.claude/rules/ui.md).
 */
export function canSubmitTicked(
  ticked: readonly string[],
  rights: ReadonlyMap<string, { submittable: boolean }>,
): boolean {
  return ticked.length > 0 && ticked.every((id) => rights.get(id)?.submittable === true);
}

/**
 * Whether Submit again is offered on the ticked rows (05 Drafts 5; plan of 2.11, decided item 9):
 * every one is submittable again, as draftSubmittableAgain() of src/domain/drafts.ts says (the
 * state machine offers SUBMIT_AGAIN: the owner's only). One action makes one move, so ticks of
 * drafts and sent-back orders together offer neither button.
 */
export function canSubmitAgainTicked(
  ticked: readonly string[],
  rights: ReadonlyMap<string, { submittableAgain: boolean }>,
): boolean {
  return ticked.length > 0 && ticked.every((id) => rights.get(id)?.submittableAgain === true);
}

/**
 * Whether the ticks hold drafts and sent-back orders together, each of which this person may
 * submit: then neither Submit nor Submit again is offered (one action makes one move) and the bar
 * says to submit them apart (owner's report of 23.10.2026: "submit is not appearing").
 */
export function ticksMixDraftsAndSentBack(
  ticked: readonly string[],
  rights: ReadonlyMap<string, { submittable: boolean; submittableAgain: boolean }>,
): boolean {
  const kinds = ticked.map((id) => rights.get(id));
  return (
    kinds.every((right) => right?.submittable === true || right?.submittableAgain === true) &&
    kinds.some((right) => right?.submittable === true) &&
    kinds.some((right) => right?.submittableAgain === true)
  );
}

/** The ticked set as one text, so a kept Submit key belongs to these drafts only (correction 4). */
export function submitKeyFor(ids: readonly string[]): string {
  return [...ids].sort().join(",");
}

/** The grid columns a Submit refusal can name (`data-col`, and the column's label). */
export type SubmitCell =
  | "branch"
  | "product"
  | "company"
  | "requestedBy"
  | "neededBy"
  | "quantity"
  | "price"
  | "extras"
  | "priority"
  | "comment";

const CELL_OF_FIELD: Readonly<Record<string, SubmitCell>> = {
  branchId: "branch",
  variantId: "product",
  companyId: "company",
  departmentId: "requestedBy",
  requesterName: "requestedBy",
  neededBy: "neededBy",
  quantity: "quantity",
  price: "price",
  extras: "extras",
  urgentReason: "priority",
  priority: "priority",
  comment: "comment",
};

/** The grid column of a field a Submit refuses (05 Checks at submit); an extra-cost row's is extras. */
export function cellOfField(field: string): SubmitCell {
  if (field.startsWith("extras.")) return "extras";
  return CELL_OF_FIELD[field] ?? "product";
}

/**
 * The sheet's column of each field the Head sets (05 Fields the Head sets; plan of 2.5d): its
 * `data-col` and the key of its label under `orders.columns`.
 */
export const SHEET_COLUMN_OF = {
  department: "requestedBy",
  neededBy: "neededBy",
  price: "price",
  paymentType: "paymentType",
  priority: "priority",
  brand: "company",
  requesterName: "requesterName",
  comment: "comment",
  referencePhoto: "photo",
  extras: "extras",
} as const satisfies Record<OrderField, string>;

export type SheetFieldColumn = (typeof SHEET_COLUMN_OF)[OrderField];

/**
 * The order of the fields in the row: the six cells of 2.5c first (department, then quantity,
 * price and needed-by date), then any other field the Head put in the row, in the order of 05's
 * table; quantity is not a field the Head sets and stands after the department.
 */
const ROW_ORDER: readonly OrderField[] = [
  "department",
  "price",
  "neededBy",
  "brand",
  "requesterName",
  "comment",
  "referencePhoto",
  "paymentType",
  "priority",
  "extras",
];

/** The fields in the row, in their order; a hidden one is in neither list (05 rule 2). */
export function rowFields(fields: OrderFields): OrderField[] {
  return ROW_ORDER.filter((field) => placeOf(fields, field) === "row");
}

/** The fields under "More", in the order of 05's table (11 Order list layout 3; 05 rule 1). */
export function moreFields(fields: OrderFields): OrderField[] {
  return ORDER_FIELDS.filter((field) => placeOf(fields, field) === "more");
}

/**
 * The columns of the sheet, in their order: the branch for a user with several branches, the
 * product, the department where it stands in the row, the quantity, the other fields in the row,
 * the total; "More" only when a field stands there.
 */
export function sheetColumns(fields: OrderFields, showBranch: boolean) {
  const inRow = rowFields(fields);
  return [
    ...(showBranch ? (["branch"] as const) : []),
    "product" as const,
    ...(inRow.includes("department") ? (["requestedBy"] as const) : []),
    "quantity" as const,
    ...inRow.filter((field) => field !== "department").map((field) => SHEET_COLUMN_OF[field]),
    "total" as const,
    ...(moreFields(fields).length > 0 ? (["more"] as const) : []),
    "state" as const,
    "actions" as const,
  ];
}

/** The field of the Head's table a refused cell belongs to; `null` for one always in the row. */
function settingFieldOf(field: string): OrderField | null {
  if (field.startsWith("extras")) return "extras";
  const byCell: Record<string, OrderField> = {
    departmentId: "department",
    neededBy: "neededBy",
    price: "price",
    companyId: "brand",
    requesterName: "requesterName",
    paymentType: "paymentType",
    priority: "priority",
    urgentReason: "priority",
    comment: "comment",
    referencePhotoFileId: "referencePhoto",
  };
  return byCell[field] ?? null;
}

/**
 * Whether a field stands under "More" on the sheet as the Head set it, so its mark opens "More"
 * (plan of 2.5c, decided item 9; 05 Fields the Head sets 1).
 */
export function inMore(field: string, fields: OrderFields = ORDER_FIELDS_DEFAULT): boolean {
  const settingField = settingFieldOf(field);
  return settingField !== null && placeOf(fields, settingField) === "more";
}

/** Where the scroll to a refused field goes: its cell, or its field under "More". */
export function sheetCellOf(field: string): string {
  if (field === "referencePhotoFileId") return "photo";
  if (field === "urgentReason") return "priority";
  if (field === "requesterName") return "requesterName";
  return cellOfField(field);
}

/**
 * What a new draft takes from the draft above it (05 Drafts 6: "A new draft takes the branch,
 * department and needed-by date of the draft above it; each can be changed"): the last row of the
 * page shown, its three fields as they are (plan of 2.5c, decided item 5). Nothing without a row.
 */
export function copiedFromAbove(
  rows: readonly Pick<WireDraftRow, "branchId" | "departmentId" | "neededBy">[],
): { branchId: string; departmentId: string | null; neededBy: string | null } | null {
  const above = rows.at(-1);
  if (!above) return null;
  return {
    branchId: above.branchId,
    departmentId: above.departmentId,
    neededBy: above.neededBy,
  };
}

/**
 * Whether the row the server holds now carries every field a retried save sent (review of the
 * plan of 2.6, correction 1; developer-rules.md rule 9). A retry answered `stale` counts as saved
 * only then: the first try was saved and only its answer was lost. Each field is compared as the
 * server stores it (the same normalizers of src/domain/). A field this cannot compare (the
 * extra-cost rows) answers false: the row then takes the stale path of 2.5b, which shows the
 * server's row and asks for the change again, never a silent loss.
 */
export function rowHoldsSent(row: WireDraftRow, sent: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(sent).every(([field, value]) => holds(row, field, value));
}

const blankToNull = (text: string) => (text === "" ? null : text);

function holds(row: WireDraftRow, field: string, value: unknown): boolean {
  switch (field) {
    case "branchId":
    case "variantId":
    case "departmentId":
    case "companyId":
    case "referencePhotoFileId":
    case "neededBy":
    case "paymentType":
    case "priority":
      return (row[field] ?? null) === (value ?? null);
    case "quantity": {
      if (typeof value !== "string" || row.quantity === null) return false;
      const typed = value.trim();
      if (!QUANTITY.test(typed)) return false;
      return quantityOf(typed).eq(quantityOf(row.quantity));
    }
    case "price": {
      if (value === null || (typeof value === "string" && value.trim() === "")) {
        return row.price === null;
      }
      if (typeof value !== "string" || row.price === null) return false;
      const typed = parseSom(value);
      return typed !== null && typed === BigInt(row.price);
    }
    case "comment":
      return typeof value === "string"
        ? blankToNull(draftComment(value)) === row.comment
        : value == null && row.comment === null;
    case "requesterName":
      return typeof value === "string"
        ? blankToNull(requesterName(value)) === row.requesterName
        : value == null && row.requesterName === null;
    case "urgentReason":
      return typeof value === "string"
        ? blankToNull(urgentReason(value)) === row.urgentReason
        : value == null && row.urgentReason === null;
    default:
      return false;
  }
}
