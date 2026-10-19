import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import { bought, recordOn, spendingScene } from "../../../../tests/helpers/analytics";
import { insertCategory, insertProduct } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS } from "../../analytics/period-params";
import { REPORT_PAGE_SIZE } from "../report-params";

import { getPurchaseRegister } from "./purchase-register";

// The Purchase register (10-notifications-analytics-reports.md, Reports: "Every purchase record
// with supplier, price and payment type"; 08-money-and-settlement.md, Actual total; Decided ahead,
// question 3: a cancelled record counts in no total; plan of 6.8, decided item 2, Look first, and
// review corrections 1 and 2). Read from the live tables: no refresh is run.

const AT = "2031-05-15T05:00:00Z";
const MAY = { first: "2031-05-01", last: "2031-05-15" };

describe("the records of the dates, with supplier, price and payment type (10 Reports)", () => {
  it("lists each record with its goods, extra costs and parts by payment type", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    // 3 × 10 001 in cash, and an extra cost of 2 500 paid by card: two payment types.
    const record = await bought(scene, {
      purchasedOn: "2031-05-03",
      qty: "3.000",
      unitPrice: "10001",
      paymentType: "CASH",
      extras: [{ amount: 2_500n, paymentType: "CARD" }],
      receipt: true,
    });
    const register = await getPurchaseRegister(
      head.id,
      { range: MAY, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } },
      1,
    );
    expect(register.rows).toHaveLength(1);
    expect(register.rows[0]).toMatchObject({
      purchaseId: record.purchaseId,
      orderNumber: record.number,
      purchasedOn: "2031-05-03",
      supplierName: expect.any(String),
      qty: "3.000",
      unitPrice: 10_001n,
      goods: 30_003n,
      extras: 2_500n,
      total: 32_503n,
      parts: [
        { paymentType: "CASH", amount: 30_003n },
        { paymentType: "CARD", amount: 2_500n },
      ],
      hasReceipt: true,
      cancelReason: null,
    });
    expect(register.count).toBe(1);
    expect(register.total).toBe(32_503n);
  });

  it("lists a cancelled record with its own amounts, marked, in neither the count nor the total (correction 2)", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    await bought(scene, { purchasedOn: "2031-05-03", unitPrice: "100000" });
    // Every other value the same as the counted one: only the cancel keeps it out of the total.
    const cancelled = await bought(scene, {
      purchasedOn: "2031-05-03",
      unitPrice: "40000",
      extras: [1_000n],
      cancelled: true,
    });
    const register = await getPurchaseRegister(
      head.id,
      { range: MAY, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } },
      "all",
    );
    expect(register.count).toBe(1);
    expect(register.cancelledCount).toBe(1);
    expect(register.total).toBe(100_000n);
    const row = register.rows.find((each) => each.purchaseId === cancelled.purchaseId);
    expect(row).toMatchObject({
      goods: 40_000n,
      extras: 1_000n,
      total: 41_000n,
      cancelReason: "Xato kiritildi",
    });
    // The counted records come first, the cancelled after them.
    expect(register.rows.map((each) => each.cancelReason === null)).toEqual([true, false]);
  });

  it("leaves out a record a day outside the dates, and another branch's record", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const other = await spendingScene();
    const manager = scene.manager;
    const inside = await bought(scene, { purchasedOn: "2031-05-15", unitPrice: "5000" });
    await bought(scene, { purchasedOn: "2031-05-16", unitPrice: "5000" });
    await bought(scene, { purchasedOn: "2031-04-30", unitPrice: "5000" });
    // Another branch: every other value the same (D40).
    await bought(other, { purchasedOn: "2031-05-15", unitPrice: "5000" });
    const register = await getPurchaseRegister(
      manager.id,
      { range: MAY, filters: NO_ANALYTICS_FILTERS },
      "all",
    );
    expect(register.rows.map((row) => row.purchaseId)).toEqual([inside.purchaseId]);
    expect(register.total).toBe(5_000n);
    await expect(
      getPurchaseRegister(
        manager.id,
        { range: MAY, filters: { ...NO_ANALYTICS_FILTERS, branch: other.branch.id } },
        1,
      ),
    ).rejects.toMatchObject(new AuthorizationError("not_found"));
  });

  it("files a substituted record under the bought subtype's category (correction 1)", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const order = await bought(scene, { purchasedOn: "2031-05-04", unitPrice: "7000" });
    // A second record of the same order, of a product of another category.
    const elsewhere = await insertCategory();
    const substitute = await insertProduct({ categoryId: elsewhere.id });
    const swapped = await recordOn(
      scene,
      { id: order.orderId, ownerId: order.ownerId, variantId: substitute.defaultVariantId },
      { purchasedOn: "2031-05-04", unitPrice: "9000" },
    );
    const read = (category: string) =>
      getPurchaseRegister(
        head.id,
        {
          range: MAY,
          filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id, category },
        },
        "all",
      );
    expect((await read(elsewhere.id)).rows.map((row) => row.purchaseId)).toEqual([
      swapped.purchaseId,
    ]);
    expect((await read(scene.category.id)).rows.map((row) => row.purchaseId)).toEqual([
      order.purchaseId,
    ]);
  });

  it("shows 25 a page (11-screens-and-ux.md rule 8), the count and total of every page", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    for (let at = 0; at <= REPORT_PAGE_SIZE; at += 1) {
      await bought(scene, { purchasedOn: "2031-05-05", unitPrice: "1000" });
    }
    const params = { range: MAY, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } };
    const first = await getPurchaseRegister(head.id, params, 1);
    const second = await getPurchaseRegister(head.id, params, 2);
    expect(first.rows).toHaveLength(REPORT_PAGE_SIZE);
    expect(second.rows).toHaveLength(1);
    expect([first.pages, second.page, second.count, second.total]).toEqual([
      2,
      2,
      REPORT_PAGE_SIZE + 1,
      26_000n,
    ]);
  });
});
