import ExcelJS from "exceljs";

import type { BusinessDate } from "@/domain/business-date";

import {
  MONEY_FORMAT,
  QUANTITY_FORMAT,
  moneyCellValue,
  quantityCellValue,
  signedMoneyCellValue,
} from "@/features/orders/download/excel";

// One Analytics table as an Excel file (10-notifications-analytics-reports.md, Analytics page per
// role, point 4: "Each chart and table exports to Excel"; 13 "Excel and PDF": ExcelJS; build-plan
// 6.3). The title and the period lines first, then a bold header row with an auto-filter, the
// rows, and the total. No formula: every number is the one the query read, so the file and the
// screen never disagree. Money is a number cell exactly as in the order list's download (plan of
// 2.14, decided item 3); a change may be below 0; a date is a date cell.

export type CellValue =
  | { kind: "text"; value: string }
  | { kind: "money"; value: bigint }
  | { kind: "signedMoney"; value: bigint }
  | { kind: "date"; value: BusinessDate }
  /** A count of orders (plan of 6.4): a whole number, never money. */
  | { kind: "count"; value: number }
  /** A quantity's numeric(14,3) text, a number cell (Reports, plan of 6.8). */
  | { kind: "quantity"; value: string };

export type AnalyticsSheet = {
  name: string;
  /** The lines above the table: its title, the period, the filters. */
  heading: string[];
  columns: string[];
  rows: CellValue[][];
  /**
   * The label and the amount of the total line, in the last money column; none when the table's
   * rows are not the whole of a number (the top 10 suppliers, the counts of Plan vs actual).
   */
  total?: { label: string; amount: bigint; signed?: boolean; column?: number };
};

const DATE_FORMAT = "dd.mm.yyyy";

function cellOf(cell: CellValue): string | number | Date {
  switch (cell.kind) {
    case "text":
      return cell.value;
    case "money":
      return moneyCellValue(cell.value);
    case "signedMoney":
      return signedMoneyCellValue(cell.value);
    case "count":
      return cell.value;
    case "quantity":
      return quantityCellValue(cell.value);
    case "date":
      // Midnight UTC of the Tashkent business date: Excel shows the date itself.
      return new Date(`${cell.value}T00:00:00Z`);
  }
}

export async function writeAnalyticsExcel(sheet: AnalyticsSheet): Promise<Uint8Array<ArrayBuffer>> {
  return writeAnalyticsWorkbook([sheet]);
}

/**
 * Several tables as one file, a sheet each in the order given (the Reports, plan of 6.8, decided
 * item 8). Their names must differ within 31 characters.
 */
export async function writeAnalyticsWorkbook(
  sheets: readonly AnalyticsSheet[],
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) addSheet(workbook, sheet);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function addSheet(workbook: ExcelJS.Workbook, sheet: AnalyticsSheet) {
  // Excel limits a sheet name to 31 characters.
  const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31));
  for (const line of sheet.heading) worksheet.addRow([line]);
  if (sheet.heading[0]) worksheet.getRow(1).font = { bold: true };
  worksheet.addRow([]);
  const headerRow = worksheet.addRow(sheet.columns);
  headerRow.font = { bold: true };
  worksheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: sheet.columns.length },
  };
  // The total's column: the one it names, else the last plain money column of the rows, else the
  // second (an empty table keeps its label in the first; review of 6.4a's download test).
  let moneyColumn = sheet.total?.column ?? 0;
  const named = moneyColumn > 0;
  for (const cells of sheet.rows) {
    const row = worksheet.addRow(cells.map(cellOf));
    cells.forEach((cell, index) => {
      if (cell.kind === "money" || cell.kind === "signedMoney") {
        row.getCell(index + 1).numFmt = MONEY_FORMAT;
        if (cell.kind === "money" && !named) moneyColumn = index + 1;
      }
      if (cell.kind === "date") row.getCell(index + 1).numFmt = DATE_FORMAT;
      if (cell.kind === "quantity") row.getCell(index + 1).numFmt = QUANTITY_FORMAT;
    });
  }
  if (sheet.total) {
    if (moneyColumn === 0) moneyColumn = 2;
    const totalRow = worksheet.addRow([sheet.total.label]);
    totalRow.getCell(moneyColumn).value = sheet.total.signed
      ? signedMoneyCellValue(sheet.total.amount)
      : moneyCellValue(sheet.total.amount);
    totalRow.getCell(moneyColumn).numFmt = MONEY_FORMAT;
    totalRow.font = { bold: true };
  }
  sheet.columns.forEach((_, index) => {
    worksheet.getColumn(index + 1).width = index === 0 ? 30 : 18;
  });
}
