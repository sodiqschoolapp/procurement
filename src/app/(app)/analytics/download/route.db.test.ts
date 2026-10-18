import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { NO_ANALYTICS_FILTERS, analyticsSearch } from "@/features/analytics/period-params";
import { AuthorizationError } from "@/server/authorize";
import { getSpending } from "@/features/analytics/queries/spending";

import { bought, refreshNow, spendingScene } from "../../../../../tests/helpers/analytics";
import { insertCategory } from "../../../../../tests/helpers/catalog";
import { setClock } from "../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../tests/helpers/files";
import { describePermissionMatrix } from "../../../../../tests/helpers/permission-matrix";
import { insertUser, signInAs } from "../../../../../tests/helpers/users";
import { GET } from "./route";

// The Analytics download through its route (build-plan 6.3: "Excel export of a chart or a table";
// 10-notifications-analytics-reports.md, Analytics page per role, point 4; 03-roles-and-
// permissions.md rule 1 and the matrix row "Export to Excel, download PDF, print"; plan of 6.3 and
// the review's correction 2). 15 October 2031 in Tashkent.

const AT = "2031-10-15T05:00:00Z";
const THIS_MONTH = { choice: "this_month", from: null, to: null } as const;

async function sheetOf(response: Response) {
  expect(response.status).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const sheet = workbook.worksheets[0]!;
  const rows: unknown[][] = [];
  sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
  return rows;
}

describe("GET /analytics/download (10 point 4)", () => {
  it("the table by category: its rows and total are the query's, money a number cell", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const other = await insertCategory();
    await bought(scene, {
      purchasedOn: "2031-10-02",
      qty: "2.500",
      unitPrice: "3333",
      extras: [1_000n],
    });
    await bought(scene, { purchasedOn: "2031-10-03", unitPrice: "5000", categoryId: other.id });
    await bought(scene, { purchasedOn: "2031-09-03", unitPrice: "4000", categoryId: other.id });
    await refreshNow();
    const principal = await insertUser("PRINCIPAL", { branches: [scene.branch.id] });
    const cookie = await signInAs(principal);
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
    const query = analyticsSearch(THIS_MONTH, filters, { block: "categories" });

    const rows = await sheetOf(await GET(downloadRequest(`/analytics/download?${query}`, cookie)));
    const block = await getSpending(principal.id, THIS_MONTH, filters);
    expect(block.total.amount).toBe(14_333n);
    const body = rows.filter((row) => typeof row[2] === "number");
    expect(body.map((row) => row.slice(0, 3))).toEqual([
      [scene.category.name, 9_333, 9_333],
      [other.name, 5_000, 1_000],
    ]);
    expect(rows.at(-1)).toEqual([expect.any(String), 14_333]);
  });

  it("the drill-down list: every record with its date as a date cell", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const record = await bought(scene, { purchasedOn: "2031-10-04", unitPrice: "7000" });
    await refreshNow();
    const head = await insertUser("HEAD");
    const cookie = await signInAs(head);
    const query = analyticsSearch(
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id },
      { key: { kind: "month", month: "2031-10" }, block: "records" },
    );
    const rows = await sheetOf(await GET(downloadRequest(`/analytics/download?${query}`, cookie)));
    const line = rows.find((row) => row[0] === record.number)!;
    expect(line[3]).toEqual(new Date("2031-10-04T00:00:00Z"));
    expect(line[5]).toBe(7_000);
  });

  it("401 signed out; 404 for no block, a refused address, a school year not set, another branch", async () => {
    setClock(AT);
    const mine = await spendingScene();
    const theirs = await spendingScene();
    expect((await GET(downloadRequest("/analytics/download?block=months"))).status).toBe(401);
    const principal = await insertUser("PRINCIPAL", { branches: [mine.branch.id] });
    const cookie = await signInAs(principal);
    for (const query of [
      "period=this_month",
      "period=never&block=months",
      "period=custom&from=2031-10-05&to=2031-10-01&block=months",
      "period=school_year&block=months",
      "block=records&key=month:2031-01",
      "block=months&category=not-an-id",
      `block=months&branch=${theirs.branch.id}`,
    ]) {
      const response = await GET(downloadRequest(`/analytics/download?${query}`, cookie));
      expect(response.status, query).toBe(404);
    }
  });
});

describePermissionMatrix("GET /analytics/download", {
  permission: "data.export",
  async run({ user, branchId }) {
    setClock(AT);
    await bought(await spendingScene(branchId), { purchasedOn: "2031-10-04", unitPrice: "6000" });
    await refreshNow();
    const query = analyticsSearch(
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, branch: branchId },
      {
        block: "months",
      },
    );
    const response = await GET(
      downloadRequest(`/analytics/download?${query}`, await signInAs(user)),
    );
    if (response.status === 404) {
      throw new AuthorizationError("not_found");
    }
    const rows = await sheetOf(response);
    expect(rows.at(-1)).toEqual([expect.any(String), 6_000]);
  },
});
