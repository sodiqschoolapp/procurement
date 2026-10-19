import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { NO_ANALYTICS_FILTERS } from "@/features/analytics/period-params";
import { reportSearch } from "@/features/reports/report-params";

import {
  bought,
  buyingEvent,
  refreshNow,
  spendingScene,
} from "../../../../../tests/helpers/analytics";
import { insertCategory } from "../../../../../tests/helpers/catalog";
import { setClock } from "../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../tests/helpers/files";
import { insertUser, signInAs } from "../../../../../tests/helpers/users";
import { GET } from "./route";

// The report files through their route (build-plan 6.8: "Excel export with real numbers and
// dates"; Done when: "export the spending report and sum a column in Excel"; 10-notifications-
// analytics-reports.md, Reports; 03-roles-and-permissions.md rule 1 and the matrix row "Export to
// Excel, download PDF, print"; plan of 6.8, decided items 2, 8 and 11). 15 May 2031 in Tashkent.

const AT = "2031-05-15T05:00:00Z";
const MAY = { first: "2031-05-01", last: "2031-05-15" };

async function workbookOf(response: Response) {
  expect(response.status).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  return workbook;
}

function rowsOf(sheet: ExcelJS.Worksheet) {
  const rows: unknown[][] = [];
  sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
  return rows;
}

/** The body rows of a sheet: those under the header row, before the total line. */
function bodyOf(sheet: ExcelJS.Worksheet, header: string) {
  const rows = rowsOf(sheet);
  const start = rows.findIndex((row) => row[0] === header);
  return { body: rows.slice(start + 1, -1), total: rows.at(-1)! };
}

describe("GET /reports/download (10 Reports: exports to Excel)", () => {
  it("Spending: five sheets, money and counts as number cells, a column adding up to its total line", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const other = await insertCategory();
    await bought(scene, { purchasedOn: "2031-05-02", qty: "2.500", unitPrice: "3333" });
    await bought(scene, { purchasedOn: "2031-05-03", unitPrice: "5000", categoryId: other.id });
    await bought(scene, { purchasedOn: "2031-05-04", unitPrice: "1200", extras: [300n] });
    await refreshNow();
    const head = await insertUser("HEAD", { locale: "en" });
    const cookie = await signInAs(head);
    const query = reportSearch({
      report: "spending",
      range: MAY,
      filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id },
    });
    const workbook = await workbookOf(
      await GET(downloadRequest(`/reports/download?${query}`, cookie)),
    );
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "By branch",
      "By category",
      "By department",
      "By supplier",
      "By month",
    ]);
    // The Done when's hand step, in a test: the amounts of the category sheet add up to its total.
    const { body, total } = bodyOf(workbook.getWorksheet("By category")!, "Category");
    expect(body).toEqual([
      [scene.category.name, 2, 9_833],
      [other.name, 1, 5_000],
    ]);
    const sum = body.reduce((add, row) => add + (row[2] as number), 0);
    expect(total).toEqual(["Total", undefined, 14_833]);
    expect(sum).toBe(14_833);
  });

  it("Purchase register: dates as date cells, quantities and money as numbers, cancelled records on their own sheet", async () => {
    setClock(AT);
    const scene = await spendingScene();
    await bought(scene, { purchasedOn: "2031-05-03", qty: "1.500", unitPrice: "2000" });
    await bought(scene, { purchasedOn: "2031-05-04", unitPrice: "4000", extras: [500n] });
    await bought(scene, { purchasedOn: "2031-05-04", unitPrice: "40000", cancelled: true });
    const principal = await insertUser("PRINCIPAL", { branches: [scene.branch.id], locale: "en" });
    const cookie = await signInAs(principal);
    const query = reportSearch({ report: "purchases", range: MAY, filters: NO_ANALYTICS_FILTERS });
    const workbook = await workbookOf(
      await GET(downloadRequest(`/reports/download?${query}`, cookie)),
    );
    const [records, cancelled] = workbook.worksheets;
    const { body, total } = bodyOf(records!, "Bought on");
    expect(body).toHaveLength(2);
    expect(body[1]!.slice(8, 13)).toEqual([1.5, 2_000, 3_000, 0, 3_000]);
    expect(body[1]![0]).toEqual(new Date("2031-05-03T00:00:00Z"));
    // The first sheet's total column (13th) adds up to its total line.
    expect(body.reduce((add, row) => add + (row[12] as number), 0)).toBe(7_500);
    expect(total[12]).toBe(7_500);
    const cancelledRows = rowsOf(cancelled!).filter((row) => row[0] instanceof Date);
    expect(cancelledRows).toHaveLength(1);
    expect(cancelledRows[0]![12]).toBe(40_000);
    expect(cancelledRows[0]!.at(-1)).toBe("Xato kiritildi");
  });

  it("Planned vs actual: three sheets, a difference below 0 as a number", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const order = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "10.000",
      unitPrice: "5200",
      plannedQty: "10",
      plannedPrice: 5_000n,
      progress: "DONE",
    });
    await buyingEvent(order.orderId, order.ownerId, "RECORD_PURCHASE", "2031-05-02T05:00:00Z");
    await refreshNow();
    const reader = await insertUser("MANAGER", { branches: [scene.branch.id], locale: "en" });
    const cookie = await signInAs(reader);
    const query = reportSearch({ report: "plan", range: MAY, filters: NO_ANALYTICS_FILTERS });
    const workbook = await workbookOf(
      await GET(downloadRequest(`/reports/download?${query}`, cookie)),
    );
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "By order",
      "By product",
      "By Manager",
    ]);
    const { body, total } = bodyOf(workbook.worksheets[0]!, "Order");
    expect(body).toEqual([
      [
        order.number,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        new Date("2031-05-02T00:00:00Z"),
        "Over",
        50_000,
        52_000,
        -2_000,
      ],
    ]);
    expect(total[8]).toBe(-2_000);
  });

  it("answers 401 signed out, 404 for another branch, a refused address and the Order register (03 rule 1; decided item 11)", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const other = await spendingScene();
    const cookie = await signInAs(scene.manager);
    const own = reportSearch({ report: "spending", range: MAY, filters: NO_ANALYTICS_FILTERS });
    expect((await GET(downloadRequest(`/reports/download?${own}`))).status).toBe(401);
    for (const report of ["purchases", "plan", "spending"] as const) {
      const query = reportSearch({
        report,
        range: MAY,
        filters: { ...NO_ANALYTICS_FILTERS, branch: other.branch.id },
      });
      expect((await GET(downloadRequest(`/reports/download?${query}`, cookie))).status).toBe(404);
    }
    for (const query of [
      "report=stock",
      "report=spending&from=2031-05-10&to=2031-05-01",
      "report=orders",
    ]) {
      expect((await GET(downloadRequest(`/reports/download?${query}`, cookie))).status).toBe(404);
    }
  });
});
