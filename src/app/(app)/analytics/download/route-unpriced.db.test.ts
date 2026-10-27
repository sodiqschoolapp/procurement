import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  type AnalyticsFilters,
  NO_ANALYTICS_FILTERS,
  NO_DEPARTMENT,
  analyticsSearch,
} from "@/features/analytics/period-params";

import {
  type SpendingScene,
  bought,
  buyingEvent,
  decided,
  refreshNow,
  spendingScene,
} from "../../../../../tests/helpers/analytics";
import { setClock } from "../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../tests/helpers/files";
import { type InsertedUser, insertUser, signInAs } from "../../../../../tests/helpers/users";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";
import { GET } from "./route";

// The Excel files of the Analytics page with an order without a department and orders without a
// planned price (build plan 2.5d-c, Done when: "and so do their Excel and PDF"; 10-notifications-
// analytics-reports.md, Analytics page per role, points 1 and 4; D68; 08 Numbers: "a sum that
// leaves orders out says how many"; review of the plan of 2.5d-c, correction 3: the filter line
// reads "No department", never the raw value). 15 October 2031 in Tashkent; English files.

const AT = "2031-10-15T05:00:00Z";
const THIS_MONTH = { choice: "this_month", from: null, to: null } as const;

async function sheetOf(response: Response) {
  expect(response.status).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const rows: unknown[][] = [];
  workbook.worksheets[0]!.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
  return rows;
}

/** 10 000 for the department, 3 000 without one; one priced and one unpriced ended order. */
async function scene() {
  setClock(AT);
  const scene = await spendingScene();
  await bought(scene, { purchasedOn: "2031-10-02", qty: "10.000", unitPrice: "1000" });
  const bare = await bought(scene, {
    purchasedOn: "2031-10-03",
    qty: "3.000",
    unitPrice: "1000",
    departmentId: null,
  });
  const priced = await bought(scene, {
    purchasedOn: "2031-10-04",
    qty: "10.000",
    unitPrice: "4000",
    progress: "DONE",
  });
  await buyingEvent(priced.orderId, priced.ownerId, "RECORD_PURCHASE", "2031-10-04T05:00:00Z");
  const unpriced = await bought(scene, {
    purchasedOn: "2031-10-05",
    qty: "10.000",
    unitPrice: "4500",
    progress: "DONE",
    plannedPrice: null,
  });
  await buyingEvent(unpriced.orderId, unpriced.ownerId, "RECORD_PURCHASE", "2031-10-05T05:00:00Z");
  const waiting = await decided(scene, "PENDING_PRINCIPAL", [], { plannedPrice: null });
  await refreshNow();
  return { scene, bare, unpriced, waiting };
}

async function download(
  user: InsertedUser,
  scene: SpendingScene,
  extra: Parameters<typeof analyticsSearch>[2],
  filters: Partial<AnalyticsFilters> = {},
) {
  const cookie = await signInAs(user);
  const scope = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id, ...filters };
  return sheetOf(
    await GET(
      downloadRequest(`/analytics/download?${analyticsSearch(THIS_MONTH, scope, extra)}`, cookie),
    ),
  );
}

describe("the Analytics Excel files: No department (D68) and the orders without a planned price", () => {
  it("Spending by department holds the No department line, and the lines add up to the total line", async () => {
    const { scene: s } = await scene();
    const head = await insertUser("HEAD", { locale: "en" });
    const rows = await download(head, s, { block: "departments" });
    const none = rows.find((row) => row[0] === "No department");
    expect(none?.[1]).toBe(3_000);
    const body = rows.filter((row) => typeof row[1] === "number" && row !== rows.at(-1));
    const total = rows.at(-1)![1] as number;
    expect(body.reduce((sum, row) => sum + (row[1] as number), 0)).toBe(total);
    expect(total).toBe(10_000 + 3_000 + 40_000 + 45_000);
  });

  it("the records of department=none: the filter line reads No department, never none", async () => {
    const { scene: s, bare } = await scene();
    const head = await insertUser("HEAD", { locale: "en" });
    const rows = await download(head, s, { block: "records" }, { department: NO_DEPARTMENT });
    expect(rows.some((row) => row[0] === "Department: No department")).toBe(true);
    expect(rows.flat().some((cell) => typeof cell === "string" && /\bnone\b/.test(cell))).toBe(
      false,
    );
    expect(rows.some((row) => row[0] === bare.number)).toBe(true);
  });

  it("Plan vs actual says how many ended orders without a planned price it leaves out, by branch and Manager too", async () => {
    const { scene: s } = await scene();
    const head = await insertUser("HEAD", { locale: "en" });
    const outcomes = await download(head, s, { block: "outcomes" });
    const line = outcomes.find(
      (row) => typeof row[0] === "string" && row[0].startsWith("1 order without a planned price"),
    );
    // With its change in a sentence (10 point 1): none ended in September.
    expect(line?.[0]).toBe(
      "1 order without a planned price is left out of these sums; +1 against the period before, which had none.",
    );
    const managers = await download(head, s, { block: "outcomeManagers" });
    const row = managers.find((each) => each[0] === s.manager.fullName)!;
    expect(row.at(-1)).toBe(1);
  });

  it("the orders behind the count: no planned total and no colour, the actual total", async () => {
    const { scene: s, unpriced } = await scene();
    const head = await insertUser("HEAD", { locale: "en" });
    const rows = await download(head, s, { block: "orders", key: { kind: "unpriced" } });
    const row = rows.find((each) => each[0] === unpriced.number)!;
    expect(row.slice(5)).toEqual(["No planned price", 45_000, "", "No planned price"]);
  });

  it("the Managers sheet: 2 orders, and 1 without a price beside the average", async () => {
    const { scene: s } = await scene();
    const head = await insertUser("HEAD", { locale: "en" });
    const rows = await download(head, s, { block: "managers" });
    const row = rows.find((each) => each[0] === s.manager.fullName)!;
    // The priced order: 10 × 4 000 against 10 × 5 000, 10 000 left.
    expect(row.slice(1, 5)).toEqual([2, 10_000, 1, "+1 against the period before, which had none"]);
  });

  it("Cash needed soon and its list: the unpriced order waiting for the Principal", async () => {
    const { scene: s, waiting } = await scene();
    const finance = await insertUser("FINANCE", { branches: [s.branch.id], locale: "en" });
    const rows = await download(finance, s, { block: "cashNeeded" });
    expect(
      rows.some((row) => row[0] === "1 order without a planned price is left out of these sums."),
    ).toBe(true);
    const list = await download(finance, s, {
      block: "neededOrders",
      key: { kind: "needed", stage: "approval", step: null, unpriced: true },
    });
    const row = list.find((each) => each[0] === waiting.number)!;
    expect(row[6]).toBe("No planned price");
  });

  it("My estimates says how many records of orders without a planned price it leaves out", async () => {
    const { scene: s } = await scene();
    await db.execute(sql`update users set locale = 'en' where id = ${s.manager.id}`);
    const cookie = await signInAs(s.manager);
    const rows = await sheetOf(
      await GET(
        downloadRequest(
          `/analytics/download?${analyticsSearch(THIS_MONTH, NO_ANALYTICS_FILTERS, { block: "myEstimates" })}`,
          cookie,
        ),
      ),
    );
    expect(rows.some((row) => typeof row[0] === "string" && row[0].startsWith("1 record"))).toBe(
      true,
    );
  });
});
