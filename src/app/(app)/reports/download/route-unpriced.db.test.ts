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
import { setClock } from "../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../tests/helpers/files";
import { insertUser, signInAs } from "../../../../../tests/helpers/users";
import { GET } from "./route";

// The report files with an order without a department and an order without a planned price
// (build plan 2.5d-c, Done when: "the Spending report by department … shows No department and
// adds up to the total"; "and so do their Excel"; D68; 08 Numbers: "a sum that leaves orders out
// says how many"). 15 May 2031 in Tashkent; English files.

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

async function scene() {
  setClock(AT);
  const scene = await spendingScene();
  await bought(scene, { purchasedOn: "2031-05-02", qty: "10.000", unitPrice: "1000" });
  await bought(scene, {
    purchasedOn: "2031-05-03",
    qty: "3.000",
    unitPrice: "1000",
    departmentId: null,
  });
  const priced = await bought(scene, {
    purchasedOn: "2031-05-04",
    qty: "10.000",
    unitPrice: "4000",
    progress: "DONE",
  });
  await buyingEvent(priced.orderId, priced.ownerId, "RECORD_PURCHASE", "2031-05-04T05:00:00Z");
  const unpriced = await bought(scene, {
    purchasedOn: "2031-05-05",
    qty: "10.000",
    unitPrice: "4500",
    progress: "DONE",
    plannedPrice: null,
  });
  await buyingEvent(unpriced.orderId, unpriced.ownerId, "RECORD_PURCHASE", "2031-05-05T05:00:00Z");
  await refreshNow();
  const head = await insertUser("HEAD", { locale: "en" });
  const cookie = await signInAs(head);
  const file = async (report: "spending" | "plan") =>
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
  return { scene, file };
}

describe("the report files: No department (D68) and the orders without a planned price", () => {
  it("Spending by department ends with No department, and its lines add up to the total line", async () => {
    const { file } = await scene();
    const rows = rowsOf((await file("spending")).getWorksheet("By department")!);
    const header = rows.findIndex((row) => row[0] === "Department");
    const body = rows.slice(header + 1, -1);
    expect(body.at(-1)).toEqual(["No department", 1, 3_000]);
    const sum = body.reduce((add, row) => add + (row[2] as number), 0);
    expect(rows.at(-1)).toEqual(["Total", undefined, sum]);
    expect(sum).toBe(10_000 + 3_000 + 40_000 + 45_000);
  });

  it("Planned vs actual says 1 without a price under its heading and in its column", async () => {
    const { file } = await scene();
    const workbook = await file("plan");
    for (const sheet of workbook.worksheets) {
      const rows = rowsOf(sheet);
      expect(
        rows.some(
          (row) => row[0] === "1 ended order without a planned price is left out of these sums.",
        ),
        sheet.name,
      ).toBe(true);
    }
    const managers = rowsOf(workbook.getWorksheet("By Manager")!);
    const header = managers.findIndex((row) => row[0] === "Name");
    expect(managers[header]!.at(-1)).toBe("Without a price");
    expect(managers[header + 1]!.slice(1)).toEqual([1, 50_000, 40_000, 10_000, 1]);
  });
});
