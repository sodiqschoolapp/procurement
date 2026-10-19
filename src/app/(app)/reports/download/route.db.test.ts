import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { NO_ANALYTICS_FILTERS } from "@/features/analytics/period-params";
import { reportSearch } from "@/features/reports/report-params";
import { AuthorizationError } from "@/server/authorize";

import {
  bought,
  buyingEvent,
  refreshNow,
  spendingScene,
  stockDocument,
  stocked,
} from "../../../../../tests/helpers/analytics";
import { insertCategory } from "../../../../../tests/helpers/catalog";
import { setClock } from "../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../tests/helpers/files";
import { describePermissionMatrix } from "../../../../../tests/helpers/permission-matrix";
import { insertUser, signInAs } from "../../../../../tests/helpers/users";
import { GET } from "./route";

// The report files through their route (build-plan 6.8: "Excel export with real numbers and
// dates"; Done when: "export the spending report and sum a column in Excel"; 10-notifications-
// analytics-reports.md, Reports; 03-roles-and-permissions.md rule 1 and the matrix row "Export to
// Excel, download PDF, print"; plan of 6.8, decided items 2, 8 and 11; build-plan 6.9a). 15 May
// 2031 in Tashkent.

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

  it("the three stock reports: their sheets, quantities signed as number cells, money as numbers (6.9a)", async () => {
    setClock(AT);
    const scene = await spendingScene();
    // 2.5 received at 3 333 today, 0.5 of it issued on 3 May: 2 left worth 6 666.
    const variantId = await stocked(scene, { qty: "2.5", unitCost: 3_333n });
    await stockDocument(scene, {
      type: "ISSUE",
      docDate: "2031-05-03",
      lines: [{ variantId, qty: "0.5" }],
    });
    await refreshNow();
    const head = await insertUser("HEAD", { locale: "en" });
    const cookie = await signInAs(head);
    const file = async (report: "stock" | "movements" | "use") =>
      workbookOf(
        await GET(
          downloadRequest(
            `/reports/download?${reportSearch({
              report,
              range: MAY,
              filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id },
            })}`,
            cookie,
          ),
        ),
      );

    const stock = await file("stock");
    expect(stock.worksheets.map((sheet) => sheet.name)).toEqual(["By branch", "Stock lines"]);
    const lines = bodyOf(stock.getWorksheet("Stock lines")!, "Branch");
    expect(lines.body.map((row) => row.slice(3))).toEqual([[2, expect.any(String), 3_333, 6_666]]);
    expect(lines.total.at(-1)).toBe(6_666);

    const movements = await file("movements");
    expect(movements.worksheets.map((sheet) => sheet.name)).toEqual(["Movements"]);
    const moved = rowsOf(movements.worksheets[0]!).filter((row) => row[0] instanceof Date);
    // Newest first: received on 15 May, issued on 3 May (0.5 × 3 333 = 1 666.5 → 1 667 out).
    expect(moved.map((row) => [row[0], row[2], row[6], row[9]])).toEqual([
      [new Date("2031-05-15T00:00:00Z"), "Receipt", 2.5, 8_333],
      [new Date("2031-05-03T00:00:00Z"), "Issue to a department", -0.5, -1_667],
    ]);

    const use = await file("use");
    expect(use.worksheets.map((sheet) => sheet.name)).toEqual(["By department", "By item"]);
    const byItem = bodyOf(use.getWorksheet("By item")!, "Department");
    expect(byItem.body.map((row) => row.slice(4))).toEqual([
      [0.5, 0, 0.5, expect.any(String), 1_667],
    ]);
    expect(byItem.total.at(-1)).toBe(1_667);
  });

  it("answers 401 signed out, 404 for another branch, a refused address and the Order register (03 rule 1; decided item 11)", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const other = await spendingScene();
    const cookie = await signInAs(scene.manager);
    const own = reportSearch({ report: "spending", range: MAY, filters: NO_ANALYTICS_FILTERS });
    expect((await GET(downloadRequest(`/reports/download?${own}`))).status).toBe(401);
    for (const report of ["purchases", "plan", "spending", "stock", "movements", "use"] as const) {
      const query = reportSearch({
        report,
        range: MAY,
        filters: { ...NO_ANALYTICS_FILTERS, branch: other.branch.id },
      });
      expect((await GET(downloadRequest(`/reports/download?${query}`, cookie))).status).toBe(404);
    }
    for (const query of [
      // `stock` is a report since 6.9a; a name that is none is refused.
      "report=prices",
      "report=spending&from=2031-05-10&to=2031-05-01",
      "report=orders",
    ]) {
      expect((await GET(downloadRequest(`/reports/download?${query}`, cookie))).status).toBe(404);
    }
  });
});

/** A record of 6 000 so'm bought in May in the branch, its order Done, the summary refreshed. */
async function doneIn(branchId: string) {
  setClock(AT);
  const scene = await spendingScene(branchId);
  const record = await bought(scene, {
    purchasedOn: "2031-05-04",
    unitPrice: "6000",
    plannedQty: "1",
    plannedPrice: 6_000n,
    progress: "DONE",
  });
  await buyingEvent(record.orderId, record.ownerId, "RECORD_PURCHASE", "2031-05-04T05:00:00Z");
  await refreshNow();
  return record;
}

// The route's own `data.export` check, every role, own and other branch (03 matrix "Export to
// Excel, download PDF, print"; 15 Test layers; permission review of 6.8, Must fix 1).
describePermissionMatrix("GET /reports/download with the branch filter", {
  permission: "data.export",
  async run({ user, branchId }) {
    await doneIn(branchId);
    const cookie = await signInAs(user);
    for (const report of ["purchases", "plan", "spending"] as const) {
      const query = reportSearch({
        report,
        range: MAY,
        filters: { ...NO_ANALYTICS_FILTERS, branch: branchId },
      });
      const response = await GET(downloadRequest(`/reports/download?${query}`, cookie));
      if (response.status === 404) throw new AuthorizationError("not_found");
      const workbook = await workbookOf(response);
      const total = rowsOf(workbook.worksheets[0]!).at(-1)!;
      expect(total.filter((cell) => typeof cell === "number").at(-1)).toBe(
        report === "plan" ? 0 : 6_000,
      );
    }
  },
});

// Without a branch: the file holds the branch's record only where the user sees the branch
// (permission review of 6.8, Should fix 1: another branch's record present in the Head's run).
describePermissionMatrix("GET /reports/download, the branch wall in the SQL", {
  permission: "data.export",
  async run({ user, branchId }) {
    const record = await doneIn(branchId);
    const cookie = await signInAs(user);
    const query = reportSearch({ report: "purchases", range: MAY, filters: NO_ANALYTICS_FILTERS });
    const workbook = await workbookOf(
      await GET(downloadRequest(`/reports/download?${query}`, cookie)),
    );
    const rows = workbook.worksheets.flatMap((sheet) => rowsOf(sheet));
    if (!rows.some((row) => row[1] === record.number)) throw new AuthorizationError("not_found");
  },
});

// The stock files of 6.9a under the route's own `data.export` check, every role, own and other
// branch: the branch filter's file holds the branch's issue.
describePermissionMatrix("GET /reports/download, the stock reports with the branch filter", {
  permission: "data.export",
  async run({ user, branchId }) {
    setClock(AT);
    const scene = await spendingScene(branchId);
    const variantId = await stocked(scene, { qty: "3", unitCost: 2_000n });
    await stockDocument(scene, {
      type: "ISSUE",
      docDate: "2031-05-03",
      lines: [{ variantId, qty: "1" }],
    });
    await refreshNow();
    const cookie = await signInAs(user);
    for (const report of ["stock", "movements", "use"] as const) {
      const query = reportSearch({
        report,
        range: MAY,
        filters: { ...NO_ANALYTICS_FILTERS, branch: branchId },
      });
      const response = await GET(downloadRequest(`/reports/download?${query}`, cookie));
      if (response.status === 404) throw new AuthorizationError("not_found");
      const rows = (await workbookOf(response)).worksheets.flatMap((sheet) => rowsOf(sheet));
      // Stock 2 × 2 000 left; the issue 1 × 2 000 out; used 2 000.
      const amounts = rows.flat().filter((cell) => typeof cell === "number");
      expect(amounts).toContain(
        report === "stock" ? 4_000 : report === "movements" ? -2_000 : 2_000,
      );
    }
  },
});
