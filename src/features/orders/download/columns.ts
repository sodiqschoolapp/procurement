import { createTranslator } from "next-intl";

import { APPROVAL_STEPS, type ApprovalStep } from "@/domain/order-download";
import type { ListStatus } from "@/domain/order-list";
import { PAYMENT_TYPES } from "@/domain/payment-types";
import { bindFormatters } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";

import type { ListFilters } from "../list-filters";

import type { OrderDownload } from "../queries/order-list";
import { filtersText } from "./filters-text";

// The one table both downloads draw (05-order-request-form.md, Download 1 to 3; plan of 2.14):
// the columns, one line per order, the totals and the lines at the top of each page, in the
// downloader's language. Every number is one orderDownload() gave, from the domain functions; the
// Excel file and the PDF only lay it out (excel.ts, pdf.tsx). Every word comes from the message
// files (CLAUDE.md rule 13); dates and times from the shared formatters (11 rule 10).

const MESSAGES = { uz, ru, en } satisfies Record<Locale, unknown>;

/**
 * The columns of an order's line, in the file's order (05 Download 1): the planned part, then
 * "from Open onward actual quantity, actual price, actual extra costs, actual total and
 * difference" (plan of 3.5).
 */
export const DOWNLOAD_COLUMNS = [
  "number",
  "status",
  "branch",
  "owner",
  "department",
  "product",
  "subtype",
  "quantity",
  "measure",
  "price",
  "extras",
  "paymentType",
  "plannedTotal",
  "actualQty",
  "actualPrice",
  "actualExtras",
  "actualTotal",
  "difference",
] as const;
export type DownloadColumn = (typeof DOWNLOAD_COLUMNS)[number];

export type DownloadLine = {
  number: string;
  status: ListStatus;
  statusWord: string;
  branch: string;
  owner: string;
  department: string;
  product: string;
  subtype: string;
  /** Plain decimal text. */
  quantity: string;
  measure: string;
  /** Null for an order without a planned price: the cell reads `noPlannedPrice` (08 Numbers). */
  price: bigint | null;
  extras: bigint;
  paymentType: string;
  plannedTotal: bigint | null;
  /**
   * From status Open on, the actual numbers of orderDownloadRow(); null before, an empty cell
   * (plan of 3.5, decided item 6, Look first). `actualPrice` is null while nothing is received;
   * `difference` is planned − actual, below 0 when more was spent (08).
   */
  actualQty: string | null;
  actualPrice: bigint | null;
  actualExtras: bigint | null;
  actualTotal: bigint | null;
  difference: bigint | null;
  /** Who finished each approval step, and when as `dd.mm.yyyy HH:mm`; empty when not finished. */
  steps: Record<ApprovalStep, { name: string; at: string }>;
};

export type DownloadSheet = {
  locale: Locale;
  title: string;
  sheetName: string;
  schoolName: string | null;
  filtersLine: string;
  downloadedLine: string;
  /** "Page {page} of {pages}" in the downloader's language. */
  pageLine: (page: number, pages: number) => string;
  titles: Record<DownloadColumn, string>;
  stepTitles: Record<ApprovalStep, { name: string; at: string }>;
  lines: DownloadLine[];
  totalsTitle: string;
  /** The fields of the list's totals bar: goods, extra costs, grand total, then each payment type. */
  totals: { key: string; label: string; amount: bigint }[];
  /** "No planned price", the cell of a missing planned price or planned total (08 Numbers). */
  noPlannedPrice: string;
  /**
   * How many orders the totals leave out for having no planned price, as a line under them; null
   * when none (08 Numbers: "a sum that leaves orders out says how many").
   */
  unpricedLine: string | null;
  formatMoney: (amount: bigint) => string;
  formatQuantity: (value: string) => string;
};

/** The table of a download. `at` is the moment of the download, from the injected clock. */
export function downloadSheet(
  download: OrderDownload,
  filters: ListFilters,
  locale: Locale,
  at: Date,
): DownloadSheet {
  const messages = MESSAGES[locale];
  const t = createTranslator({ locale, messages, namespace: "orders.download" });
  const tRoot = createTranslator({ locale, messages });
  const format = bindFormatters(locale, tRoot("format.currency"));
  const moment = (value: Date) => `${format.date(value)} ${format.time(value)}`;
  const revision = (number: string, rev: number) =>
    rev >= 2 ? `${number} ${tRoot("orders.revision", { revision: rev })}` : number;

  const filtersLine = filtersText(filters, download.names, {
    none: t("filters.none"),
    label: (list) => t("filters.label", { list }),
    dateKind: (kind) => tRoot(`orders.list.filters.dateKinds.${kind}`),
    dateRange: (kind, from, to) => t("filters.dateRange", { kind, from, to }),
    dateFrom: (kind, from) => t("filters.dateFrom", { kind, from }),
    dateTo: (kind, to) => t("filters.dateTo", { kind, to }),
    numberRange: (from, to) => t("filters.numberRange", { from, to }),
    numberFrom: (from) => t("filters.numberFrom", { from }),
    numberTo: (to) => t("filters.numberTo", { to }),
    item: (label, value) => t("filters.item", { label, value }),
    unknown: t("filters.unknown"),
    sort: (sort) => t("filters.sort", { sort }),
    labels: {
      branch: tRoot("orders.list.filters.branch"),
      status: tRoot("orders.list.filters.status"),
      owner: tRoot("orders.list.filters.owner"),
      department: tRoot("orders.list.filters.department"),
      category: tRoot("orders.list.filters.category"),
      payment: tRoot("orders.list.filters.payment"),
    },
    urgent: tRoot("orders.list.filters.urgent"),
    action: tRoot("orders.list.filters.action"),
    status: (status) => tRoot(`requestStatus.${status}`),
    payment: (type) => tRoot(`paymentTypes.${type}`),
    sortName: (sort) => tRoot(`orders.list.filters.sorts.${sort}`),
  });

  const stepTitles = Object.fromEntries(
    APPROVAL_STEPS.map((step) => {
      const role = tRoot(`roles.${step}`);
      return [step, { name: t("columns.step", { role }), at: t("columns.stepAt", { role }) }];
    }),
  ) as DownloadSheet["stepTitles"];

  return {
    locale,
    title: t("title"),
    sheetName: t("sheet"),
    schoolName: download.schoolName,
    filtersLine,
    downloadedLine: t("downloadedBy", { name: download.downloadedBy, at: moment(at) }),
    pageLine: (page, pages) => t("page", { page, pages }),
    titles: Object.fromEntries(
      DOWNLOAD_COLUMNS.map((column) => [column, t(`columns.${column}`)]),
    ) as DownloadSheet["titles"],
    stepTitles,
    lines: download.orders.map((order) => ({
      number: revision(order.number, order.revision),
      status: order.status,
      statusWord: tRoot(`requestStatus.${order.status}`),
      branch: order.branchCode,
      owner: order.ownerName,
      // An order without a department leaves the cell empty (05 Fields the Head sets 3).
      department: order.departmentName ?? "",
      product: order.productName,
      subtype: order.subtypeName ?? "",
      quantity: order.quantity,
      measure: order.unitShortName,
      price: order.price,
      extras: order.row.extras,
      paymentType: tRoot(`paymentTypes.${order.paymentType}`),
      plannedTotal: order.row.plannedTotal,
      actualQty: order.row.actual?.qty ?? null,
      actualPrice: order.row.actual?.unitPrice ?? null,
      actualExtras: order.row.actual?.extras ?? null,
      actualTotal: order.row.actual?.total ?? null,
      difference: order.row.actual?.difference ?? null,
      steps: Object.fromEntries(
        APPROVAL_STEPS.map((step) => {
          const by = order.row.approvals[step];
          // The Finance step of an order that skipped Finance, and the Principal step of one that
          // skipped the Principal, read "Skipped" (06 Finance step switched off; Principal step
          // switched off; 11 Order page layout 3; plans of 4.10c and 4.10d).
          if (by === "skipped") return [step, { name: t("skipped"), at: "" }];
          return [step, by ? { name: by.name, at: moment(by.at) } : { name: "", at: "" }];
        }),
      ) as DownloadLine["steps"],
    })),
    totalsTitle: t("totals"),
    totals: [
      { key: "goods", label: tRoot("orders.totals.goods"), amount: download.totals.goods },
      { key: "extras", label: tRoot("orders.totals.extras"), amount: download.totals.extras },
      { key: "grand", label: tRoot("orders.totals.grand"), amount: download.totals.grand },
      ...PAYMENT_TYPES.map((type) => ({
        key: type,
        label: tRoot(`paymentTypes.${type}`),
        amount: download.totals.byPaymentType[type],
      })),
    ],
    noPlannedPrice: tRoot("orders.unpriced.none"),
    unpricedLine:
      download.totals.unpriced === 0 ? null : t("unpriced", { count: download.totals.unpriced }),
    formatMoney: format.money,
    formatQuantity: format.quantity,
  };
}
