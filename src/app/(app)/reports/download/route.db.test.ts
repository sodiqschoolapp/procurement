import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { NO_ANALYTICS_FILTERS } from "@/features/analytics/period-params";
import { reportSearch } from "@/features/reports/report-params";
import { AuthorizationError } from "@/server/authorize";

import {
  bought,
  buyingEvent,
  decided,
  moneyOn,
  refreshNow,
  spendingScene,
  stockDocument,
  stocked,
} from "../../../../../tests/helpers/analytics";
import { insertCategory } from "../../../../../tests/helpers/catalog";
import { setClock } from "../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../tests/helpers/files";
import { describePermissionMatrix } from "../../../../../tests/helpers/permission-matrix";
import { headPrice } from "../../../../../tests/helpers/reports";
import { insertUser, signInAs } from "../../../../../tests/helpers/users";
import { GET } from "./route";

// The report files through their route (build-plan 6.8: "Excel export with real numbers and
// dates"; Done when: "export the spending report and sum a column in Excel"; 10-notifications-
// analytics-reports.md, Reports; 03-roles-and-permissions.md rule 1 and the matrix row "Export to
// Excel, download PDF, print"; plan of 6.8, decided items 2, 8 and 11; build-plan 6.9a and 6.9b;
// plan of 6.9b, decided item 12). 15 May 2031 in Tashkent.

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

  it("the three reports of 6.9b: their sheets, money and dates as numbers and dates, hours as on screen", async () => {
    setClock(AT);
    const scene = await spendingScene();
    // Price history: two records of one subtype; Money with managers: 40 000 held since 2 May.
    const record = await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "1500" });
    await moneyOn(record, scene.manager.id, { amount: 40_000n, occurredOn: "2031-05-02" });
    // Approval speed: 3 hours at the Principal step on 3 May.
    await decided(scene, "PENDING_FINANCE", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-05-03T03:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_HEAD",
        to: "PENDING_PRINCIPAL",
        at: "2031-05-03T04:00:00Z",
      },
      {
        type: "APPROVE",
        from: "PENDING_PRINCIPAL",
        to: "PENDING_FINANCE",
        at: "2031-05-03T07:00:00Z",
      },
    ]);
    await refreshNow();
    const head = await insertUser("HEAD", { locale: "en" });
    const cookie = await signInAs(head);
    const file = async (report: "prices" | "cash" | "speed") =>
      workbookOf(
        await GET(
          downloadRequest(
            `/reports/download?${reportSearch({
              report,
              range: MAY,
              filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id },
              variant: report === "prices" ? record.variantId : null,
            })}`,
            cookie,
          ),
        ),
      );

    const prices = await file("prices");
    expect(prices.worksheets.map((sheet) => sheet.name)).toEqual(["Purchases", "Reference prices"]);
    const priced = rowsOf(prices.getWorksheet("Purchases")!).filter(
      (row) => row[0] instanceof Date,
    );
    // The one record: 1 × 1 500, its order number beside it.
    expect(priced.map((row) => [row[0], row[2], row[4], row[6]])).toEqual([
      [new Date("2031-05-02T00:00:00Z"), record.number, 1, 1_500],
    ]);

    const cash = await file("cash");
    expect(cash.worksheets.map((sheet) => sheet.name)).toEqual([
      "By owner",
      "By age",
      "Orders behind the balances",
    ]);
    const owners = rowsOf(cash.getWorksheet("By owner")!);
    // A number of now: no dates line above the table (decided item 3).
    expect(owners.some((row) => String(row[0]).startsWith("Dates"))).toBe(false);
    // Held 40 000 − 1 500 spent = 38 500, since 2 May, 13 days.
    const owner = owners.find((row) => row[0] === scene.manager.fullName)!;
    expect(owner.slice(1)).toEqual([38_500, 0, new Date("2031-05-02T00:00:00Z"), 13, 1]);

    const speed = await file("speed");
    expect(speed.worksheets.map((sheet) => sheet.name)).toEqual([
      "Average hours at each step",
      "Stays decided in the dates",
    ]);
    const hours = rowsOf(speed.getWorksheet("Average hours at each step")!);
    expect(hours.at(-1)).toEqual(["All branches", "1.0", 1, "3.0", 1, "", 0]);
  });

  it("answers 401 signed out, 404 for another branch, a refused address and the Order register (03 rule 1; decided item 11)", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const other = await spendingScene();
    const cookie = await signInAs(scene.manager);
    const own = reportSearch({ report: "spending", range: MAY, filters: NO_ANALYTICS_FILTERS });
    expect((await GET(downloadRequest(`/reports/download?${own}`))).status).toBe(401);
    for (const report of [
      "purchases",
      "plan",
      "spending",
      "stock",
      "movements",
      "use",
      "prices",
      "cash",
      "speed",
    ] as const) {
      const query = reportSearch({
        report,
        range: MAY,
        filters: { ...NO_ANALYTICS_FILTERS, branch: other.branch.id },
      });
      expect((await GET(downloadRequest(`/reports/download?${query}`, cookie))).status).toBe(404);
    }
    for (const query of [
      // `stock` is a report since 6.9a and `prices` since 6.9b; a name that is none is refused.
      "report=unknown",
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

// The files of 6.9b under the route's own `data.export` check, every role, own and other branch:
// the branch filter's file holds the branch's record and stay. Money with managers is the Head's
// and Finance's only since D55 item 22, so its file is tested below (plan of 2.3b).
describePermissionMatrix("GET /reports/download, the reports of 6.9b with the branch filter", {
  permission: "data.export",
  async run({ user, branchId }) {
    setClock(AT);
    const scene = await spendingScene(branchId);
    const record = await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "2345" });
    await moneyOn(record, scene.manager.id, { amount: 50_000n, occurredOn: "2031-05-02" });
    const order = await decided(scene, "PENDING_PRINCIPAL", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-05-03T03:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_HEAD",
        to: "PENDING_PRINCIPAL",
        at: "2031-05-03T05:00:00Z",
      },
    ]);
    await refreshNow();
    const cookie = await signInAs(user);
    for (const report of ["prices", "speed"] as const) {
      const query = reportSearch({
        report,
        range: MAY,
        filters: { ...NO_ANALYTICS_FILTERS, branch: branchId },
        variant: record.variantId,
      });
      const response = await GET(downloadRequest(`/reports/download?${query}`, cookie));
      if (response.status === 404) throw new AuthorizationError("not_found");
      const cells = (await workbookOf(response)).worksheets
        .flatMap((sheet) => rowsOf(sheet))
        .flat();
      // The record's price; the order's Head stay.
      if (report === "prices") expect(cells).toContain(2_345);
      if (report === "speed") expect(cells).toContain(order.number);
    }
  },
});

// The Price history file of the Manager and the Principal leaves out the Head's note and who set
// it; the Head's and Finance's file holds both (03 matrix "… and the Head's price notes"; plan of
// 2.3b, decided item 4; permission review of 2.3b, Should fix 2).
describe("GET /reports/download, Price history: the Head's notes for the Head and Finance only (D55 item 22)", () => {
  it("the Note and Set by columns and their values are in the Head's and Finance's file only", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const record = await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "2345" });
    await refreshNow();
    const setter = await insertUser("HEAD");
    await headPrice(record.variantId, setter.id, {
      price: 2_400n,
      at: "2031-05-05T05:00:00Z",
      note: "Invented note of the Head",
    });
    const query = reportSearch({
      report: "prices",
      range: MAY,
      filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id },
      variant: record.variantId,
    });
    for (const role of ["HEAD", "FINANCE", "MANAGER", "PRINCIPAL"] as const) {
      const user = await insertUser(role, {
        branches: role === "HEAD" ? [] : [scene.branch.id],
        locale: "en",
      });
      const response = await GET(
        downloadRequest(`/reports/download?${query}`, await signInAs(user)),
      );
      expect(response.status, role).toBe(200);
      const cells = rowsOf((await workbookOf(response)).getWorksheet("Reference prices")!).flat();
      const sees = role === "HEAD" || role === "FINANCE";
      expect(cells.includes("Note"), role).toBe(sees);
      expect(cells.includes("Invented note of the Head"), role).toBe(sees);
      expect(cells.includes(setter.fullName), role).toBe(sees);
      // The price itself stays open to every role.
      expect(cells, role).toContain(2_400);
    }
  });
});

// The file of Money with managers under the report's own `money.managers` (03 matrix "See every
// Manager's cash (Money with managers)"; 10 Reports "Head and Finance only"; plan of 2.3b,
// decided items 4 and 5): the route answers every refusal 404, so the matrix's two kinds are
// told apart by role here. Each user is a user of the branch, the cash row beside it (D40).
describe("GET /reports/download, Money with managers: the Head and Finance only (D55 item 22)", () => {
  it("the Head and the branch's Finance get the cash held; the branch's Manager and Principal get 404", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const branch = scene.branch;
    const record = await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "2345" });
    await moneyOn(record, scene.manager.id, { amount: 50_000n, occurredOn: "2031-05-02" });
    await refreshNow();
    const query = reportSearch({
      report: "cash",
      range: MAY,
      filters: { ...NO_ANALYTICS_FILTERS, branch: branch.id },
    });
    for (const role of ["HEAD", "FINANCE", "MANAGER", "PRINCIPAL"] as const) {
      const user = await insertUser(role, { branches: role === "HEAD" ? [] : [branch.id] });
      const response = await GET(
        downloadRequest(`/reports/download?${query}`, await signInAs(user)),
      );
      if (role === "HEAD" || role === "FINANCE") {
        expect(response.status, role).toBe(200);
        // The cash held, 50 000 − 2 345.
        const cells = (await workbookOf(response)).worksheets
          .flatMap((sheet) => rowsOf(sheet))
          .flat();
        expect(cells, role).toContain(47_655);
      } else {
        expect(response.status, role).toBe(404);
      }
    }
  });
});
