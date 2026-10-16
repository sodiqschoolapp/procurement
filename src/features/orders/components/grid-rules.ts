import { draftComment, requesterName, urgentReason } from "@/domain/drafts";
import { parseSom } from "@/domain/money";
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
