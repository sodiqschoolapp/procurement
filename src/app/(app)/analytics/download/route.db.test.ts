import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  type ExportBlock,
  NO_ANALYTICS_FILTERS,
  analyticsSearch,
} from "@/features/analytics/period-params";
import { AuthorizationError } from "@/server/authorize";
import { getSpending } from "@/features/analytics/queries/spending";

import {
  bought,
  buyingEvent,
  refreshNow,
  spendingScene,
} from "../../../../../tests/helpers/analytics";
import { insertCategory } from "../../../../../tests/helpers/catalog";
import { setClock } from "../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../tests/helpers/files";
import { describePermissionMatrix } from "../../../../../tests/helpers/permission-matrix";
import { insertUser, signInAs } from "../../../../../tests/helpers/users";
import { getHeadSpending } from "@/features/analytics/queries/head-spending";
import { getPlanVsActual } from "@/features/analytics/queries/plan-vs-actual";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";
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

  it("the payment types and the Plan vs actual tables (build-plan 6.4a)", async () => {
    setClock(AT);
    const scene = await spendingScene();
    await bought(scene, {
      purchasedOn: "2031-10-02",
      unitPrice: "8000",
      paymentType: "CARD",
      extras: [{ amount: 1_000n, paymentType: "CASH" }],
    });
    const red = await bought(scene, {
      purchasedOn: "2031-10-03",
      qty: "10.000",
      unitPrice: "5200",
      progress: "DONE",
    });
    await buyingEvent(red.orderId, red.ownerId, "RECORD_PURCHASE", "2031-10-03T05:00:00Z");
    await refreshNow();
    const head = await insertUser("HEAD");
    const cookie = await signInAs(head);
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
    const get = async (extra: Parameters<typeof analyticsSearch>[2]) =>
      sheetOf(
        await GET(
          downloadRequest(
            `/analytics/download?${analyticsSearch(THIS_MONTH, filters, extra)}`,
            cookie,
          ),
        ),
      );

    const payments = await get({ block: "payments" });
    // Cash: the 1 000 extra and the 52 000 of the red order's cash trip; card: the 8 000 goods.
    expect(
      payments.filter((row) => typeof row[2] === "number").map((row) => row.slice(1, 2)),
    ).toEqual([[1_000 + 52_000], [8_000]]);
    expect(payments.at(-1)).toEqual([expect.any(String), 61_000]);

    const managers = await get({ block: "outcomeManagers" });
    expect(managers.find((row) => row[0] === scene.manager.fullName)?.slice(1)).toEqual([
      1, 0, 0, 1, 2_000, 0,
    ]);

    const orders = await get({ key: { kind: "overspent" }, block: "orders" });
    const line = orders.find((row) => row[0] === red.number)!;
    expect(line.slice(4, 8)).toEqual([new Date("2031-10-03T00:00:00Z"), 50_000, 52_000, -2_000]);
    expect(orders.at(-1)?.[7]).toBe(2_000);
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
      `block=months&department=${theirs.department.id}`,
      "block=months&owner=other",
      "block=records&key=colour:red",
      "block=orders&key=payment:CASH",
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

describePermissionMatrix("GET /analytics/download, the branch wall in the SQL", {
  permission: "data.export",
  async run({ user, branchId }) {
    setClock(AT);
    const record = await bought(await spendingScene(branchId), {
      purchasedOn: "2031-10-04",
      unitPrice: "6000",
    });
    await refreshNow();
    const cookie = await signInAs(user);
    for (const block of ["records", "months"] as const) {
      const query = analyticsSearch(THIS_MONTH, NO_ANALYTICS_FILTERS, { block });
      const rows = await sheetOf(
        await GET(downloadRequest(`/analytics/download?${query}`, cookie)),
      );
      if (block === "records" && !rows.some((row) => row[0] === record.number)) {
        throw new AuthorizationError("not_found");
      }
    }
  },
});

// The blocks of 6.4a (permission review of 6.4a, Must fix 1): each table the route writes for the
// user, with no branch filter, holds the branch's own row only behind the wall; the totals of the
// whole-of-period tables are the query's for that same user.
describePermissionMatrix("GET /analytics/download, the blocks of 6.4a behind the wall", {
  permission: "data.export",
  async run({ user, branchId }) {
    setClock(AT);
    const scene = await spendingScene(branchId);
    const order = await bought(scene, {
      purchasedOn: "2031-10-04",
      qty: "10.000",
      unitPrice: "5200",
      progress: "DONE",
    });
    await buyingEvent(order.orderId, order.ownerId, "RECORD_PURCHASE", "2031-10-04T05:00:00Z");
    await refreshNow();
    const names = (
      await db.execute<{
        branch: string;
        department: string;
        supplier: string;
        manager: string;
      }>(sql`
        select b.name as branch, d.name as department, c.name as supplier, u.full_name as manager
        from branches b, departments d, companies c, users u
        where b.id = ${branchId} and d.id = ${scene.department.id}
          and c.id = ${scene.supplier.id} and u.id = ${scene.manager.id}`)
    ).rows[0]!;
    const cookie = await signInAs(user);
    const get = async (block: ExportBlock) =>
      sheetOf(
        await GET(
          downloadRequest(
            `/analytics/download?${analyticsSearch(THIS_MONTH, NO_ANALYTICS_FILTERS, { block })}`,
            cookie,
          ),
        ),
      );
    const firsts = async (block: ExportBlock) => (await get(block)).map((row) => String(row[0]));

    const seen = [
      (await firsts("branches")).includes(names.branch),
      (await firsts("departments")).some((first) => first.startsWith(names.department)),
      (await firsts("suppliers")).includes(names.supplier),
      (await firsts("outcomeBranches")).includes(names.branch),
      (await firsts("outcomeManagers")).includes(names.manager),
      (await firsts("orders")).includes(order.number!),
    ];
    // The same wall for every table.
    expect(new Set(seen).size).toBe(1);

    const spending = await getHeadSpending(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect((await get("payments")).at(-1)).toEqual([
      expect.any(String),
      Number(spending.total.amount),
    ]);
    const plan = await getPlanVsActual(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    const red = (await get("outcomes")).find((row) => row[1] === plan.total.colours.red.count);
    expect(red).toBeDefined();
    if (!seen[0]) throw new AuthorizationError("not_found");
  },
});
