import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../../../../../tests/helpers/branches";
import { setClock } from "../../../../../../tests/helpers/clock";
import { downloadRequest } from "../../../../../../tests/helpers/files";
import {
  insertExtraCostType,
  insertOrder,
  insertOrderExtra,
  orderRow,
  setOrderStatus,
} from "../../../../../../tests/helpers/orders";
import { pdfPages } from "../../../../../../tests/helpers/pdf-text";
import { insertPurchaseRow, insertTrip } from "../../../../../../tests/helpers/purchases";
import { insertUser, signInAs } from "../../../../../../tests/helpers/users";
import { GET } from "./route";

// The actual columns of the order list's download through its route, against PostgreSQL (build
// plan 3.5, Done when: "A test reads the downloads of the Cheaper case and finds 470 000 and
// 50 000"; 05-order-request-form.md, Download 1; 15-quality-and-acceptance.md S2; plan of 3.5,
// decided items 4 and 6, and review corrections 3 and 4). A file of its own, so its PDF is the
// first one its test process renders (see the report of 3.5 on letters lost after a Russian PDF).

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

/** Every order row of the sheet, by column title. */
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

describe("the actual columns of the download (build plan 3.5, Done when; 05 Download 1; 15 S2)", () => {
  /**
   * 15 S2 Cheaper on the plan of 08: 100 notebooks × 5 000 in cash plus 20 000 delivery, 520 000;
   * the Manager pays 4 500 each and the delivery 20 000. Beside it an Open order with nothing
   * received and one waiting for Finance (D40).
   */
  async function cheaper() {
    setClock("2031-05-10T07:00:00Z");
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id], locale: "en" });
    const plan = { branchId: branch.id, ownerId: manager.id, paymentType: "CASH" as const };
    const notebooks = await insertOrder({
      ...plan,
      status: "RETURNED",
      plannedQty: "100",
      plannedPrice: 5_000n,
      approvedAt: new Date("2031-05-05T07:00:00Z"),
    });
    // The planned delivery is written while the plan is open, then the order is Open.
    await insertOrderExtra(notebooks.id, 20_000n);
    await setOrderStatus(notebooks.id, "PURCHASING");
    const tripId = (await insertTrip(branch.id, manager.id)).rows[0]!.id;
    const record = await insertPurchaseRow({
      tripId,
      orderId: notebooks.id,
      branchId: branch.id,
      variantId: notebooks.variantId,
      createdBy: manager.id,
      qty: "100",
      unitPrice: "4500",
      comment: "Cheaper at the market",
    });
    const delivery = await insertExtraCostType();
    await db.execute(sql`
      insert into purchase_extras (purchase_id, extra_cost_type_id, amount, payment_type, created_at)
      values (${record.rows[0]!.id}, ${delivery.id}, 20000, 'CASH', now())`);
    const nothing = await insertOrder({ ...plan, status: "PURCHASING", plannedQty: "10" });
    const waiting = await insertOrder({ ...plan, status: "PENDING_FINANCE" });
    const numbers = new Map<string, string>();
    for (const order of [notebooks, nothing, waiting]) {
      numbers.set(order.id, (await orderRow(order.id))!.number!);
    }
    return { manager, notebooks, nothing, waiting, numbers };
  }

  it("the Excel file: 100, 4 500, 20 000, 470 000 and 50 000; nothing received; empty before Open", async () => {
    const { manager, notebooks, nothing, waiting, numbers } = await cheaper();
    const rows = rowsByTitle(
      await workbookOf(await download("excel", "", await signInAs(manager))),
    );
    const row = (id: string) => rows.find((each) => each.Number === numbers.get(id))!;

    expect(row(notebooks.id)).toMatchObject({
      "Planned total": 520_000,
      "Actual quantity": 100,
      "Actual price": 4_500,
      "Actual extra costs": 20_000,
      "Actual total": 470_000,
      Difference: 50_000,
    });
    // Open with nothing received: 0, no price, 0, 0, and the planned total left (review correction 4).
    expect(row(nothing.id)).toMatchObject({
      "Planned total": 50_000,
      "Actual quantity": 0,
      "Actual price": null,
      "Actual extra costs": 0,
      "Actual total": 0,
      Difference: 50_000,
    });
    expect(row(waiting.id)).toMatchObject({
      "Actual quantity": null,
      "Actual price": null,
      "Actual extra costs": null,
      "Actual total": null,
      Difference: null,
    });
  });

  it("the PDF: the Cheaper order's line reads 470 000 and 50 000", async () => {
    const { manager, notebooks, numbers } = await cheaper();
    const response = await download("pdf", "", await signInAs(manager));
    const all = (await pdfPages(new Uint8Array(await response.arrayBuffer())))
      .join(" ")
      .replace(/\u00a0/g, " ");
    const number = numbers.get(notebooks.id)!;
    // The order's line starts at its planned total, which no other order of the file has.
    expect(all).toContain(number);
    const line = all.slice(all.indexOf("520 000 so'm"));
    expect(line).toContain("470 000 so'm");
    // "50 000 so'm" on its own, never the end of a larger amount such as 450 000.
    expect(line).toMatch(/(?<!\d)(?<!\d )50 000 so'm/);
    expect(line).toContain("4 500 so'm");
  });
});
