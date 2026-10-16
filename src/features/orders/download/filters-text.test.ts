import { describe, expect, it } from "vitest";

import { ordersTotals } from "@/domain/order-totals";
import type { Locale } from "@/i18n/locale";

import { type ListFilters, NO_FILTERS } from "../list-filters";

import type { OrderDownload } from "../queries/order-list";
import { downloadSheet } from "./columns";

// The filters line of the download (05-order-request-form.md, Download 2: "the filters used … on
// every page"; plan of 2.14 and the spec review of the plan, Must fix 2): one case per parameter
// of ListFilters, "No filters" only when none is set, an id the walls did not name as "—"
// (decided item 4, Look first), the words of each language.

const NAMES: OrderDownload["names"] = {
  branch: "INV Invented branch",
  owner: "Invented Owner",
  department: "INV Invented department",
  category: "Invented category",
};

function lineOf(
  filters: Partial<ListFilters>,
  locale: Locale = "en",
  names: OrderDownload["names"] = NAMES,
): string {
  const download: OrderDownload = {
    orders: [],
    totals: ordersTotals([]),
    downloadedBy: "Invented User",
    schoolName: null,
    names,
  };
  return downloadSheet(
    download,
    { ...NO_FILTERS, ...filters },
    locale,
    new Date("2026-10-16T07:00:00Z"),
  ).filtersLine;
}

const ID = "6f1c1a52-6b7e-4d3c-9a2b-0c1d2e3f4a5b";

describe("the filters line (05 Download 2)", () => {
  it('says "No filters" when none is set, in each language', () => {
    expect(lineOf({})).toBe("No filters");
    expect(lineOf({}, "ru")).toBe("Без фильтров");
    expect(lineOf({}, "uz")).toBe("Filtrsiz");
  });

  it("names each date kind with a full range and with one bound", () => {
    expect(lineOf({ from: "2026-10-12", to: "2026-10-18" })).toBe(
      "Filters: Created: 12.10.2026 – 18.10.2026",
    );
    expect(lineOf({ dates: "submitted", from: "2026-10-12" })).toBe(
      "Filters: Submitted: from 12.10.2026",
    );
    expect(lineOf({ dates: "approved", to: "2026-10-18" })).toBe(
      "Filters: Approved: to 18.10.2026",
    );
    expect(lineOf({ dates: "closed", from: "2026-10-01", to: "2026-10-31" })).toBe(
      "Filters: Closed: 01.10.2026 – 31.10.2026",
    );
  });

  it("names the branch, owner, department and category by the names the walls gave", () => {
    expect(lineOf({ branch: ID })).toBe("Filters: Branch: INV Invented branch");
    expect(lineOf({ owner: ID })).toBe("Filters: Owner: Invented Owner");
    expect(lineOf({ department: ID })).toBe("Filters: Department: INV Invented department");
    expect(lineOf({ category: ID })).toBe("Filters: Category: Invented category");
  });

  it('prints "—" for an id the walls did not name; it still counts as a filter', () => {
    const none = { branch: null, owner: null, department: null, category: null };
    expect(lineOf({ owner: ID, department: ID }, "en", none)).toBe(
      "Filters: Owner: —; Department: —",
    );
  });

  it("names the status, the payment type and Urgent in words", () => {
    expect(lineOf({ status: "PENDING_PRINCIPAL" })).toBe("Filters: Status: Waiting for Principal");
    expect(lineOf({ payment: "TRANSFER" })).toBe("Filters: Payment type: Bank transfer");
    expect(lineOf({ urgent: true })).toBe("Filters: Urgent only");
  });

  it("names a number range and one bound", () => {
    expect(lineOf({ numberFrom: "INV-26-0100", numberTo: "INV-26-0150" })).toBe(
      "Filters: Numbers: INV-26-0100 – INV-26-0150",
    );
    expect(lineOf({ numberFrom: "INV-26-0100" })).toBe("Filters: Numbers: from INV-26-0100");
    expect(lineOf({ numberTo: "INV-26-0150" })).toBe("Filters: Numbers: to INV-26-0150");
  });

  it("names the orders of one action alone: the notification link (Must fix 2)", () => {
    expect(lineOf({ action: ID })).toBe("Filters: Orders of one action");
  });

  it("names a sort that is not the default, with or without filters", () => {
    expect(lineOf({ sort: "product" })).toBe("No filters. Sort: Product");
    expect(lineOf({ urgent: true, sort: "submitted" })).toBe(
      "Filters: Urgent only; Sort: Submitted, oldest first",
    );
  });

  it("joins every filter in the list's order, in Russian and Uzbek too", () => {
    const all: Partial<ListFilters> = {
      from: "2026-10-12",
      to: "2026-10-18",
      status: "PENDING_HEAD",
      payment: "CASH",
      urgent: true,
    };
    expect(lineOf(all)).toBe(
      "Filters: Created: 12.10.2026 – 18.10.2026; Status: Waiting for Head; Payment type: Cash; Urgent only",
    );
    expect(lineOf(all, "ru")).toMatch(
      /^Фильтры: .+: 12\.10\.2026 – 18\.10\.2026; .+Ждёт руководителя/,
    );
    expect(lineOf(all, "uz")).toMatch(
      /^Filtrlar: .+: 12\.10\.2026 – 18\.10\.2026; .+Rahbarni kutmoqda/,
    );
  });
});
