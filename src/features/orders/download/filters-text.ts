import type { ListStatus } from "@/domain/order-list";
import type { PaymentType } from "@/domain/payment-types";
import { formatDate } from "@/i18n/format";

import { type ListFilters, NO_FILTERS } from "../list-filters";

import type { OrderDownload } from "../queries/order-list";

// The filters line of the download (05-order-request-form.md, Download 2: "the filters used …
// on every page"; plan of 2.14, What will exist, and the spec review's Must fix 2): every
// parameter of ListFilters that is set, in words, in the downloader's language. "No filters" only
// when none is set. The names of ids come from orderDownload(), read inside the walls; an id it
// could not name prints "—" (decided item 4, Look first).

/** The words the line needs, already in the downloader's language. */
export type FiltersWords = {
  none: string;
  label: (list: string) => string;
  dateKind: (kind: ListFilters["dates"]) => string;
  dateRange: (kind: string, from: string, to: string) => string;
  dateFrom: (kind: string, from: string) => string;
  dateTo: (kind: string, to: string) => string;
  numberRange: (from: string, to: string) => string;
  numberFrom: (from: string) => string;
  numberTo: (to: string) => string;
  item: (label: string, value: string) => string;
  unknown: string;
  sort: (sort: string) => string;
  /** The filter labels of the list's filter bar. */
  labels: Record<"branch" | "status" | "owner" | "department" | "category" | "payment", string>;
  urgent: string;
  action: string;
  status: (status: ListStatus) => string;
  payment: (type: PaymentType) => string;
  sortName: (sort: ListFilters["sort"]) => string;
};

/** The filters used, as one line. */
export function filtersText(
  filters: ListFilters,
  names: OrderDownload["names"],
  words: FiltersWords,
): string {
  const parts: string[] = [];
  const named = (label: keyof FiltersWords["labels"], name: string | null) =>
    parts.push(words.item(words.labels[label], name ?? words.unknown));

  if (filters.from || filters.to) {
    const kind = words.dateKind(filters.dates);
    if (filters.from && filters.to) {
      parts.push(words.dateRange(kind, formatDate(filters.from), formatDate(filters.to)));
    } else if (filters.from) {
      parts.push(words.dateFrom(kind, formatDate(filters.from)));
    } else if (filters.to) {
      parts.push(words.dateTo(kind, formatDate(filters.to)));
    }
  }
  if (filters.branch) named("branch", names.branch);
  if (filters.status) parts.push(words.item(words.labels.status, words.status(filters.status)));
  if (filters.owner) named("owner", names.owner);
  if (filters.department) named("department", names.department);
  if (filters.category) named("category", names.category);
  if (filters.payment) parts.push(words.item(words.labels.payment, words.payment(filters.payment)));
  if (filters.urgent) parts.push(words.urgent);
  if (filters.numberFrom && filters.numberTo) {
    parts.push(words.numberRange(filters.numberFrom, filters.numberTo));
  } else if (filters.numberFrom) {
    parts.push(words.numberFrom(filters.numberFrom));
  } else if (filters.numberTo) {
    parts.push(words.numberTo(filters.numberTo));
  }
  if (filters.action) parts.push(words.action);

  if (parts.length === 0) {
    // The sort alone is no filter: the line says so, and names the sort when it is not the default.
    return filters.sort === NO_FILTERS.sort
      ? words.none
      : `${words.none}. ${words.sort(words.sortName(filters.sort))}`;
  }
  if (filters.sort !== NO_FILTERS.sort) parts.push(words.sort(words.sortName(filters.sort)));
  return words.label(parts.join("; "));
}
