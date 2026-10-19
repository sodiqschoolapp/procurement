import { type Locator, type Page, expect, test } from "@playwright/test";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import {
  type Person,
  countOf,
  insertDraft,
  newBranch,
  newDepartment,
  newExtraCostType,
  newPerson,
  newProduct,
  scrollsSideways,
  signIn,
  statusOf,
  stockOf,
  tag,
  withDatabase,
} from "./acceptance-fixtures";

// Build plan 9.1b: the acceptance scenarios of phase 4 (16-build-order.md), money and settlement,
// clicked through as each role (15-quality-and-acceptance.md, Test layers: Full flow). Both
// projects run each one, at 375 px and at 1440 px. Every scenario starts from complete drafts
// written by the fixture and clicks everything after: the Manager's Submit, the three approvals,
// the purchases, the closes and the settlement, so every history event, version and money row
// comes from a real action (plan of 9.1b, decided item 1). Each attempt makes its own branch and
// people (decided item 2), who read English, so the asserted words are the spec's own (decided
// item 3). The plan of section 8 unless a scenario says otherwise: 100 × 5 000 in cash plus
// 20 000 delivery, planned total 520 000.

const o = en.orders;
// 08's orange is drawn amber (src/domain/colours.ts, Colour; plan of 0.10a, decision 7).
const ORANGE = "amber";
const m = en.orders.moves;
const s = en.money.settle;

type Scene = {
  branch: { id: string; code: string };
  department: string;
  delivery: string;
  manager: Person & { id: string };
  principal: Person & { id: string };
  finance: Person & { id: string };
  head: Person & { id: string };
};

/** A branch of its own with its department, the plan's delivery and one person of each role. */
async function newScene(): Promise<Scene> {
  const branch = await newBranch();
  return {
    branch,
    department: await newDepartment(branch.id, `Bo'lim ${tag()}`),
    delivery: await newExtraCostType(`Yetkazib berish ${tag()}`),
    manager: await newPerson("MANAGER", branch.id, "en"),
    principal: await newPerson("PRINCIPAL", branch.id, "en"),
    finance: await newPerson("FINANCE", branch.id, "en"),
    head: await newPerson("HEAD", null, "en"),
  };
}

type Planned = { id: string; product: string; variantId: string };

/** A draft of the scene's Manager: `quantity` × `price`, with the planned delivery when given. */
async function planOf(
  scene: Scene,
  product: string,
  quantity: number,
  price: number,
  plan: { delivery?: number; paymentType?: "CASH" | "CARD" } = {},
): Promise<Planned> {
  const variantId = await newProduct(product, price);
  const id = await insertDraft(
    scene.manager,
    scene.branch.id,
    variantId,
    scene.department,
    quantity,
    price,
    {
      paymentType: plan.paymentType,
      extras: plan.delivery ? [{ typeId: scene.delivery, amount: plan.delivery }] : [],
    },
  );
  return { id, product, variantId };
}

/** The plan of section 8: 100 notebooks × 5 000 in cash plus 20 000 delivery. */
function notebooks(scene: Scene, paymentType: "CASH" | "CARD" = "CASH"): Promise<Planned> {
  return planOf(scene, `Daftar ${tag()}`, 100, 5000, { delivery: 20000, paymentType });
}

/** Signs the page in as another person. */
async function as(page: Page, person: Person): Promise<void> {
  await page.context().clearCookies();
  await signIn(page, person);
}

function count(value: number, one: string, other: string): string {
  return value === 1 ? one : other.replace("#", String(value));
}

/** The group row of a product in the order list (05 Group rows 1). */
function groupOf(page: Page, product: string): Locator {
  return page.locator("tbody[data-group]").filter({ hasText: product });
}

/**
 * Ticks the group rows of the products. On a phone the action bar can cover a lower row's tick
 * box once the first is ticked; the page has answered the first tick, so a click event reaches
 * the others (as settlement.spec.ts ticks its second order).
 */
async function tickGroups(page: Page, orders: Planned[]): Promise<void> {
  for (const [at, order] of orders.entries()) {
    const box = groupOf(page, order.product).getByRole("checkbox", {
      name: o.list.tickGroup.replace("{product}", order.product),
    });
    if (at === 0) await box.check();
    else await box.dispatchEvent("click");
    await expect(box).toBeChecked();
  }
}

/** The list of the owner's orders at one status. */
async function listAt(page: Page, scene: Scene, status: string): Promise<void> {
  await page.goto(`/orders?status=${status}&owner=${scene.manager.id}`);
}

/** Opens the Approve dialog of the ticked orders. */
async function openApprove(page: Page, orders: Planned[]): Promise<Locator> {
  await tickGroups(page, orders);
  await page
    .locator("[data-list-bar]")
    .getByRole("button", {
      name:
        orders.length > 1
          ? o.approve.buttonCount.replace("{count}", String(orders.length))
          : o.approve.button,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Confirms an open Approve dialog and waits for the result (D38). */
async function confirmApprove(page: Page, dialog: Locator, approved: number): Promise<void> {
  await dialog.getByRole("button", { name: o.approve.button, exact: true }).click();
  await expect(
    page.getByText(count(approved, "Approved 1 order.", "Approved # orders.")),
  ).toBeVisible();
}

/**
 * The scene's setting before Finance (plan of 9.1b, decided item 1): the Manager submits the
 * drafts in the grid, the Head and then the Principal approve them on the list.
 */
async function throughApprovals(page: Page, scene: Scene, orders: Planned[]): Promise<void> {
  await as(page, scene.manager);
  await page.goto("/orders");
  for (const order of orders) {
    await page
      .getByRole("checkbox", { name: o.tickRow.replace("{product}", order.product) })
      .check();
  }
  await page
    .getByRole("button", { name: o.submit.button.replace("{count}", String(orders.length)) })
    .click();
  const submit = page.getByRole("alertdialog");
  await submit.getByRole("button", { name: o.submit.confirm, exact: true }).click();
  await expect(
    page.getByText(new RegExp(count(orders.length, "Submitted 1 order", "Submitted # orders"))),
  ).toBeVisible();

  for (const [approver, status] of [
    [scene.head, "PENDING_HEAD"],
    [scene.principal, "PENDING_PRINCIPAL"],
  ] as const) {
    await as(page, approver);
    await listAt(page, scene, status);
    await confirmApprove(page, await openApprove(page, orders), orders.length);
  }
}

/**
 * Finance approves the ticked orders with the cash prefilled per order (08 When Finance
 * approves): each given row is asserted as prefilled before the confirmation.
 */
async function financeApproves(
  page: Page,
  scene: Scene,
  orders: Planned[],
  prefilled: Record<string, string>,
): Promise<void> {
  await as(page, scene.finance);
  await listAt(page, scene, "PENDING_FINANCE");
  const dialog = await openApprove(page, orders);
  for (const [orderId, amount] of Object.entries(prefilled)) {
    await expect(dialog.locator(`[data-cash-row="${orderId}"] input`)).toHaveValue(amount);
  }
  expect(await scrollsSideways(page)).toBe(false);
  await confirmApprove(page, dialog, orders.length);
}

type Bought = { qty?: string; price?: string; delivery?: string; comment?: string };

/**
 * The owner records one purchase of the order from its page: Same as planned, then what differs
 * (07 Purchase record). Buying the planned quantity finishes it: the page shows Done (review of
 * the plan, correction 1).
 */
async function recordPurchase(page: Page, order: Planned, bought: Bought = {}): Promise<void> {
  await page.goto(`/orders/${order.id}`);
  await page.locator("[data-record-purchase]").click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}/purchase$`));
  await page.getByRole("button", { name: en.purchase.form.sameAsPlanned }).click();
  if (bought.qty) await page.locator(`#purchase-qty-${order.id}`).fill(bought.qty);
  if (bought.price) await page.locator(`#purchase-price-${order.id}`).fill(bought.price);
  if (bought.delivery) {
    await page.locator(`#purchase-extra-amount-0-${order.id}`).fill(bought.delivery);
  }
  if (bought.comment) await page.locator(`#purchase-comment-${order.id}`).fill(bought.comment);
  expect(await scrollsSideways(page)).toBe(false);
  await page.getByRole("button", { name: en.purchase.form.save }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  await expect(page.locator('[data-progress="DONE"]')).toBeVisible();
}

/** The order page's label (Number, Price or Total): its colour and its text. */
function labelOf(page: Page, label: "number" | "price" | "total"): Locator {
  return page.locator(`[data-colours] [data-colour-label="${label}"]`).first();
}

/** A move of the list bar on the ticked orders, through its confirmation. */
async function moveOnList(
  page: Page,
  orders: Planned[],
  move: "CLOSE_EXACT" | "SEND_TO_SETTLEMENT",
  done: string,
): Promise<void> {
  await tickGroups(page, orders);
  await page.locator(`[data-list-bar] [data-move="${move}"]`).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: m.button[move], exact: true }).click();
  await expect(page.getByText(done)).toBeVisible();
}

/** The Manager sends the orders to settlement from the list of Open orders (08 Closing 2). */
async function sendToSettlement(page: Page, scene: Scene, orders: Planned[]): Promise<void> {
  await listAt(page, scene, "PURCHASING");
  await moveOnList(
    page,
    orders,
    "SEND_TO_SETTLEMENT",
    count(orders.length, "Sent 1 order to settlement.", "Sent # orders to settlement."),
  );
}

/** Finance ticks the orders Waiting for settlement and opens Settle (08 Closing 2). */
async function openSettle(page: Page, scene: Scene, orders: Planned[]): Promise<void> {
  await as(page, scene.finance);
  await listAt(page, scene, "SETTLEMENT");
  await tickGroups(page, orders);
  await page.locator("[data-list-bar] [data-settle]").click();
  await expect(page).toHaveURL(/\/orders\/settle\?ids=/);
  await expect(page.locator("[data-settlement] h1")).toHaveText(s.title);
}

/** Saves the one settlement action of the screen after its confirmation. */
async function saveSettlement(page: Page, orders: number): Promise<void> {
  await page.locator("[data-settle-comment]").fill("Hisob-kitob sinovi");
  await page.locator("[data-settle-save]").click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: s.save, exact: true }).click();
  await expect(
    page.getByText(
      count(orders, "Settlement saved for 1 order.", "Settlement saved for # orders."),
    ),
  ).toBeVisible();
}

/** Presses Close on the settlement screen and confirms it (08 Closing 3). */
async function closeOnSettle(page: Page): Promise<void> {
  await page.locator('[data-settle-close] [data-move="CLOSE"]').click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: m.button.CLOSE, exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** The live money rows of the orders, by kind, as the database holds them. */
async function moneyRowsOf(orderIds: string[]) {
  return withDatabase(async (client) => {
    const found = await client.query<{
      action: string;
      order_id: string;
      kind: string;
      amount: string;
      created_by: string;
    }>(
      `select a.id as action, r.order_id, r.kind::text as kind, r.amount::text as amount,
              a.created_by
         from money_rows r join money_actions a on a.id = r.money_action_id
        where r.order_id = any($1::uuid[]) and not a.is_cancelled
        order by a.created_at, r.kind, r.amount`,
      [orderIds],
    );
    return found.rows;
  });
}

/** The order's overspend acknowledgment comment, or null (08 Overspend guard). */
async function acknowledgmentOf(orderId: string): Promise<string | null> {
  return withDatabase(async (client) => {
    const found = await client.query<{ comment: string | null }>(
      "select overspend_ack_comment as comment from order_settlements where order_id = $1",
      [orderId],
    );
    return found.rows[0]?.comment ?? null;
  });
}

/** The number of stock movements of a subtype in a branch. */
async function movementsOf(branch: string, variantId: string): Promise<number> {
  return withDatabase(async (client) => {
    const found = await client.query<{ count: number }>(
      "select count(*)::int as count from stock_movements where branch_id = $1 and variant_id = $2",
      [branch, variantId],
    );
    return found.rows[0]!.count;
  });
}

test("S1: three approvals, 520 000 given, bought exactly: all green, the Manager closes, stock +100, cash count 0 (15 S1; 08 Exact match, Closing 1)", async ({
  page,
}) => {
  // A whole scenario through four roles: three times the usual time.
  test.slow();
  const scene = await newScene();
  const order = await notebooks(scene);

  await throughApprovals(page, scene, [order]);
  await financeApproves(page, scene, [order], { [order.id]: "520000" });

  await as(page, scene.manager);
  await recordPurchase(page, order);
  for (const label of ["number", "price", "total"] as const) {
    await expect(labelOf(page, label)).toHaveAttribute("data-colour", "green");
  }

  // The exact match closes from the list, after the sentence of 08 Closing 1.
  await listAt(page, scene, "PURCHASING");
  await tickGroups(page, [order]);
  await page.locator('[data-list-bar] [data-move="CLOSE_EXACT"]').click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.locator("[data-close-confirm]")).toHaveText(m.closeConfirm);
  await dialog.getByRole("button", { name: m.button.CLOSE_EXACT, exact: true }).click();
  await expect(page.getByText("Closed 1 order.")).toBeVisible();
  expect(await statusOf(order.id)).toBe("CLOSED");

  // Stock +100 on the branch's stock page and in the balances; the cash count is 0.
  await page.goto(`/warehouse/stock?branch=${scene.branch.id}`);
  await expect(page.getByRole("row").filter({ hasText: order.product })).toContainText("100");
  expect(await scrollsSideways(page)).toBe(false);
  expect(await stockOf(scene.branch.id, order.variantId)).toBe("100.000");
  expect(await countOf(order.id)).toBe(0);
});

test('S2: bought at 4 500: Total orange "Left 50 000"; Finance records 50 000 returned and closes (15 S2; 08 The three colours, Closing 2 and 3)', async ({
  page,
}) => {
  test.slow();
  const scene = await newScene();
  const order = await notebooks(scene);
  await throughApprovals(page, scene, [order]);
  await financeApproves(page, scene, [order], { [order.id]: "520000" });

  await as(page, scene.manager);
  await recordPurchase(page, order, { price: "4500", comment: "Arzonroq topildi" });
  // 08 Worked example, Cheaper: Number green, Price orange, Total orange "Left 50 000".
  await expect(labelOf(page, "number")).toHaveAttribute("data-colour", "green");
  await expect(labelOf(page, "price")).toHaveAttribute("data-colour", ORANGE);
  const total = labelOf(page, "total");
  await expect(total).toHaveAttribute("data-colour", ORANGE);
  await expect(total).toContainText(en.colourLabel.total.left);
  await expect(total).toContainText(/50\s000/);
  await sendToSettlement(page, scene, [order]);

  // The settlement asks for the count back: Receive 50 000, prefilled (08 Closing 2).
  await openSettle(page, scene, [order]);
  await expect(page.locator(`[data-settle-amount="${order.id}"]`)).toHaveValue("50000");
  expect(await scrollsSideways(page)).toBe(false);
  await saveSettlement(page, 1);
  await closeOnSettle(page);
  await expect(page.getByText("Closed 1 order.")).toBeVisible();

  const returned = (await moneyRowsOf([order.id])).filter((row) => row.kind === "CASH_RETURNED");
  expect(returned.map((row) => row.amount)).toEqual(["50000"]);
  expect(await countOf(order.id)).toBe(0);
  expect(await statusOf(order.id)).toBe("CLOSED");
});

test('S3: bought at 5 200 with 30 000 delivery: Total red "Over 30 000"; Finance pays back 30 000 and closes with no Head step (15 S3; 08 Overspend guard)', async ({
  page,
}) => {
  test.slow();
  const scene = await newScene();
  const order = await notebooks(scene);
  await throughApprovals(page, scene, [order]);
  await financeApproves(page, scene, [order], { [order.id]: "520000" });

  await as(page, scene.manager);
  await recordPurchase(page, order, {
    price: "5200",
    delivery: "30000",
    comment: "Narx va yetkazish qimmatlashdi",
  });
  // 08 Worked example, Dearer: Price red, Total red "Over 30 000".
  await expect(labelOf(page, "number")).toHaveAttribute("data-colour", "green");
  await expect(labelOf(page, "price")).toHaveAttribute("data-colour", "red");
  const total = labelOf(page, "total");
  await expect(total).toHaveAttribute("data-colour", "red");
  await expect(total).toContainText(en.colourLabel.total.over);
  await expect(total).toContainText(/30\s000/);
  await sendToSettlement(page, scene, [order]);

  // 5.8% and 30 000 so'm are under the guard: the Head is offered no acknowledgment.
  await as(page, scene.head);
  await page.goto(`/orders/${order.id}`);
  await expect(page.locator("[data-order-number]")).toBeVisible();
  await expect(page.locator('[data-order-bar] [data-move="ACKNOWLEDGE_OVERSPEND"]')).toHaveCount(0);

  // Finance pays back 30 000, prefilled, and closes with no Head step (08 Closing 2, 3).
  await openSettle(page, scene, [order]);
  await expect(page.locator(`[data-settle-amount="${order.id}"]`)).toHaveValue("30000");
  await expect(page.locator(`[data-settle-order="${order.id}"] [data-overspend]`)).toHaveCount(0);
  await saveSettlement(page, 1);
  await closeOnSettle(page);
  await expect(page.getByText("Closed 1 order.")).toBeVisible();

  const paid = (await moneyRowsOf([order.id])).filter((row) => row.kind === "PAID_BACK");
  expect(paid.map((row) => row.amount)).toEqual(["30000"]);
  expect(await countOf(order.id)).toBe(0);
  expect(await statusOf(order.id)).toBe("CLOSED");
  expect(await acknowledgmentOf(order.id)).toBeNull();
});

test("S13: 520 000 given, nothing bought: settlement asks for 520 000 back; closes with no stock change (15 S13; 07 Order progress; 08 Closing 2)", async ({
  page,
}) => {
  test.slow();
  const scene = await newScene();
  const order = await notebooks(scene);
  await throughApprovals(page, scene, [order]);
  await financeApproves(page, scene, [order], { [order.id]: "520000" });

  // Not bought, with its reason (07 Order progress), then Send to settlement.
  await as(page, scene.manager);
  await page.goto(`/orders/${order.id}`);
  await page.locator('[data-order-bar] [data-move="MARK_NOT_BOUGHT"]').click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("textarea[data-reason]").fill("Yetkazib beruvchida qolmadi");
  await dialog.getByRole("button", { name: m.button.MARK_NOT_BOUGHT, exact: true }).click();
  await expect(page.getByText("Marked 1 order not bought.")).toBeVisible();
  await expect(page.locator('[data-progress="NOT_BOUGHT"]')).toBeVisible();
  await sendToSettlement(page, scene, [order]);

  await openSettle(page, scene, [order]);
  await expect(page.locator(`[data-settle-amount="${order.id}"]`)).toHaveValue("520000");
  await saveSettlement(page, 1);
  await closeOnSettle(page);
  await expect(page.getByText("Closed 1 order.")).toBeVisible();

  const returned = (await moneyRowsOf([order.id])).filter((row) => row.kind === "CASH_RETURNED");
  expect(returned.map((row) => row.amount)).toEqual(["520000"]);
  expect(await countOf(order.id)).toBe(0);
  expect(await statusOf(order.id)).toBe("CLOSED");
  // No stock change: no movement and no balance of the subtype in the branch.
  expect(await stockOf(scene.branch.id, order.variantId)).toBeNull();
  expect(await movementsOf(scene.branch.id, order.variantId)).toBe(0);
});
