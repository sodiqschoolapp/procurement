import { describe, expect, it } from "vitest";

import { bindFormatters } from "@/i18n/format";

import { bought, refreshNow, spendingScene } from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { type AnalyticsPage, readAnalyticsPage } from "../page-data";
import { NO_ANALYTICS_FILTERS, analyticsSearch } from "../period-params";
import { analyticsReport } from "./page-report";

// The sections of the Analytics PDF (build-plan 6.7; plan of 6.7, decided items 4 to 6): every
// headline number is the page's query result in the formatters' text, never a number computed
// again (developer-rules.md rule 1; 05-order-request-form.md, Download 3); a table of a number of
// now keeps its "as of now" line; a Manager's file names no Manager. 15 October 2031 in Tashkent.

const AT = new Date("2031-10-15T05:00:00Z");
const format = bindFormatters("en", "so'm");

async function pageOf(
  user: { id: string; role: string },
  filters = NO_ANALYTICS_FILTERS,
): Promise<AnalyticsPage> {
  const raw = Object.fromEntries(
    new URLSearchParams(analyticsSearch({ choice: "this_month", from: null, to: null }, filters)),
  );
  const page = await readAnalyticsPage(user.id, user.role, raw, undefined);
  if (page === "refused" || page === "not_found") throw new Error(`Refused: ${page}`);
  return page;
}

const reportOf = (page: AnalyticsPage) =>
  analyticsReport(page, "en", { name: "Invented Reader", schoolName: null }, AT);

function figure(page: AnalyticsPage, section: string, label: string) {
  const found = reportOf(page)
    .sections.find((each) => each.title === section)
    ?.figures.find((each) => each.label === label);
  expect(found, `${section}: ${label}`).toBeDefined();
  return found!;
}

describe("analyticsReport (10 point 4; developer-rules rule 1)", () => {
  it("the Principal's Spending total is the query's total, as the tile writes it", async () => {
    setClock(AT.toISOString());
    const scene = await spendingScene();
    await bought(scene, { purchasedOn: "2031-10-02", unitPrice: "6000" });
    await refreshNow();
    const principal = await insertUser("PRINCIPAL", { branches: [scene.branch.id] });
    const page = await pageOf(principal);

    const total = figure(page, "Spending", "Spent in the period");
    expect(total.value).toBe(format.money(page.block!.total.amount));
    expect(total.value.replace(/\s/g, " ")).toBe("6 000 so'm");
  });

  it("a running month's file says it is against the same days of the period before (10 point 1; D55 item 10)", async () => {
    setClock(AT.toISOString());
    const scene = await spendingScene();
    const principal = await insertUser("PRINCIPAL", { branches: [scene.branch.id] });
    const page = await pageOf(principal);
    expect(page.compared).toMatchObject({ first: "2031-09-01", last: "2031-09-15" });
    expect(reportOf(page).captions).toContain(
      "Against the same days of the period before: 01.09.2031 – 15.09.2031",
    );
    // Last month is finished: no such line.
    const raw = Object.fromEntries(
      new URLSearchParams(
        analyticsSearch({ choice: "last_month", from: null, to: null }, NO_ANALYTICS_FILTERS),
      ),
    );
    const finished = await readAnalyticsPage(principal.id, principal.role, raw, undefined);
    expect(finished).toMatchObject({ compared: null });
  });

  it("Finance's numbers are the queries': Cash needed soon, Plan vs actual, Settlement speed", async () => {
    setClock(AT.toISOString());
    const scene = await spendingScene();
    await bought(scene, { purchasedOn: "2031-10-02", unitPrice: "6000", plannedPrice: 5000n });
    await refreshNow();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    const page = await pageOf(finance);
    const [, needed, spending, plan] = page.finance!;

    expect(figure(page, "Cash needed soon", "Needed soon in all").value).toBe(
      format.money(needed.all.amount),
    );
    expect(figure(page, "Plan vs actual", "Overspent").value).toBe(
      format.money(plan.total.overspent.amount),
    );
    expect(figure(page, "Plan vs actual", "Purchases without a receipt").value).toBe(
      format.money(spending.noReceipt.amount),
    );
    // The table of a number of now keeps its line, so it never reads as the period's (plan of
    // 6.7, decided item 4).
    const neededTable = reportOf(page).sections.find((each) => each.title === "Cash needed soon")!
      .tables[0]!;
    expect(neededTable.captions).toContain(neededTable.sheet.heading[1]);
    expect(neededTable.captions).not.toContain(reportOf(page).captions[0]);
  });

  it("a Manager's file names no Manager, whatever Manager the address names (plan of 6.5b, item 6)", async () => {
    setClock(AT.toISOString());
    const scene = await spendingScene();
    const manager = await insertUser("MANAGER", { branches: [scene.branch.id] });
    const page = await pageOf(manager, { ...NO_ANALYTICS_FILTERS, manager: scene.manager.id });
    const report = reportOf(page);

    expect(report.captions.join(" ")).not.toContain("Manager:");
    for (const section of report.sections) {
      for (const { captions } of section.tables) {
        expect(captions.join(" ")).not.toContain("Manager:");
      }
    }
    expect(figure(page, "My cash", "I hold").value).toBe(format.money(page.manager![2].held));
  });
});
