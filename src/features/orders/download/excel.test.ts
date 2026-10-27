import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { MONEY_MAX } from "@/domain/money";

import type { DownloadSheet } from "./columns";
import {
  MONEY_FORMAT,
  QUANTITY_FORMAT,
  moneyCellValue,
  quantityCellValue,
  signedMoneyCellValue,
  writeOrdersExcel,
} from "./excel";

// CLAUDE.md rule 6 (no float touches money) and plan of 2.14, decided item 3 (Look first), with
// the plan review's correction 1: a money cell holds exactly the bigint up to MONEY_MAX, 15 digits,
// which Excel shows and sums exactly; above it the writer refuses. A quantity of numeric(14,3)
// reads back as the same decimal. Money cells carry `#,##0`, quantity cells General (spec review
// of the plan, Should fix 1).

type Actual = Pick<
  DownloadSheet["lines"][number],
  "actualQty" | "actualPrice" | "actualExtras" | "actualTotal" | "difference"
>;

const NO_ACTUAL: Actual = {
  actualQty: null,
  actualPrice: null,
  actualExtras: null,
  actualTotal: null,
  difference: null,
};

function sheetWith(
  price: bigint,
  quantity: string,
  total: bigint,
  actual: Actual = NO_ACTUAL,
): DownloadSheet {
  const step = { name: "", at: "" };
  return {
    locale: "en",
    title: "Orders",
    sheetName: "Orders",
    schoolName: null,
    filtersLine: "No filters",
    downloadedLine: "Downloaded by Invented User, 16.10.2026 10:00",
    pageLine: (page, pages) => `Page ${page} of ${pages}`,
    titles: {
      number: "Number",
      status: "Status",
      branch: "Branch",
      owner: "Owner",
      department: "Department",
      product: "Product",
      subtype: "Subtype",
      quantity: "Quantity",
      measure: "Measure",
      price: "Price per unit",
      extras: "Extra costs",
      paymentType: "Payment type",
      plannedTotal: "Planned total",
      actualQty: "Actual quantity",
      actualPrice: "Actual price",
      actualExtras: "Actual extra costs",
      actualTotal: "Actual total",
      difference: "Difference",
    },
    stepTitles: {
      HEAD: { name: "Head", at: "Head, time" },
      PRINCIPAL: { name: "Principal", at: "Principal, time" },
      FINANCE: { name: "Finance", at: "Finance, time" },
    },
    lines: [
      {
        number: "INV-26-0001",
        status: "PENDING_HEAD",
        statusWord: "Waiting for Head",
        branch: "INV",
        owner: "Invented Owner",
        department: "Invented Department",
        product: "Invented pen",
        subtype: "",
        quantity,
        measure: "pcs",
        price,
        extras: 0n,
        paymentType: "Cash",
        plannedTotal: total,
        ...actual,
        steps: { HEAD: step, PRINCIPAL: step, FINANCE: step },
      },
    ],
    totalsTitle: "Totals",
    totals: [{ key: "grand", label: "Grand total", amount: total }],
    noPlannedPrice: "No planned price",
    unpricedLine: null,
    formatMoney: (amount) => String(amount),
    formatQuantity: (value) => value,
  };
}

async function firstRow(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0]!;
  return { worksheet, row: worksheet.getRow(2) };
}

describe("the Excel money cell (CLAUDE.md rule 6; decided item 3)", () => {
  it("MONEY_MAX, 999 999 999 999 999 so'm, is written and read back exactly", async () => {
    expect(MONEY_MAX).toBe(999_999_999_999_999n);
    const { worksheet, row } = await firstRow(
      await writeOrdersExcel(sheetWith(MONEY_MAX, "1", MONEY_MAX)),
    );
    expect(row.getCell(10).value).toBe(999_999_999_999_999);
    expect(BigInt(row.getCell(10).value as number)).toBe(MONEY_MAX);
    expect(BigInt(row.getCell(13).value as number)).toBe(MONEY_MAX);
    // The totals row under the table goes through the same writer.
    const grand = worksheet.getRow(worksheet.rowCount);
    expect(BigInt(grand.getCell(13).value as number)).toBe(MONEY_MAX);
  });

  it("1 000 000 000 000 000 so'm, the first amount past 15 digits, is refused", async () => {
    expect(() => moneyCellValue(MONEY_MAX + 1n)).toThrow(RangeError);
    await expect(writeOrdersExcel(sheetWith(1n, "1", MONEY_MAX + 1n))).rejects.toThrow(RangeError);
    expect(() => moneyCellValue(-1n)).toThrow(RangeError);
  });

  it("a quantity of numeric(14,3) reads back as the same decimal text", async () => {
    for (const text of ["0.125", "12345678901.125"]) {
      const { row } = await firstRow(await writeOrdersExcel(sheetWith(1n, text, 1n)));
      expect(String(row.getCell(8).value)).toBe(text);
    }
    expect(() => quantityCellValue("1e3")).toThrow(RangeError);
  });

  it("money cells carry #,##0 and quantity cells the General format (11 rule 10)", async () => {
    const { row } = await firstRow(await writeOrdersExcel(sheetWith(1_250_000n, "12", 1n)));
    expect(row.getCell(10).numFmt).toBe(MONEY_FORMAT);
    expect(row.getCell(11).numFmt).toBe(MONEY_FORMAT);
    expect(row.getCell(13).numFmt).toBe(MONEY_FORMAT);
    expect(row.getCell(8).numFmt ?? QUANTITY_FORMAT).toBe(QUANTITY_FORMAT);
  });
});

describe("the actual columns (05 Download 1; plan of 3.5, decided item 6)", () => {
  // Columns 14 to 18: actual quantity, actual price, actual extra costs, actual total, difference.
  it("before Open the five cells are empty", async () => {
    const { row } = await firstRow(await writeOrdersExcel(sheetWith(5_000n, "100", 520_000n)));
    for (const column of [14, 15, 16, 17, 18]) expect(row.getCell(column).value).toBeNull();
  });

  it("from Open on they are number cells; a negative difference too (15 S3: over 30 000)", async () => {
    const { row } = await firstRow(
      await writeOrdersExcel(
        sheetWith(5_000n, "100", 520_000n, {
          actualQty: "100",
          actualPrice: 5_200n,
          actualExtras: 30_000n,
          actualTotal: 550_000n,
          difference: -30_000n,
        }),
      ),
    );
    expect(row.getCell(14).value).toBe(100);
    expect(row.getCell(15).value).toBe(5_200);
    expect(row.getCell(16).value).toBe(30_000);
    expect(row.getCell(17).value).toBe(550_000);
    expect(row.getCell(18).value).toBe(-30_000);
    expect(row.getCell(18).numFmt).toBe(MONEY_FORMAT);
  });

  it("a signed money cell is bounded at ±MONEY_MAX (CLAUDE.md rule 6)", () => {
    expect(signedMoneyCellValue(-MONEY_MAX)).toBe(-999_999_999_999_999);
    expect(signedMoneyCellValue(MONEY_MAX)).toBe(999_999_999_999_999);
    expect(() => signedMoneyCellValue(-MONEY_MAX - 1n)).toThrow(RangeError);
    expect(() => signedMoneyCellValue(MONEY_MAX + 1n)).toThrow(RangeError);
  });
});
