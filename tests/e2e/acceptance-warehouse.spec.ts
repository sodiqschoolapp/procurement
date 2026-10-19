import { type Browser, type Page, type TestInfo, test } from "@playwright/test";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import {
  type Person,
  type Planned,
  type Scene,
  as,
  countOf,
  expect,
  financeApproves,
  insertDraft,
  labelOf,
  listAt,
  newPerson,
  newProduct,
  newProductWithSubtypes,
  newScene,
  notebooks,
  numberOf,
  openApprove,
  confirmApprove,
  recordPurchase,
  scrollsSideways,
  signIn,
  statusOf,
  stockIn,
  stockOf,
  submitInGrid,
  tag,
  throughApprovals,
  tickGroups,
  withDatabase,
} from "./acceptance-fixtures";

// Build plan 9.1c: the acceptance scenarios of phases 3 and 5 (16-build-order.md), purchasing and
// warehouse, clicked through as each role (15-quality-and-acceptance.md, Test layers: Full flow).
// Both projects run each one, at 375 px and at 1440 px. Every scenario starts from complete drafts
// and clicks Submit, the approvals and the purchases, with its own branch and people who read
// English (plan of 9.1c, decided item 2; 9.1b decided items 1 to 3). S15 lives in
// direct-entry.spec.ts (decided item 1).

const issue = en.warehouse.issue;

/** Opens a new issue of the page's Manager and fills it up to Save: the department and one line. */
async function readyIssue(
  page: Page,
  info: TestInfo,
  scene: Scene,
  item: Planned,
  qty: string,
): Promise<void> {
  const phone = info.project.name === "phone-375";
  await page.goto("/warehouse/documents/new?type=ISSUE");
  await expect(page.getByRole("heading", { level: 1, name: issue.title })).toBeVisible();
  // Chosen again until it holds: a choice made before the form hydrates is lost. Received by is
  // then prefilled with the department's responsible person (09 Issue 2).
  const department = page.getByLabel(issue.department, { exact: true });
  await expect(async () => {
    await department.selectOption(scene.department);
    await expect(page.getByLabel(issue.receivedBy, { exact: true })).not.toHaveValue("", {
      timeout: 1_000,
    });
  }).toPass();
  if (phone) await page.getByRole("button", { name: issue.next, exact: true }).click();
  await page.getByLabel(issue.search).fill(item.product);
  await page.locator(`[data-pick="${item.variantId}"]`).click();
  const line = page.locator(`[data-issue-line="${item.variantId}"]`);
  await line.getByRole("textbox").fill(qty);
  await expect(line).not.toContainText(issue.moreThanStock);
  expect(await scrollsSideways(page)).toBe(false);
  if (phone) await page.getByRole("button", { name: issue.next, exact: true }).click();
}

/** Saves the ready issue and waits for its number (09 Issue to a department). */
async function saveIssue(page: Page): Promise<void> {
  await page.getByRole("button", { name: issue.save, exact: true }).click();
  await expect(page.locator("[data-issue-saved]")).toBeVisible();
}

/** The branch's stock page shows `qty` for the item (09 Stock screens: Stock on hand). */
async function stockPageShows(page: Page, scene: Scene, text: string, qty: string) {
  await page.goto(`/warehouse/stock?branch=${scene.branch.id}`);
  await expect(page.getByRole("row").filter({ hasText: text })).toContainText(qty);
}

/** A second signed-in page at the project's width (9.1a: newContext takes no project viewport). */
async function otherPage(browser: Browser, info: TestInfo, person: Person) {
  const context = await browser.newContext({ viewport: info.project.use.viewport ?? null });
  const page = await context.newPage();
  await signIn(page, person);
  return { context, page };
}

/** The types of the stock movements of a subtype in a branch, oldest first. */
async function movementTypesOf(branch: string, variantId: string): Promise<string[]> {
  return withDatabase(async (client) => {
    const found = await client.query<{ type: string }>(
      `select type::text as type from stock_movements
        where branch_id = $1 and variant_id = $2 order by created_at, id`,
      [branch, variantId],
    );
    return found.rows.map((row) => row.type);
  });
}

test("S4: in parts, 60 bought, 10 issued, 40 more: stock 60, then 50, then 90; the order stays Open until the last part (15 S4; 07 Order progress; 09 Issue to a department)", async ({
  page,
}, info) => {
  test.slow();
  const scene = await newScene();
  const order = await notebooks(scene);
  await throughApprovals(page, scene, [order]);
  await financeApproves(page, scene, [order], { [order.id]: "520000" });

  // "Monday": 60 with the plan's delivery. A part below the plan asks no comment (07 Comment).
  await as(page, scene.manager);
  await recordPurchase(page, order, { qty: "60", progress: "OPEN" });
  expect(await statusOf(order.id)).toBe("PURCHASING");
  await stockPageShows(page, scene, order.product, "60");
  expect(await stockOf(scene.branch.id, order.variantId)).toBe("60.000");

  // 10 issued to the department: 50, still Open.
  await readyIssue(page, info, scene, order, "10");
  await saveIssue(page);
  await stockPageShows(page, scene, order.product, "50");
  expect(await stockOf(scene.branch.id, order.variantId)).toBe("50.000");
  await page.goto(`/orders/${order.id}`);
  await expect(page.locator('[data-progress="OPEN"]')).toBeVisible();
  expect(await statusOf(order.id)).toBe("PURCHASING");

  // "Friday": Same as planned fills the 40 still lacking and no extra cost a second time.
  await page.locator("[data-record-purchase]").click();
  await page.getByRole("button", { name: en.purchase.form.sameAsPlanned }).click();
  await expect(page.locator(`#purchase-qty-${order.id}`)).toHaveValue("40");
  await expect(page.locator("[data-extra-row]")).toHaveCount(0);
  await recordPurchase(page, order);
  await stockPageShows(page, scene, order.product, "90");
  expect(await stockOf(scene.branch.id, order.variantId)).toBe("90.000");
  expect(await statusOf(order.id)).toBe("PURCHASING");

  // The plan's delivery was paid once: the live extras of the order sum to 20 000; count 0.
  const extras = await withDatabase(async (client) => {
    const found = await client.query<{ sum: string }>(
      `select coalesce(sum(e.amount), 0)::text as sum from purchase_extras e
         join purchases p on p.id = e.purchase_id
        where p.order_id = $1 and not p.is_cancelled`,
      [order.id],
    );
    return found.rows[0]!.sum;
  });
  expect(extras).toBe("20000");
  expect(await countOf(order.id)).toBe(0);
});

test("S8: two Heads approve the same ticked orders, two Managers issue the last 5: one success each, the other a clear message; stock never below 0 (15 S8; 06 rules 7, 8; 09 Issue)", async ({
  page,
  browser,
}, info) => {
  // Six people sign in: twice the slow time.
  test.setTimeout(180_000);
  const scene = await newScene();
  const headA = await newPerson("HEAD", null, "en");
  const headB = await newPerson("HEAD", null, "en");
  const both = [await notebooks(scene), await notebooks(scene)];
  await submitInGrid(page, scene, both);

  // First half. Both Heads stand ready with both orders ticked and Approve open; A, then B.
  await as(page, headA);
  await listAt(page, scene, "PENDING_HEAD");
  const dialogA = await openApprove(page, both);
  const second = await otherPage(browser, info, headB);
  try {
    await listAt(second.page, scene, "PENDING_HEAD");
    const dialogB = await openApprove(second.page, both);
    await confirmApprove(page, dialogA, 2);

    await dialogB.getByRole("button", { name: en.orders.approve.button, exact: true }).click();
    const failed = second.page.locator("[data-approve-failed]");
    await expect(failed).toBeVisible();
    await expect(failed.locator("[data-failed-order]")).toHaveCount(2);
    for (const order of both) {
      const line = failed.locator(`[data-failed-order="${order.id}"]`);
      await expect(line).toContainText(await numberOf(order.id));
      await expect(line).toContainText(`Already approved by ${headA.fullName} at`);
    }
  } finally {
    await second.context.close();
  }

  // Nothing half-saved: each order at the Principal step, version 3 (draft 1, Submit 2, A's
  // Approve 3), one Approve event each, by A; nothing of B (06 rule 8).
  const states = await withDatabase(async (client) => {
    const found = await client.query<{ id: string; status: string; version: number }>(
      "select id, status, version from orders where id = any($1::uuid[]) order by id",
      [both.map((order) => order.id)],
    );
    const events = await client.query<{ order_id: string; actor_id: string }>(
      `select order_id, actor_id from order_events
        where order_id = any($1::uuid[]) and type = 'APPROVE'`,
      [both.map((order) => order.id)],
    );
    const ofB = await client.query<{ n: number }>(
      "select count(*)::int as n from order_actions where actor_id = $1",
      [headB.id],
    );
    return { orders: found.rows, events: events.rows, ofB: ofB.rows[0]!.n };
  });
  for (const row of states.orders) {
    expect(row).toMatchObject({ status: "PENDING_PRINCIPAL", version: 3 });
  }
  expect(states.events.map((event) => event.actor_id)).toEqual([headA.id, headA.id]);
  expect(new Set(states.events.map((event) => event.order_id)).size).toBe(2);
  expect(states.ofB).toBe(0);

  // Second half. The last 5 notebooks of the branch; two Managers of it stand ready with 5.
  const managerB = await newPerson("MANAGER", scene.branch.id, "en");
  const product = `Daftar ${tag()}`;
  const item: Planned = { id: "", product, variantId: await newProduct(product, 5000) };
  await stockIn(scene.branch.id, item.variantId, 5, 5000, scene.head);

  await as(page, scene.manager);
  await readyIssue(page, info, scene, item, "5");
  const third = await otherPage(browser, info, managerB);
  try {
    await readyIssue(third.page, info, scene, item, "5");
    await saveIssue(page);

    // B is refused on the line, with the stock the server found left: 0.
    await third.page.getByRole("button", { name: issue.save, exact: true }).click();
    await expect(third.page.getByText(/^Only 0 .+ left\. Lower the quantity\.$/)).toBeVisible();
    await expect(third.page.locator("[data-issue-saved]")).toHaveCount(0);
  } finally {
    await third.context.close();
  }

  // Stock 0, never below; one issue document holding 5 and one issue movement.
  await stockPageShows(page, scene, item.product, "0");
  expect(await stockOf(scene.branch.id, item.variantId)).toBe("0.000");
  expect(await movementTypesOf(scene.branch.id, item.variantId)).toEqual(["RECEIPT", "ISSUE"]);
  const documents = await withDatabase(async (client) => {
    const found = await client.query<{ qty: string }>(
      `select l.qty::text as qty from stock_documents d
         join stock_document_lines l on l.document_id = d.id
        where d.branch_id = $1 and d.type = 'ISSUE' and l.variant_id = $2`,
      [scene.branch.id, item.variantId],
    );
    return found.rows.map((row) => row.qty);
  });
  expect(documents).toEqual(["5.000"]);
});

test('S10: blue pens ordered, black bought at the same price: stock rises for black, the order shows "Substituted", the Manager cannot close alone (15 S10; 07 Substitution; 08 Exact match)', async ({
  page,
}) => {
  test.slow();
  const scene = await newScene();
  const product = `Ruchka ${tag()}`;
  const [blue, black] = await newProductWithSubtypes(product, 2000, ["Blue", "Black"]);
  const id = await insertDraft(scene.manager, scene.branch.id, blue!, scene.department, 100, 2000);
  const order: Planned = { id, product, variantId: blue! };

  // The Manager's right to close exact matches alone is on (03 Manager rights; as S16 reads it).
  await as(page, scene.head);
  await page.goto(`/users/${scene.manager.id}`);
  const rights = page.locator("section", {
    has: page.getByRole("heading", { name: en.managerRights.title, level: 2 }),
  });
  await expect(
    rights.getByRole("checkbox", { name: en.managerRights.names.CLOSE_ALONE }),
  ).toBeChecked();

  await throughApprovals(page, scene, [order]);
  await financeApproves(page, scene, [order], { [order.id]: "200000" });

  // Same as planned, then Black: the substitution asks its comment (07 Comment).
  await as(page, scene.manager);
  await recordPurchase(page, order, { subtype: black!, comment: "Do'konda ko'k qolmagan" });
  await expect(page.locator("[data-substituted]")).toHaveText(en.orders.substituted);
  // Every other condition of an exact match holds: green labels, Done, cash count 0.
  for (const label of ["number", "price", "total"] as const) {
    await expect(labelOf(page, label)).toHaveAttribute("data-colour", "green");
  }
  expect(await countOf(order.id)).toBe(0);
  await expect(page.locator('[data-order-bar] [data-move="SEND_TO_SETTLEMENT"]')).toBeVisible();
  await expect(page.locator('[data-order-bar] [data-move="CLOSE_EXACT"]')).toHaveCount(0);
  await listAt(page, scene, "PURCHASING");
  await tickGroups(page, [order]);
  const bar = page.locator("[data-list-bar]");
  await expect(bar.locator('[data-move="SEND_TO_SETTLEMENT"]')).toBeVisible();
  await expect(bar.locator('[data-move="CLOSE_EXACT"]')).toHaveCount(0);

  // Stock rises for Black, none for Blue.
  await stockPageShows(page, scene, "Black", "100");
  expect(await scrollsSideways(page)).toBe(false);
  expect(await stockOf(scene.branch.id, black!)).toBe("100.000");
  expect(await stockOf(scene.branch.id, blue!)).toBeNull();
});

test("S11: 100 recorded, 30 issued, the cancel of the record is blocked with the explanation; stock stays 70 (15 S11; 07 Fixing a mistake 2)", async ({
  page,
}, info) => {
  test.slow();
  const scene = await newScene();
  const order = await notebooks(scene);
  await throughApprovals(page, scene, [order]);
  await financeApproves(page, scene, [order], { [order.id]: "520000" });

  await as(page, scene.manager);
  await recordPurchase(page, order);
  await readyIssue(page, info, scene, order, "30");
  await saveIssue(page);
  expect(await stockOf(scene.branch.id, order.variantId)).toBe("70.000");

  // Cancel record on the Purchases tab, with its reason, through the confirmation.
  await page.goto(`/orders/${order.id}`);
  await page.getByRole("link", { name: en.orders.page.tabs.purchases }).click();
  await page.locator('[data-cancel="RECORD"]').click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("textarea[data-reason]").fill("Noto'g'ri yozilgan");
  await dialog
    .getByRole("button", { name: en.orders.page.purchases.cancel.button.RECORD, exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Notifications" })
      .getByText(`${await numberOf(order.id)} — ${en.errors.field.stockShort}`),
  ).toBeVisible();

  // Nothing changed: stock 70, the record live, the order Open, no cancel movement.
  await stockPageShows(page, scene, order.product, "70");
  expect(await stockOf(scene.branch.id, order.variantId)).toBe("70.000");
  expect(await statusOf(order.id)).toBe("PURCHASING");
  expect(await movementTypesOf(scene.branch.id, order.variantId)).toEqual(["RECEIPT", "ISSUE"]);
  const cancelled = await withDatabase(async (client) => {
    const found = await client.query<{ n: number }>(
      "select count(*)::int as n from purchases where order_id = $1 and is_cancelled",
      [order.id],
    );
    return found.rows[0]!.n;
  });
  expect(cancelled).toBe(0);
});
