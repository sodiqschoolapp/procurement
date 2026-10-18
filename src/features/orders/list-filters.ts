import { isBusinessDate, type BusinessDate } from "@/domain/business-date";
import { type ListStatus, isListStatus } from "@/domain/order-list";
import { PAYMENT_TYPES, type PaymentType } from "@/domain/payment-types";

// The filters and the sort of the order list, read from the address and written back to it
// (05-order-request-form.md, Ticking and filters: "Filters and sorting stay in the address, so a
// link reopens the same view"; 11-screens-and-ux.md rule 8; plan of 2.8, decided items 9 to 13).
// A broken value is dropped, never an error: a link always opens a list. The server reads these
// again; nothing here is a permission (the branch is authorized by the query).

export const DATE_KINDS = ["created", "submitted", "approved", "closed"] as const;
export type DateKind = (typeof DATE_KINDS)[number];

export const LIST_SORTS = ["neededBy", "submitted", "product"] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export type ListFilters = {
  dates: DateKind;
  from: BusinessDate | null;
  to: BusinessDate | null;
  branch: string | null;
  status: ListStatus | null;
  owner: string | null;
  department: string | null;
  category: string | null;
  payment: PaymentType | null;
  urgent: boolean;
  numberFrom: string | null;
  numberTo: string | null;
  /** The orders of one action: the link of a notification (progress 2.7, "For 2.8"). */
  action: string | null;
  /**
   * The Manager home's "Orders due soon": orders that still wait, needed by today + 7 days or
   * earlier (isDueSoon(); plan of 6.1, decided item 2). In the address as `due=soon`.
   */
  dueSoon: boolean;
  /**
   * The Head home's "Orders stuck over 48 hours": at a Waiting step for more than the setting
   * `escalation_hours` (stuckBefore(); plan of 6.2, decided items 1 and 2). In the address as
   * `stuck=1`.
   */
  stuck: boolean;
  sort: ListSort;
};

export const NO_FILTERS: ListFilters = {
  dates: "created",
  from: null,
  to: null,
  branch: null,
  status: null,
  owner: null,
  department: null,
  category: null,
  payment: null,
  urgent: false,
  numberFrom: null,
  numberTo: null,
  action: null,
  dueSoon: false,
  stuck: false,
  sort: "neededBy",
};

type Raw = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The form of an order number (05 Order number; `orders_number_check`). */
const NUMBER = /^([A-Z]{2,4}-[0-9]{2})-([0-9]{4,9})$/;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

const uuidOf = (value: string | undefined) =>
  value && UUID.test(value) ? value.toLowerCase() : null;
const dateOf = (value: string | undefined) => (value && isBusinessDate(value) ? value : null);
const numberOf = (value: string | undefined) => {
  const upper = value?.toUpperCase();
  return upper && NUMBER.test(upper) ? upper : null;
};
const oneOf = <T extends string>(list: readonly T[], value: string | undefined): T | null =>
  value !== undefined && (list as readonly string[]).includes(value) ? (value as T) : null;

/** The branch code and year of a number, and its counter as an integer (decided item 10). */
export function numberParts(number: string): { prefix: string; counter: number } | null {
  const match = NUMBER.exec(number);
  return match ? { prefix: match[1]!, counter: Number(match[2]) } : null;
}

/**
 * The filters of an address. `ignored` names a value that was given but dropped because it cannot
 * stand with another: a `numberTo` of another branch code or year than `numberFrom`.
 */
export function parseListFilters(raw: Raw): { filters: ListFilters; ignored: "numberTo"[] } {
  const numberFrom = numberOf(first(raw.numberFrom));
  let numberTo = numberOf(first(raw.numberTo));
  const ignored: "numberTo"[] = [];
  if (numberFrom && numberTo && numberParts(numberFrom)!.prefix !== numberParts(numberTo)!.prefix) {
    numberTo = null;
    ignored.push("numberTo");
  }
  const status = first(raw.status);
  return {
    filters: {
      dates: oneOf(DATE_KINDS, first(raw.dates)) ?? NO_FILTERS.dates,
      from: dateOf(first(raw.from)),
      to: dateOf(first(raw.to)),
      branch: uuidOf(first(raw.branch)),
      status: isListStatus(status) ? status : null,
      owner: uuidOf(first(raw.owner)),
      department: uuidOf(first(raw.department)),
      category: uuidOf(first(raw.category)),
      payment: oneOf(PAYMENT_TYPES, first(raw.payment)),
      urgent: first(raw.urgent) === "1",
      numberFrom,
      numberTo,
      action: uuidOf(first(raw.action)),
      dueSoon: first(raw.due) === "soon",
      stuck: first(raw.stuck) === "1",
      sort: oneOf(LIST_SORTS, first(raw.sort)) ?? NO_FILTERS.sort,
    },
    ignored,
  };
}

/** The filters as address parameters, defaults left out, in one fixed order. */
export function listFiltersParams(filters: ListFilters): URLSearchParams {
  const params = new URLSearchParams();
  const put = (name: string, value: string | null) => {
    if (value !== null) params.set(name, value);
  };
  if (filters.from || filters.to) {
    put("dates", filters.dates === NO_FILTERS.dates ? null : filters.dates);
  }
  put("from", filters.from);
  put("to", filters.to);
  put("branch", filters.branch);
  put("status", filters.status);
  put("owner", filters.owner);
  put("department", filters.department);
  put("category", filters.category);
  put("payment", filters.payment);
  put("urgent", filters.urgent ? "1" : null);
  put("numberFrom", filters.numberFrom);
  put("numberTo", filters.numberTo);
  put("action", filters.action);
  put("due", filters.dueSoon ? "soon" : null);
  put("stuck", filters.stuck ? "1" : null);
  put("sort", filters.sort === NO_FILTERS.sort ? null : filters.sort);
  return params;
}

/** How many filters are on, the sort left out (the "Filters (n)" button of a phone). */
export function activeFilterCount(filters: ListFilters): number {
  const params = listFiltersParams(filters);
  params.delete("sort");
  params.delete("dates");
  return [...params.keys()].length;
}
