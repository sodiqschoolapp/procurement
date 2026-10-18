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
  decided,
  moneyOn,
  recordOn,
  refreshNow,
  spendingScene,
  stockDocument,
  stocked,
} from "../../../../../tests/helpers/analytics";
import { insertCategory, insertCompany } from "../../../../../tests/helpers/catalog";
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

// The blocks of 6.4b (plan of 6.4b, Server actions and queries; Tests: "every new block in the
// route matrix"): each table the route writes for the user, with no branch filter, holds the
// branch's own rows only behind the wall, the same wall for every table.
describePermissionMatrix("GET /analytics/download, the blocks of 6.4b behind the wall", {
  permission: "data.export",
  async run({ user, branchId }) {
    setClock(AT);
    const scene = await spendingScene(branchId);
    const other = await insertCompany();
    // A subtype bought at 5 000 in September, then 6 000 from another supplier and 6 500 in
    // October: a trend point of 6 250, a rise and a spread.
    const item = await bought(scene, { purchasedOn: "2031-09-20", unitPrice: "5000" });
    await recordOn(
      scene,
      { id: item.orderId, ownerId: item.ownerId, variantId: item.variantId },
      { purchasedOn: "2031-10-04", unitPrice: "6000", supplierId: other.id },
    );
    await recordOn(
      scene,
      { id: item.orderId, ownerId: item.ownerId, variantId: item.variantId },
      { purchasedOn: "2031-10-05", unitPrice: "6500" },
    );
    // A send back after an hour, and an order waiting at Principal.
    const back = await decided(scene, "RETURNED", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-02T04:00:00Z" },
      {
        type: "SEND_BACK",
        from: "PENDING_HEAD",
        to: "RETURNED",
        at: "2031-10-02T05:00:00Z",
        reason: `Narxni tekshiring ${branchId}`,
      },
    ]);
    const waitingOrder = await decided(scene, "PENDING_PRINCIPAL", [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-14T04:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_HEAD",
        to: "PENDING_PRINCIPAL",
        at: "2031-10-14T05:00:00Z",
      },
    ]);
    await refreshNow();
    const names = (
      await db.execute<{ branch: string; product: string }>(sql`
        select b.name as branch, pr.name as product
        from branches b, product_variants v join products pr on pr.id = v.product_id
        where b.id = ${branchId} and v.id = ${item.variantId}`)
    ).rows[0]!;
    const cookie = await signInAs(user);
    // The scene's own category, so the counts hold this case's rows only; no branch filter, so
    // the wall in the SQL decides what the user sees.
    const own = { ...NO_ANALYTICS_FILTERS, category: scene.category.id };
    const get = async (block: ExportBlock, extra: Parameters<typeof analyticsSearch>[2] = {}) =>
      sheetOf(
        await GET(
          downloadRequest(
            `/analytics/download?${analyticsSearch(THIS_MONTH, own, {
              ...extra,
              block,
            })}`,
            cookie,
          ),
        ),
      );
    const texts = async (block: ExportBlock, extra: Parameters<typeof analyticsSearch>[2] = {}) =>
      (await get(block, extra)).flat().map((cell) => String(cell));

    const trend = await get("priceTrend", { variant: item.variantId });
    const seen = [
      trend.some((row) => row[1] === 6_250),
      (await texts("priceRises")).includes(names.product),
      (await texts("priceSpread")).includes(names.product),
      (await texts("stepHours")).includes(names.branch),
      (await texts("reasons")).includes(`Narxni tekshiring ${branchId}`),
      (await texts("approvals", { key: { kind: "step", step: null, decision: null } })).includes(
        back.number!,
      ),
      (
        await texts("approvals", {
          key: { kind: "step", step: null, decision: "SEND_BACK" },
          reason: `narxni tekshiring ${branchId}`,
        })
      ).includes(back.number!),
      (await texts("approvals", { key: { kind: "waiting", step: null, group: null } })).includes(
        waitingOrder.number!,
      ),
      (
        await texts("records", {
          key: { kind: "price", variant: item.variantId, month: null, noSupplier: false },
        })
      ).includes(item.number!),
    ];
    // The same wall for every table.
    expect(seen).toEqual(seen.map(() => seen[0]));
    // "Waiting now" and the decisions count the branch's own rows only behind it too: the rows
    // are Head, Principal, Finance, all; one order waits at Principal, one of the two Head
    // decisions sent back.
    const counted = (rows: unknown[][]) => rows.filter((row) => typeof row[1] === "number");
    const waiting = counted(await get("waiting"));
    const decisions = counted(await get("decisions"));
    const one = seen[0] ? 1 : 0;
    expect(waiting[1]!.at(-1)).toBe(one);
    expect(waiting[3]!.at(-1)).toBe(one);
    // The Head step decided twice: the send back and the approval of the waiting order.
    expect([decisions[0]![1], decisions[0]![2]]).toEqual([2 * one, one]);
    if (!seen[0]) throw new AuthorizationError("not_found");
  },
});

describe("GET /analytics/download, the 6.4b sheets (10 point 4; plan of 6.4b)", () => {
  it("writes every price rise with both prices as number cells and the rise", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const item = await bought(scene, { purchasedOn: "2031-09-20", unitPrice: "5000" });
    await recordOn(
      scene,
      { id: item.orderId, ownerId: item.ownerId, variantId: item.variantId },
      { purchasedOn: "2031-10-04", unitPrice: "6000" },
    );
    await refreshNow();
    const filters = { ...NO_ANALYTICS_FILTERS, category: scene.category.id };
    const rows = await sheetOf(
      await GET(
        downloadRequest(
          `/analytics/download?${analyticsSearch(THIS_MONTH, filters, { block: "priceRises" })}`,
          await signInAs(head),
        ),
      ),
    );
    const body = rows.filter((row) => typeof row[1] === "number");
    expect(body).toHaveLength(1);
    expect([body[0]![1], body[0]![3], body[0]![5], body[0]![6]]).toEqual([
      5_000,
      6_000,
      1_000,
      "20.0 %",
    ]);
  });

  it("answers 404 for a reason beside a key that is not a send back or reject", async () => {
    const head = await insertUser("HEAD");
    const response = await GET(
      downloadRequest(
        "/analytics/download?period=this_month&block=approvals&key=step:all:APPROVE&reason=narxi",
        await signInAs(head),
      ),
    );
    expect(response.status).toBe(404);
  });
});

// The blocks of 6.4c (plan of 6.4c, Tests: "the three new blocks in the route matrix"): the
// Managers table, the cancelled records and the cash held behind the wall, the same wall for each.
describePermissionMatrix("GET /analytics/download, the blocks of 6.4c behind the wall", {
  permission: "data.export",
  async run({ user, branchId }) {
    setClock(AT);
    const scene = await spendingScene(branchId);
    const cancelled = await bought(scene, {
      purchasedOn: "2031-10-02",
      cancelled: true,
      cancelledAt: "2031-10-03T05:00:00Z",
    });
    const held = await bought(scene, { purchasedOn: "2031-10-02", unitPrice: "0" });
    await moneyOn(held, scene.manager.id, { amount: 30_000n, occurredOn: "2031-10-04" });
    await refreshNow();
    const cookie = await signInAs(user);
    const own = { ...NO_ANALYTICS_FILTERS, category: scene.category.id };
    const texts = async (block: ExportBlock, extra: Parameters<typeof analyticsSearch>[2] = {}) =>
      (
        await sheetOf(
          await GET(
            downloadRequest(
              `/analytics/download?${analyticsSearch(THIS_MONTH, own, { ...extra, block })}`,
              cookie,
            ),
          ),
        )
      )
        .flat()
        .map((cell) => String(cell));
    const seen = [
      (await texts("managers")).includes(scene.manager.fullName),
      (await texts("cancelled")).includes(cancelled.number!),
      (await texts("cash")).includes(held.number!),
    ];
    expect(seen).toEqual(seen.map(() => seen[0]));
    // "Other owners" keeps the Manager's rows out of both lists.
    expect((await texts("cancelled", { otherOwners: true })).includes(cancelled.number!)).toBe(
      false,
    );
    expect((await texts("cash", { otherOwners: true })).includes(held.number!)).toBe(false);
    if (!seen[0]) throw new AuthorizationError("not_found");
  },
});

describe("GET /analytics/download, the 6.4c sheets (10 point 4; plan of 6.4c)", () => {
  it("writes a Manager's cash held and its days as number cells, and the list's held total", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const held = await bought(scene, { purchasedOn: "2031-10-02", unitPrice: "0" });
    await moneyOn(held, head.id, { amount: 30_000n, occurredOn: "2031-10-05" });
    await refreshNow();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
    const get = async (block: ExportBlock) =>
      sheetOf(
        await GET(
          downloadRequest(
            `/analytics/download?${analyticsSearch(THIS_MONTH, filters, { block })}`,
            await signInAs(head),
          ),
        ),
      );
    const managers = await get("managers");
    const row = managers.find((each) => each[0] === scene.manager.fullName)!;
    // Held 30 000 since 5 October: 10 days on 15 October.
    expect([row[4], row[5]]).toEqual([30_000, 10]);
    const cash = await get("cash");
    expect(cash.some((each) => each.includes(held.number!) && each.includes(30_000))).toBe(true);
    expect(cash.at(-1)!.includes(30_000)).toBe(true);
  });

  it("answers 404 for Other owners beside the Managers table", async () => {
    const head = await insertUser("HEAD");
    const response = await GET(
      downloadRequest(
        "/analytics/download?period=this_month&block=managers&owner=other",
        await signInAs(head),
      ),
    );
    expect(response.status).toBe(404);
  });
});

/**
 * A branch's warehouse for the 6.4d blocks: 10 × 1 000 of an item with a minimum of 9, 2 of it
 * issued to the department on 3 October (so 8 left, Low), and the summary refreshed.
 */
async function warehouseIn(branchId?: string) {
  setClock(AT);
  const scene = await spendingScene(branchId);
  const variant = await stocked(scene, { qty: "10", unitCost: 1_000n, minimum: "9" });
  const issue = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-10-03",
    lines: [{ variantId: variant, qty: "2" }],
  });
  const number = (
    await db.execute<{ number: string }>(
      sql`select number from stock_documents where id = ${issue}`,
    )
  ).rows[0]!.number;
  await refreshNow();
  return { scene, number };
}

// The blocks of 6.4d (plan of 6.4d, Tests: "the four new blocks in the route matrix"): the table
// per branch, use by department and the two lists behind the wall, the same wall for each.
describePermissionMatrix("GET /analytics/download, the blocks of 6.4d behind the wall", {
  permission: "data.export",
  async run({ user, branchId }) {
    const { scene, number } = await warehouseIn(branchId);
    const cookie = await signInAs(user);
    const own = { ...NO_ANALYTICS_FILTERS, category: scene.category.id };
    const texts = async (block: ExportBlock, extra: Parameters<typeof analyticsSearch>[2] = {}) =>
      (
        await sheetOf(
          await GET(
            downloadRequest(
              `/analytics/download?${analyticsSearch(THIS_MONTH, own, { ...extra, block })}`,
              cookie,
            ),
          ),
        )
      )
        .flat()
        .map((cell) => String(cell));
    const branchName = (
      await db.execute<{ name: string }>(sql`select name from branches where id = ${branchId}`)
    ).rows[0]!.name;
    const seen = [
      (await texts("warehouse")).includes(branchName),
      (await texts("departmentUse")).includes(scene.department.name),
      (await texts("stock", { key: { kind: "stock", view: "low" } })).includes(branchName),
      (await texts("moves", { key: { kind: "moves", move: "use" } })).includes(number),
    ];
    expect(seen).toEqual(seen.map(() => seen[0]));
    if (!seen[0]) throw new AuthorizationError("not_found");
  },
});

describe("GET /analytics/download, the 6.4d sheets (10 point 4; plan of 6.4d)", () => {
  it("writes the stock value and the use as number cells, and each list's total", async () => {
    const { scene, number } = await warehouseIn();
    const head = await insertUser("HEAD");
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
    const get = async (block: ExportBlock, extra: Parameters<typeof analyticsSearch>[2] = {}) =>
      sheetOf(
        await GET(
          downloadRequest(
            `/analytics/download?${analyticsSearch(THIS_MONTH, filters, { ...extra, block })}`,
            await signInAs(head),
          ),
        ),
      );
    const branches = await get("warehouse");
    // The branch's row, then "All branches": value 8 000, 1 Low, nothing still, nothing off.
    expect(branches.at(-2)!.slice(1, 6)).toEqual([8_000, 1, 0, 0, 0]);
    const use = await get("departmentUse");
    expect(use.find((row) => row[0] === scene.department.name)?.[2]).toBe(2_000);
    const lines = await get("stock", { key: { kind: "stock", view: "value" } });
    expect(lines.at(-1)!.includes(8_000)).toBe(true);
    const moves = await get("moves", { key: { kind: "moves", move: "use" } });
    expect(moves.some((row) => row.includes(number) && row.includes(2_000))).toBe(true);
    expect(moves.at(-1)!.includes(2_000)).toBe(true);
  });

  it("answers 404 for a list of stock or movements without its key", async () => {
    const head = await insertUser("HEAD");
    for (const block of ["stock", "moves"]) {
      const response = await GET(
        downloadRequest(
          `/analytics/download?period=this_month&block=${block}`,
          await signInAs(head),
        ),
      );
      expect(response.status).toBe(404);
    }
  });
});

/**
 * A branch's rows for the 6.5a blocks: a record of 23 456 so'm bought on 3 October, its order Open
 * with buying Done; an order submitted on 10 October waiting at Waiting for Principal, needed by
 * 17 October (coming up); one decided by `deciderId` at the Principal step in 3 hours. The summary
 * refreshed.
 */
async function principalRowsIn(deciderId: string, branchId?: string) {
  setClock(AT);
  const scene = await spendingScene(branchId);
  const record = await bought(scene, {
    purchasedOn: "2031-10-03",
    unitPrice: "23456",
    progress: "DONE",
  });
  const waiting = await decided(
    scene,
    "PENDING_PRINCIPAL",
    [{ type: "SUBMIT", from: "DRAFT", to: "PENDING_PRINCIPAL", at: "2031-10-10T05:00:00Z" }],
    { submittedAt: "2031-10-10T05:00:00Z", neededBy: "2031-10-17" },
  );
  await decided(
    scene,
    "PENDING_FINANCE",
    [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_PRINCIPAL", at: "2031-10-04T05:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_PRINCIPAL",
        to: "PENDING_FINANCE",
        at: "2031-10-04T08:00:00Z",
        actorId: deciderId,
      },
    ],
    { submittedAt: "2031-10-04T05:00:00Z", neededBy: "2031-12-30" },
  );
  await refreshNow();
  const product = (
    await db.execute<{ name: string }>(sql`
      select pr.name from purchases p
      join product_variants v on v.id = p.variant_id join products pr on pr.id = v.product_id
      where p.id = ${record.purchaseId}`)
  ).rows[0]!.name;
  const number = (
    await db.execute<{ number: string }>(sql`select number from orders where id = ${waiting.id}`)
  ).rows[0]!.number;
  return { scene, product, number };
}

// The blocks of 6.5a (plan of 6.5a, Tests: "the four new blocks in the route test's matrix"): the
// top products, the Orders block, its list and My approvals behind the wall, the same wall for
// each.
describePermissionMatrix("GET /analytics/download, the blocks of 6.5a behind the wall", {
  permission: "data.export",
  async run({ user, branchId }) {
    const { scene, product, number } = await principalRowsIn(user.id, branchId);
    const cookie = await signInAs(user);
    const own = { ...NO_ANALYTICS_FILTERS, category: scene.category.id };
    const sheet = async (block: ExportBlock, extra: Parameters<typeof analyticsSearch>[2] = {}) =>
      sheetOf(
        await GET(
          downloadRequest(
            `/analytics/download?${analyticsSearch(THIS_MONTH, own, { ...extra, block })}`,
            cookie,
          ),
        ),
      );
    const texts = async (block: ExportBlock, extra: Parameters<typeof analyticsSearch>[2] = {}) =>
      (await sheet(block, extra)).flat().map((cell) => String(cell));
    // The count of a row by its first cell.
    const countOf = (rows: unknown[][], index: number) => rows.at(index)?.[1];
    const statuses = await sheet("orderStatuses");
    const approvals = await sheet("myApprovals");
    const seen = [
      (await texts("products")).includes(product),
      (await texts("statusOrders", { key: { kind: "due", due: "soon" } })).includes(number),
      // The coming-up line is the third from the end, after the total.
      countOf(statuses, -2) === 1,
      // "My decisions" is the last line.
      countOf(approvals, -1) === 1,
    ];
    expect(seen).toEqual(seen.map(() => seen[0]));
    if (!seen[0]) throw new AuthorizationError("not_found");
  },
});

describe("GET /analytics/download, the 6.5a sheets (10 point 4; plan of 6.5a)", () => {
  it("writes the top products as money cells, the counts by status, coming up and overdue, and my hours", async () => {
    const principal = await insertUser("PRINCIPAL");
    const branchId = (
      await db.execute<{ branch_id: string }>(
        sql`select branch_id from user_branches where user_id = ${principal.id}`,
      )
    ).rows[0]!.branch_id;
    const { product, number } = await principalRowsIn(principal.id, branchId);
    const filters = { ...NO_ANALYTICS_FILTERS, branch: branchId };
    const get = async (block: ExportBlock, extra: Parameters<typeof analyticsSearch>[2] = {}) =>
      sheetOf(
        await GET(
          downloadRequest(
            `/analytics/download?${analyticsSearch(THIS_MONTH, filters, { ...extra, block })}`,
            await signInAs(principal),
          ),
        ),
      );
    const products = await get("products");
    expect(products.find((row) => row[0] === product)?.[1]).toBe(23_456);
    expect(products.at(-1)!.includes(23_456)).toBe(true);
    const statuses = await get("orderStatuses");
    // PENDING_PRINCIPAL 1, PENDING_FINANCE 1, PURCHASING 1, the total 3, coming up 1, overdue 0.
    expect(statuses.slice(-6).map((row) => row[1])).toEqual([1, 1, 1, 3, 1, 0]);
    const list = await get("statusOrders", { key: { kind: "due", due: "soon" } });
    expect(list.at(-1)![0]).toBe(number);
    const approvals = await get("myApprovals");
    expect(approvals.at(-2)!.slice(1, 2)).toEqual(["3.0"]);
  });

  it("answers 404 for the Orders list without its key", async () => {
    const head = await insertUser("HEAD");
    const response = await GET(
      downloadRequest(
        "/analytics/download?period=this_month&block=statusOrders",
        await signInAs(head),
      ),
    );
    expect(response.status).toBe(404);
  });
});

/**
 * The Manager's rows owned by `ownerId` (build-plan 6.5b): an order submitted on 1 October, sent
 * back once, Open on 3 October (48 hours); a record of 23 456 so'm paid in cash on an order planned
 * at 5 000 (owed 23 456). The summary refreshed.
 */
async function ownRowsIn(ownerId: string, branchId?: string) {
  setClock(AT);
  const scene = await spendingScene(branchId);
  await decided(
    scene,
    "PURCHASING",
    [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-01T05:00:00Z" },
      {
        type: "SEND_BACK",
        from: "PENDING_HEAD",
        to: "RETURNED",
        at: "2031-10-01T06:00:00Z",
        reason: "Boshqa do'kondan oling",
      },
      { type: "SUBMIT_AGAIN", from: "RETURNED", to: "PENDING_FINANCE", at: "2031-10-02T05:00:00Z" },
      { type: "APPROVE", from: "PENDING_FINANCE", to: "PURCHASING", at: "2031-10-03T05:00:00Z" },
    ],
    { ownerId, submittedAt: "2031-10-01T05:00:00Z" },
  );
  const record = await bought(scene, { ownerId, purchasedOn: "2031-10-03", unitPrice: "23456" });
  await refreshNow();
  const found = await db.execute<{ name: string; number: string }>(sql`
    select pr.name, o.number from purchases p
    join orders o on o.id = p.order_id
    join product_variants v on v.id = p.variant_id join products pr on pr.id = v.product_id
    where p.id = ${record.purchaseId}`);
  return { scene, product: found.rows[0]!.name, number: found.rows[0]!.number };
}

// The blocks of 6.5b (plan of 6.5b, Tests: the route matrix for the four new download blocks):
// My orders, its reasons, My estimates and My cash behind the wall, the same wall for each.
describePermissionMatrix("GET /analytics/download, the blocks of 6.5b behind the wall", {
  permission: "data.export",
  async run({ user, branchId }) {
    const { scene, product, number } = await ownRowsIn(user.id, branchId);
    const cookie = await signInAs(user);
    const own = { ...NO_ANALYTICS_FILTERS, category: scene.category.id };
    const texts = async (block: ExportBlock, extra: Parameters<typeof analyticsSearch>[2] = {}) =>
      (
        await sheetOf(
          await GET(
            downloadRequest(
              `/analytics/download?${analyticsSearch(THIS_MONTH, own, { ...extra, block })}`,
              cookie,
            ),
          ),
        )
      )
        .flat()
        .map((cell) => String(cell));
    const seen = [
      (await texts("myOrders")).includes("48.0"),
      (await texts("myReasons")).includes("Boshqa do'kondan oling"),
      (await texts("myEstimates")).includes(product),
      (await texts("myCash")).includes(number),
      // The lists of the two new keys (permission review, Must fix 2).
      (await texts("statusOrders", { key: { kind: "approved" } })).includes("48.0"),
      (await texts("records", { key: { kind: "priced", product: null } })).includes(number),
    ];
    expect(seen).toEqual(seen.map(() => seen[0]));
    if (!seen[0]) throw new AuthorizationError("not_found");
  },
});

describe("GET /analytics/download, the 6.5b sheets (10 point 4; plan of 6.5b)", () => {
  it("writes my hours and share, the reason, the estimate as money cells and the cash count signed", async () => {
    const { manager, branch } = await spendingScene();
    const { product, number } = await ownRowsIn(manager.id, branch.id);
    const get = async (block: ExportBlock) =>
      sheetOf(
        await GET(
          downloadRequest(
            `/analytics/download?${analyticsSearch(THIS_MONTH, NO_ANALYTICS_FILTERS, { block })}`,
            await signInAs(manager),
          ),
        ),
      );
    const orders = await get("myOrders");
    // The last four lines: hours to full approval, orders that reached Open, decisions, sent back.
    expect(orders.slice(-4).map((row) => row[1])).toEqual(["48.0", 1, 2, 1]);
    expect(orders.at(-1)![3]).toBe("50.0 %");
    expect((await get("myReasons")).at(-1)!.slice(0, 2)).toEqual(["Boshqa do'kondan oling", 1]);
    const estimates = await get("myEstimates");
    // Planned 5 000, paid 23 456: 18 456 more.
    expect(estimates.find((row) => row[0] === product)!.slice(3, 6)).toEqual([
      5_000, 23_456, -18_456,
    ]);
    const cash = await get("myCash");
    expect(cash.find((row) => row[0] === number)!.at(-1)).toBe(-23_456);
    // Held, then owed, never netted.
    expect(cash.slice(-2).map((row) => row.at(-1))).toEqual([0, 23_456]);
  });
});

/**
 * A stock line of the branch (build-plan 6.5c): 30 received, minimum 5; 9 issued on 3 October and
 * 3 on 10 September. On hand 18; the 90 days 12, so 18 × 90 ÷ 12 = 135 days and nothing to order.
 * The summary refreshed.
 */
async function planningIn(branchId?: string) {
  setClock(AT);
  const scene = await spendingScene(branchId);
  const variant = await stocked(scene, { qty: "30", unitCost: 1_000n, minimum: "5" });
  const line = (qty: string) => [{ variantId: variant, qty }];
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-10-03", lines: line("9") });
  await stockDocument(scene, { type: "ISSUE", docDate: "2031-09-10", lines: line("3") });
  await refreshNow();
  const found = await db.execute<{ name: string }>(sql`
    select pr.name from product_variants v join products pr on pr.id = v.product_id
    where v.id = ${variant}`);
  return { scene, variant, product: found.rows[0]!.name };
}

// The block of 6.5c (plan of 6.5c, Tests): Stock planning and the moves of one subtype behind the
// wall, the same wall for each.
describePermissionMatrix("GET /analytics/download, the Stock planning sheet behind the wall", {
  permission: "data.export",
  async run({ user, branchId }) {
    const { scene, variant, product } = await planningIn(branchId);
    const cookie = await signInAs(user);
    const own = { ...NO_ANALYTICS_FILTERS, category: scene.category.id };
    const texts = async (block: ExportBlock, extra: Parameters<typeof analyticsSearch>[2] = {}) =>
      (
        await sheetOf(
          await GET(
            downloadRequest(
              `/analytics/download?${analyticsSearch(THIS_MONTH, own, { ...extra, block })}`,
              cookie,
            ),
          ),
        )
      )
        .flat()
        .map((cell) => String(cell));
    const seen = [
      (await texts("stockPlanning")).includes(product),
      (await texts("moves", { key: { kind: "moves", move: "use" }, variant })).includes(product),
    ];
    expect(seen).toEqual(seen.map(() => seen[0]));
    if (!seen[0]) throw new AuthorizationError("not_found");
  },
});

describe("GET /analytics/download, the Stock planning sheet (10 point 4; plan of 6.5c)", () => {
  it("writes every line with its use per month, its change, the 90 days, runs out in and the suggestion", async () => {
    const { scene, product } = await planningIn();
    const response = await GET(
      downloadRequest(
        `/analytics/download?${analyticsSearch(THIS_MONTH, NO_ANALYTICS_FILTERS, {
          block: "stockPlanning",
        })}`,
        await signInAs(scene.manager),
      ),
    );
    expect(response.status).toBe(200);
    const rows = await sheetOf(response);
    const row = rows.find((each) => each[0] === product)!;
    // Product, branch, measure, on hand, minimum, Low, October, the period, before, change, the 90
    // days, runs out in, suggested.
    expect(row.slice(3)).toEqual(["18", "5", "", "9", "9", "3", "200.0 %", "12", 135, "0"]);
  });

  it("is Not found with another branch's filter (03 rule 1)", async () => {
    const { scene } = await planningIn();
    const other = await spendingScene();
    const response = await GET(
      downloadRequest(
        `/analytics/download?${analyticsSearch(
          THIS_MONTH,
          { ...NO_ANALYTICS_FILTERS, branch: other.branch.id },
          { block: "stockPlanning" },
        )}`,
        await signInAs(scene.manager),
      ),
    );
    expect(response.status).toBe(404);
  });
});
