import { describe, expect, it } from "vitest";

import {
  bought,
  buyingEvent,
  decided,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { type AnalyticsPage, readAnalyticsPage } from "../page-data";
import { NO_ANALYTICS_FILTERS, analyticsSearch } from "../period-params";
import { analyticsReport } from "./page-report";

// The Analytics PDF with an order without a department and orders without a planned price
// (build plan 2.5d-c, Done when: "and so do their Excel and PDF"; 10-notifications-analytics-
// reports.md, Analytics page per role, points 1 and 4; D68; 08 Numbers: "a sum that leaves orders
// out says how many"). The PDF prints these sections; 15 October 2031 in Tashkent.

const AT = new Date("2031-10-15T05:00:00Z");

async function pageOf(user: { id: string; role: string }, branch: string): Promise<AnalyticsPage> {
  const raw = Object.fromEntries(
    new URLSearchParams(
      analyticsSearch(
        { choice: "this_month", from: null, to: null },
        { ...NO_ANALYTICS_FILTERS, branch },
      ),
    ),
  );
  const page = await readAnalyticsPage(user.id, user.role, raw, undefined);
  if (page === "refused" || page === "not_found") throw new Error(`Refused: ${page}`);
  return page;
}

const sectionOf = (page: AnalyticsPage, title: string) => {
  const found = analyticsReport(
    page,
    "en",
    { name: "Invented Reader", schoolName: null },
    AT,
  ).sections.find((each) => each.title === title);
  expect(found, title).toBeDefined();
  return found!;
};

async function scene() {
  setClock(AT.toISOString());
  const scene = await spendingScene();
  await bought(scene, { purchasedOn: "2031-10-03", unitPrice: "3000", departmentId: null });
  const unpriced = await bought(scene, {
    purchasedOn: "2031-10-04",
    qty: "10.000",
    unitPrice: "4500",
    progress: "DONE",
    plannedPrice: null,
  });
  await buyingEvent(unpriced.orderId, unpriced.ownerId, "RECORD_PURCHASE", "2031-10-04T05:00:00Z");
  await decided(scene, "PENDING_PRINCIPAL", [], { plannedPrice: null });
  await refreshNow();
  return scene;
}

describe("the Analytics PDF: No department and the orders without a planned price", () => {
  it("the Head's Spending by department table holds No department; Plan vs actual counts the unpriced ended order with its change", async () => {
    const s = await scene();
    const head = await insertUser("HEAD");
    const page = await pageOf(head, s.branch.id);
    const departments = sectionOf(page, "Spending").tables.find(
      (table) => table.sheet.name === "Spending by department",
    )!;
    expect(departments.sheet.rows.map((row) => row[0])).toContainEqual({
      kind: "text",
      value: "No department",
    });
    const plan = sectionOf(page, "Plan vs actual");
    expect(plan.figures.find((each) => each.label === "Ended without a planned price")).toEqual({
      label: "Ended without a planned price",
      value: "1",
      lines: ["+1 against the period before, which had none"],
    });
    expect(plan.tables[0]!.captions).toContain(
      "1 order without a planned price is left out of these sums; +1 against the period before, which had none.",
    );
  });

  it("Finance's Cash needed soon says 1 without a price beside the in-approval number", async () => {
    const s = await scene();
    const finance = await insertUser("FINANCE", { branches: [s.branch.id] });
    const page = await pageOf(finance, s.branch.id);
    const needed = sectionOf(page, "Cash needed soon");
    expect(needed.figures.find((each) => each.label === "Still in approval")?.lines).toContain(
      "1 without a price",
    );
    const plan = sectionOf(page, "Plan vs actual");
    expect(plan.figures.map((each) => each.label)).toContain("Ended without a planned price");
  });
});
