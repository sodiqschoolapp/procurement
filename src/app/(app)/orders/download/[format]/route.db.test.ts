import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { formatDate, formatTime } from "@/i18n/format";
import { approveOrders } from "@/features/orders/actions/approve";
import { submitDrafts } from "@/features/orders/actions/submit";
import { NO_FILTERS } from "@/features/orders/list-filters";
import { listOrderGroups, tickedSummary } from "@/features/orders/queries/order-list";
import { db } from "@/server/db/client";
import { departments, products } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../../../tests/helpers/branches";
import { setClock } from "../../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../../tests/helpers/files";
import { insertOrder, insertOrderExtra, orderRow } from "../../../../../../tests/helpers/orders";
import { pdfPages } from "../../../../../../tests/helpers/pdf-text";
import { insertUser, signInAs } from "../../../../../../tests/helpers/users";
import { GET } from "./route";

// The order list's download through its route, against PostgreSQL (build-plan 2.14, Done when: S17
// "as a test that reads the Excel file and the text of the PDF; a product name in Cyrillic is
// readable in the PDF"). 15-quality-and-acceptance.md S17; 05-order-request-form.md, Download 1
// to 4; 03-roles-and-permissions.md rule 1 and the matrix row "Export to Excel, download PDF,
// print"; plan of 2.14 and the review of the plan (corrections 1, 3, 4 and 5). Every refused row
// stands beside the listed ones with every other value that would let it in (D40).

const CYRILLIC_PRODUCT = "Ручка шариковая";
const CHECK_STRING = "Oʻgʻil, Ўзбекистон, Қашқадарё";

type Ticked = { id: string; version: number };
const ticked = (list: readonly Ticked[]) => ({
  clientKey: randomUUID(),
  orders: list.map(({ id, version }) => ({ id, version })),
});

function okOf<T>(result: { ok: boolean }): T {
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

async function download(format: string, query: string, cookie?: { name: string; value: string }) {
  return GET(downloadRequest(`/orders/download/${format}?${query}`, cookie), {
    params: Promise.resolve({ format }),
  });
}

async function workbookOf(response: Response) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await response.arrayBuffer()) as ArrayBuffer);
  return workbook.worksheets[0]!;
}

/** The text of every cell of a row, by column title. */
function rowsByTitle(worksheet: ExcelJS.Worksheet) {
  const titles = (worksheet.getRow(1).values as unknown[]).slice(1).map(String);
  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow((row, number) => {
    if (number === 1) return;
    const values = (row.values as unknown[]).slice(1);
    if (typeof values[0] !== "string" || !values[0]) return; // the empty row and the totals
    rows.push(Object.fromEntries(titles.map((title, at) => [title, values[at] ?? null])));
  });
  return rows;
}

/** The totals under the rows: label → amount. */
function totalsOf(worksheet: ExcelJS.Worksheet): Map<string, number> {
  const totals = new Map<string, number>();
  worksheet.eachRow((row) => {
    const values = row.values as unknown[];
    if (values[1] == null && typeof values[12] === "string" && typeof values[13] === "number") {
      totals.set(values[12], values[13]);
    }
  });
  return totals;
}

/**
 * The scene of S17: a Manager's branch with orders created on several days, one week filtered.
 * In the week: A (waiting for the Principal, approved by the Head), B (waiting for the Head, an
 * extra cost, paid by transfer) and `extra` more submitted orders; outside the week: C; in the
 * week but not listed: a Draft and another branch's submitted order.
 */
async function scene(extra = 0, locale: "uz" | "ru" | "en" = "en") {
  const branch = await insertBranch();
  const otherBranch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id], locale });
  const otherManager = await insertUser("MANAGER", { branches: [otherBranch.id] });
  await insertUser("PRINCIPAL", { branches: [branch.id] });
  const head = await insertUser("HEAD", { fullName: "Invented Head Person", locale: "en" });

  setClock("2026-10-13T05:00:00Z");
  const a = await insertOrder({ branchId: branch.id, ownerId: manager.id });
  await db
    .update(products)
    .set({ name: `${CYRILLIC_PRODUCT} ${randomUUID().slice(0, 6)}` })
    .where(eq(products.id, (await productOf(a.variantId))!));
  await db
    .update(departments)
    .set({ name: `${CHECK_STRING} ${randomUUID().slice(0, 6)}` })
    .where(eq(departments.id, a.departmentId));
  setClock("2026-10-14T05:00:00Z");
  const b = await insertOrder({
    branchId: branch.id,
    ownerId: manager.id,
    paymentType: "TRANSFER",
    plannedQty: "3",
    plannedPrice: 100_000n,
  });
  await insertOrderExtra(b.id, 2_000n);
  const more = [];
  for (let at = 0; at < extra; at += 1) {
    more.push(await insertOrder({ branchId: branch.id, ownerId: manager.id }));
  }
  const draft = await insertOrder({ branchId: branch.id, ownerId: manager.id });
  const other = await insertOrder({ branchId: otherBranch.id, ownerId: otherManager.id });
  setClock("2026-10-05T05:00:00Z");
  const c = await insertOrder({ branchId: branch.id, ownerId: manager.id });

  setClock("2026-10-15T06:00:00Z");
  okOf(await runOrdersAction(submitDrafts, manager.id, ticked([a, b, ...more, c])));
  okOf(
    await runOrdersAction(
      submitDrafts,
      otherManager.id,
      ticked([{ id: other.id, version: other.version }]),
    ),
  );
  setClock("2026-10-15T09:30:00Z");
  const headAt = new Date("2026-10-15T09:30:00Z");
  const aSubmitted = (await orderRow(a.id))!;
  okOf(await runOrdersAction(approveOrders, head.id, ticked([aSubmitted])));
  setClock("2026-10-16T07:00:00Z");

  const listed = [a.id, b.id, ...more.map((order) => order.id)];
  return { branch, manager, head, headAt, a, b, c, draft, other, listed };
}

const WEEK = "from=2026-10-12&to=2026-10-18";

async function numbersOf(ids: readonly string[]) {
  const summary = await tickedSummaryOf(ids);
  return summary.orders.map((order) => order.number).sort();
}

let tickedReader = "";
async function tickedSummaryOf(ids: readonly string[]) {
  return tickedSummary(tickedReader, ids);
}

async function productOf(variantId: string) {
  const rows = await db.execute<{ product_id: string }>(
    `select product_id from product_variants where id = '${variantId}'`,
  );
  return rows.rows[0]?.product_id;
}

describe("S17: the download lists exactly the filtered orders (15 S17; 05 Download)", () => {
  it("the Excel file: the week's orders, the Head's name and time, empty Principal and Finance, the screen's totals", async () => {
    const { manager, head, headAt, a, listed } = await scene();
    tickedReader = manager.id;
    const cookie = await signInAs(manager);
    const response = await download("excel", WEEK, cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="orders-2026-10-16.xlsx"',
    );
    const worksheet = await workbookOf(response);
    const rows = rowsByTitle(worksheet);

    // Exactly the filtered orders: not C (another week), not the Draft, not the other branch.
    expect(rows.map((row) => String(row.Number)).sort()).toEqual(await numbersOf(listed));

    const [aNumber] = await numbersOf([a.id]);
    const aRow = rows.find((row) => row.Number === aNumber)!;
    expect(aRow.Status).toBe("Waiting for Principal");
    expect(aRow["Procurement Head"]).toBe(head.fullName);
    expect(aRow["Procurement Head, time"]).toBe(`${formatDate(headAt)} ${formatTime(headAt)}`);
    expect(aRow.Principal).toBeNull();
    expect(aRow["Principal, time"]).toBeNull();
    expect(aRow.Finance).toBeNull();
    expect(String(aRow.Product)).toContain(CYRILLIC_PRODUCT);

    // The totals equal the screen: every listed order ticked, and the group rows summed.
    const screen = (await tickedSummaryOf(listed)).totals;
    const groups = await listOrderGroups(manager.id, {
      ...NO_FILTERS,
      from: "2026-10-12",
      to: "2026-10-18",
    });
    const grandOfGroups = groups.groups.reduce(
      (sum, group) => sum + group.summary.totals.grand,
      0n,
    );
    const totals = totalsOf(worksheet);
    expect(BigInt(totals.get("Goods")!)).toBe(screen.goods);
    expect(BigInt(totals.get("Extra costs")!)).toBe(screen.extras);
    expect(BigInt(totals.get("Grand total")!)).toBe(screen.grand);
    expect(BigInt(totals.get("Grand total")!)).toBe(grandOfGroups);
    expect(BigInt(totals.get("Cash")!)).toBe(screen.byPaymentType.CASH);
    expect(BigInt(totals.get("Bank transfer")!)).toBe(screen.byPaymentType.TRANSFER);
    expect(BigInt(totals.get("Corporate card")!)).toBe(0n);
    // The worked case of the plan review: B is 3 × 100 000 + 2 000 by transfer.
    expect(screen.byPaymentType.TRANSFER).toBe(302_000n);
  });

  it("the PDF: the same orders, the Head, the totals, Cyrillic and Uzbek letters, the filters and the downloader on every page", async () => {
    const { manager, head, a, listed } = await scene(30);
    tickedReader = manager.id;
    const cookie = await signInAs(manager);
    const response = await download("pdf", WEEK, cookie);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="orders-2026-10-16.pdf"',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const pages = await pdfPages(bytes);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const all = pages.join(" ");

    for (const number of await numbersOf(listed)) expect(all).toContain(number);
    expect(all).toContain(CYRILLIC_PRODUCT);
    expect(all).toContain(CHECK_STRING);
    expect(all).toContain(head.fullName);
    const [aNumber] = await numbersOf([a.id]);
    expect(all).toContain(aNumber!);

    const screen = (await tickedSummaryOf(listed)).totals;
    const money = (amount: bigint) =>
      `${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
    expect(all.replace(/ /g, " ")).toContain(money(screen.grand));

    // On every page: the filters used, who downloaded it and when (the test clock), the page.
    pages.forEach((page, index) => {
      expect(page).toContain("Filters: Created: 12.10.2026 – 18.10.2026");
      expect(page).toContain(`Downloaded by ${manager.fullName}, 16.10.2026 12:00`);
      expect(page).toContain(`Page ${index + 1} of ${pages.length}`);
    });
    // No signature lines (05 Download).
    expect(all).not.toMatch(/signature/i);
  });

  it("a Russian-language user gets Russian titles and status words in both files (05 Download 3)", async () => {
    const { manager } = await scene(0, "ru");
    const cookie = await signInAs(manager);
    const worksheet = await workbookOf(await download("excel", WEEK, cookie));
    const titles = (worksheet.getRow(1).values as unknown[]).map(String);
    expect(titles).toContain("Номер");
    expect(titles).toContain("Плановая сумма");
    expect(rowsByTitle(worksheet).map((row) => row["Статус"])).toContain("Ждёт директора");

    const pages = await pdfPages(
      new Uint8Array(await (await download("pdf", WEEK, cookie)).arrayBuffer()),
    );
    expect(pages[0]).toContain("Ждёт директора");
    expect(pages[0]).toContain("Фильтры:");
    expect(pages[0]).toContain(`Скачал(а) ${manager.fullName}`);
  });
});

describe("the download route's walls (03 rule 1; plan of 0.7, item 5; plan of 2.14, decided item 4)", () => {
  it("no session is 401; an unknown format is 404", async () => {
    expect((await download("excel", "")).status).toBe(401);
    const manager = await insertUser("MANAGER", { branches: [(await insertBranch()).id] });
    expect((await download("csv", "", await signInAs(manager))).status).toBe(404);
  });

  it("a branch= of another branch is 404, the same as an unknown branch", async () => {
    const { manager, branch, other } = await scene();
    // Every role with a branch wall (permission review of 2.14, Should fix 2).
    const readers = [
      manager,
      await insertUser("PRINCIPAL", { branches: [(await insertBranch()).id] }),
      await insertUser("FINANCE", { branches: [branch.id] }),
    ];
    for (const reader of readers) {
      const cookie = await signInAs(reader);
      expect((await download("excel", `branch=${other.branchId}`, cookie)).status).toBe(404);
      expect((await download("pdf", `branch=${randomUUID()}`, cookie)).status).toBe(404);
    }
  });

  it("the Head's download with branch= holds that branch only; without it every branch", async () => {
    const { head, branch, other } = await scene();
    tickedReader = head.id;
    const cookie = await signInAs(head);
    const own = rowsByTitle(
      await workbookOf(await download("excel", `${WEEK}&branch=${branch.id}`, cookie)),
    );
    const [otherNumber] = await numbersOf([other.id]);
    expect(own.map((row) => row.Number)).not.toContain(otherNumber);
    const every = rowsByTitle(await workbookOf(await download("excel", WEEK, cookie)));
    expect(every.map((row) => row.Number)).toContain(otherNumber);
  });

  it("an empty list still downloads, with its header and no rows", async () => {
    const manager = await insertUser("MANAGER", {
      branches: [(await insertBranch()).id],
      locale: "en",
    });
    const cookie = await signInAs(manager);
    const response = await download("excel", "", cookie);
    expect(response.status).toBe(200);
    expect(rowsByTitle(await workbookOf(response))).toEqual([]);
    const pages = await pdfPages(
      new Uint8Array(await (await download("pdf", "", cookie)).arrayBuffer()),
    );
    expect(pages[0]).toContain("No filters");
  });
});
