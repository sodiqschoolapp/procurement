import { describe, expect, it } from "vitest";

import {
  type AnalyticsFilters,
  NO_ANALYTICS_FILTERS,
  type PeriodInput,
  analyticsSearch,
} from "@/features/analytics/period-params";
import { AuthorizationError } from "@/server/authorize";

import { bought, refreshNow, spendingScene } from "../../../../../tests/helpers/analytics";
import { insertCategory } from "../../../../../tests/helpers/catalog";
import { setClock } from "../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../tests/helpers/files";
import { pdfPages } from "../../../../../tests/helpers/pdf-text";
import { describePermissionMatrix } from "../../../../../tests/helpers/permission-matrix";
import { insertUser, signInAs } from "../../../../../tests/helpers/users";
import { GET } from "./route";

// The whole Analytics page as a PDF through its route (build-plan 6.7, Done when: "A test reads
// the period and one total from the file"; 10-notifications-analytics-reports.md, Analytics page
// per role, point 4; 05-order-request-form.md, Download 2 and 3, read for this file by open
// question 16; 03-roles-and-permissions.md rule 1 and the matrix row "Export to Excel, download
// PDF, print"; plan of 6.7). The Russian file is its own test file (route-russian.db.test.ts): a
// PDF made after a Russian one in the same process loses letters (plan of 6.7, decided item 9).
// 15 October 2031 in Tashkent.

const AT = "2031-10-15T05:00:00Z";
const THIS_MONTH = { choice: "this_month", from: null, to: null } as const;
const PERIOD_LINE = "Period: 01.10.2031 – 31.10.2031";

async function textOf(
  user: Parameters<typeof signInAs>[0],
  filters: AnalyticsFilters = NO_ANALYTICS_FILTERS,
  period: PeriodInput = THIS_MONTH,
) {
  const query = analyticsSearch(period, filters);
  const response = await GET(downloadRequest(`/analytics/report?${query}`, await signInAs(user)));
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("application/pdf");
  return pdfPages(new Uint8Array(await response.arrayBuffer()));
}

/** Each title is found after the one before it: the blocks in the page's order. */
function expectInOrder(text: string, titles: readonly string[]) {
  let from = 0;
  for (const title of titles) {
    const at = text.indexOf(title, from);
    expect(at, title).toBeGreaterThanOrEqual(0);
    from = at + title.length;
  }
}

describe("GET /analytics/report (10 point 4; 05 Download 2 and 3)", () => {
  it("a Principal's file: the period and the Spending total of the own branch only (Done when)", async () => {
    setClock(AT);
    const scene = await spendingScene();
    await bought(scene, {
      purchasedOn: "2031-10-02",
      qty: "2.500",
      unitPrice: "3333",
      extras: [1_000n],
    });
    await bought(scene, { purchasedOn: "2031-10-03", unitPrice: "5000" });
    // Another branch's purchase in the same month: a broken wall would add its 7 000 (D40).
    await bought(await spendingScene(), { purchasedOn: "2031-10-04", unitPrice: "7000" });
    await refreshNow();
    const principal = await insertUser("PRINCIPAL", { branches: [scene.branch.id], locale: "en" });

    const text = (await textOf(principal)).join(" ");
    expect(text).toContain(PERIOD_LINE);
    // 2.5 × 3 333 = 8 332.5 → 8 333, + 1 000 extra, + 5 000 (08 Money, half up).
    expect(text).toContain("Spent in the period 14 333 so'm");
    expect(text).not.toContain("21 333 so'm");
  });

  it("Finance's file: the Payments total of Finance's own branch only", async () => {
    setClock(AT);
    const scene = await spendingScene();
    await bought(scene, { purchasedOn: "2031-10-02", unitPrice: "6000" });
    await bought(await spendingScene(), { purchasedOn: "2031-10-04", unitPrice: "7000" });
    await refreshNow();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id], locale: "en" });

    const text = (await textOf(finance)).join(" ");
    expect(text).toContain(PERIOD_LINE);
    expect(text).toContain("6 000 so'm");
    expect(text).not.toContain("13 000 so'm");
  });

  it("each role's file holds its own blocks in the page's order and no block of another role", async () => {
    setClock(AT);
    const scene = await spendingScene();
    await bought(scene, { purchasedOn: "2031-10-02", unitPrice: "6000" });
    await refreshNow();
    const branches = [scene.branch.id];
    const head = (await textOf(await insertUser("HEAD", { locale: "en" }))).join(" ");
    expectInOrder(head, [
      "Spending",
      "Plan vs actual",
      "Prices",
      "Approval speed",
      "Managers",
      "Warehouse",
    ]);
    expect(head).not.toContain("My approvals");
    expect(head).not.toContain("Cash needed soon");

    const principal = (
      await textOf(await insertUser("PRINCIPAL", { branches, locale: "en" }))
    ).join(" ");
    expectInOrder(principal, ["Spending", "Orders", "My approvals", "Warehouse"]);
    expect(principal).not.toContain("Approval speed");
    expect(principal).not.toContain("Stock planning");

    const manager = (await textOf(await insertUser("MANAGER", { branches, locale: "en" }))).join(
      " ",
    );
    expectInOrder(manager, ["My orders", "My estimates", "My cash", "Stock planning"]);
    expect(manager).not.toContain("Settlement speed");
    expect(manager).not.toContain("Approval speed");

    const finance = (await textOf(await insertUser("FINANCE", { branches, locale: "en" }))).join(
      " ",
    );
    expectInOrder(finance, [
      "Cash",
      "Cash needed soon",
      "Payments",
      "Plan vs actual",
      "Settlement speed",
    ]);
    expect(finance).not.toContain("Stock planning");
    expect(finance).not.toContain("My approvals");
  });

  it("every page carries the period, the filters, who downloaded it and when; no signature line", async () => {
    setClock(AT);
    const scene = await spendingScene();
    await bought(scene, { purchasedOn: "2031-10-02", unitPrice: "6000" });
    await refreshNow();
    const head = await insertUser("HEAD", { fullName: "Invented Report Reader", locale: "en" });
    const filters = { ...NO_ANALYTICS_FILTERS, category: scene.category.id };

    const pages = await textOf(head, filters);
    // The Head's six blocks run over more than one page.
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page).toContain(PERIOD_LINE);
      expect(page).toContain(`Category: ${scene.category.name}`);
      expect(page).toContain("Downloaded by Invented Report Reader, 15.10.2031 10:00");
    }
    expect(pages.at(-1)).toContain(`Page ${pages.length} of ${pages.length}`);
    // 05 Download: "no signature lines anywhere".
    expect(pages.join(" ")).not.toMatch(/signature|signed by/i);
  });

  it("the file follows the page's filters: a category filter leaves the other category out", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const other = await insertCategory();
    await bought(scene, { purchasedOn: "2031-10-02", unitPrice: "6000" });
    await bought(scene, { purchasedOn: "2031-10-03", unitPrice: "4000", categoryId: other.id });
    await refreshNow();
    const principal = await insertUser("PRINCIPAL", { branches: [scene.branch.id], locale: "en" });

    const all = (await textOf(principal)).join(" ");
    expect(all).toContain("Spent in the period 10 000 so'm");
    const one = (
      await textOf(principal, { ...NO_ANALYTICS_FILTERS, category: scene.category.id })
    ).join(" ");
    expect(one).toContain("Spent in the period 6 000 so'm");
    expect(one).not.toContain(other.name);
  });

  it("signed out: 401; an address the parser refuses: 404", async () => {
    setClock(AT);
    expect((await GET(downloadRequest("/analytics/report"))).status).toBe(401);
    const head = await insertUser("HEAD", { locale: "en" });
    const cookie = await signInAs(head);
    const refused = await GET(downloadRequest("/analytics/report?period=bogus", cookie));
    expect(refused.status).toBe(404);
    // The school year is not set: its period is refused, as on the page (plan of 6.3).
    const year = await GET(downloadRequest("/analytics/report?period=school_year", cookie));
    expect(year.status).toBe(404);
  });
});

// Another branch's `branch=` is Not found; the own branch's file holds its spending (03 rule 1;
// developer-rules rule 4).
describePermissionMatrix("GET /analytics/report", {
  permission: "data.export",
  async run({ user, branchId }) {
    setClock(AT);
    await bought(await spendingScene(branchId), { purchasedOn: "2031-10-04", unitPrice: "6000" });
    await refreshNow();
    const query = analyticsSearch(THIS_MONTH, { ...NO_ANALYTICS_FILTERS, branch: branchId });
    const response = await GET(downloadRequest(`/analytics/report?${query}`, await signInAs(user)));
    if (response.status === 404) throw new AuthorizationError("not_found");
    expect(response.status).toBe(200);
    const text = (await pdfPages(new Uint8Array(await response.arrayBuffer()))).join(" ");
    expect(text).toContain("01.10.2031 – 31.10.2031");
  },
});
