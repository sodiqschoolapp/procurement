import ExcelJS from "exceljs";

import { APPROVAL_STEPS } from "@/domain/order-download";
import { MONEY_MAX } from "@/domain/money";
import { QUANTITY } from "@/domain/order-totals";

import { DOWNLOAD_COLUMNS, type DownloadColumn, type DownloadSheet } from "./columns";

// The order list as an Excel file (05-order-request-form.md, Download 1; 13 "Excel and PDF":
// ExcelJS; plan of 2.14). One sheet: a bold header row, frozen, with an auto-filter; one row per
// order; the totals under it. No formula: every number is the one the server read from the domain
// functions, so file and screen can never disagree (05 Download 3).
//
// Money is a number cell (decided item 3, Look first, and the plan review's correction 1): the
// bigint is handed to ExcelJS as a number only from 0 to MONEY_MAX, 15 digits, which a double and
// Excel both hold exactly; nothing is computed on it. A quantity is numeric(14,3) text, at most 14
// significant digits, handed over the same way.

/** Excel shows the reader's own group separator for `,` (spec review of the plan, Should fix 1). */
export const MONEY_FORMAT = "#,##0";
/** The General format: no trailing zeros and no stray point. */
export const QUANTITY_FORMAT = "General";

/** Whole so'm as the number Excel stores; refused above 15 digits or below 0 (CLAUDE.md rule 6). */
export function moneyCellValue(amount: bigint): number {
  if (typeof amount !== "bigint" || amount < 0n || amount > MONEY_MAX) {
    throw new RangeError(`An amount of ${String(amount)} so'm cannot be an exact Excel number`);
  }
  return Number(amount);
}

/** A quantity's numeric(14,3) text as the number Excel stores. */
export function quantityCellValue(text: string): number {
  if (!QUANTITY.test(text)) throw new RangeError(`A quantity is "${text}": not numeric(14,3)`);
  return Number(text);
}

const MONEY_COLUMNS = new Set<DownloadColumn>(["price", "extras", "plannedTotal"]);

const WIDTHS: Record<DownloadColumn, number> = {
  number: 16,
  status: 22,
  branch: 8,
  owner: 22,
  department: 22,
  product: 28,
  subtype: 18,
  quantity: 10,
  measure: 8,
  price: 14,
  extras: 14,
  paymentType: 18,
  plannedTotal: 16,
};

/** The workbook of a download, as the bytes of an .xlsx file. */
export async function writeOrdersExcel(sheet: DownloadSheet): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheet.sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  worksheet.columns = [
    ...DOWNLOAD_COLUMNS.map((column) => ({
      header: sheet.titles[column],
      key: column,
      width: WIDTHS[column],
      style: MONEY_COLUMNS.has(column)
        ? { numFmt: MONEY_FORMAT }
        : column === "quantity"
          ? { numFmt: QUANTITY_FORMAT }
          : {},
    })),
    ...APPROVAL_STEPS.flatMap((step) => [
      { header: sheet.stepTitles[step].name, key: `${step}.name`, width: 22 },
      { header: sheet.stepTitles[step].at, key: `${step}.at`, width: 18 },
    ]),
  ];
  worksheet.getRow(1).font = { bold: true };

  for (const line of sheet.lines) {
    worksheet.addRow({
      number: line.number,
      status: line.statusWord,
      branch: line.branch,
      owner: line.owner,
      department: line.department,
      product: line.product,
      subtype: line.subtype,
      quantity: quantityCellValue(line.quantity),
      measure: line.measure,
      price: moneyCellValue(line.price),
      extras: moneyCellValue(line.extras),
      paymentType: line.paymentType,
      plannedTotal: moneyCellValue(line.plannedTotal),
      ...Object.fromEntries(
        APPROVAL_STEPS.flatMap((step) => [
          // A step not finished is an empty cell, not an empty text.
          [`${step}.name`, line.steps[step].name || null],
          [`${step}.at`, line.steps[step].at || null],
        ]),
      ),
    });
  }
  const lastColumn = DOWNLOAD_COLUMNS.length + APPROVAL_STEPS.length * 2;
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: lastColumn } };

  // The totals under the rows, after one empty row: the label beside the planned total's column.
  worksheet.addRow([]);
  const labelColumn = DOWNLOAD_COLUMNS.indexOf("paymentType") + 1;
  const amountColumn = DOWNLOAD_COLUMNS.indexOf("plannedTotal") + 1;
  const titleRow = worksheet.addRow([]);
  titleRow.getCell(labelColumn).value = sheet.totalsTitle;
  titleRow.font = { bold: true };
  for (const total of sheet.totals) {
    const row = worksheet.addRow([]);
    row.getCell(labelColumn).value = total.label;
    row.getCell(amountColumn).value = moneyCellValue(total.amount);
    row.getCell(amountColumn).numFmt = MONEY_FORMAT;
    if (total.key === "grand") row.font = { bold: true };
  }

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
