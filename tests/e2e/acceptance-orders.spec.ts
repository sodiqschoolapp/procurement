import { readFile } from "node:fs/promises";

import { type Locator, type Page, expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { pdfPages } from "../helpers/pdf-text";
import {
  branchId,
  insertDraft,
  newBranch,
  newDepartment,
  newManager,
  newProduct,
  scrollsSideways,
  signIn,
  tag,
  withDatabase,
} from "./acceptance-fixtures";
import { E2E_ROLES } from "./global-setup";
import { shownAmount } from "./shown-amount";

// Build plan 9.1a: the acceptance scenarios of phase 2 (16-build-order.md) that had no browser
// test, clicked through as each role (15-quality-and-acceptance.md, Test layers: Full flow). Both
// projects run each one, at 375 px and at 1440 px. S5, S6 and S7 live in send-back.spec.ts,
// copy-as-new.spec.ts and branch-wall.spec.ts. The e2e database is kept between runs and CI
// retries a failed test, so every attempt writes its own invented branch, people and products
// (plan of 9.1a, review must-fixes 2 and 3): nothing of another project or attempt reaches a
// group row, a counter or a filtered week here.

const NBSP = " ";

const t = uz.orders;

/** The draft row of a product in the grid: the product sits in an input, so found by its tick. */
function tickOf(page: Page, product: string): Locator {
  return page.getByRole("checkbox", { name: t.tickRow.replace("{product}", product) });
}

/** Submit (N) of the ticked drafts, and its confirmation opened (11 rule 6). */
async function openSubmit(page: Page, count: number): Promise<Locator> {
  await page
    .getByRole("button", { name: t.submit.button.replace("{count}", String(count)) })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  return dialog.getByRole("button", { name: t.submit.confirm, exact: true });
}

/** The group row of a product in the order list (05 Group rows 1). */
function groupOf(page: Page, product: string): Locator {
  return page.locator("tbody[data-group]").filter({ hasText: product });
}

/** Ticks a product's group row and approves every order in it through the confirmation. */
async function approveGroup(page: Page, product: string, count: number): Promise<void> {
  await groupOf(page, product)
    .getByRole("checkbox", { name: t.list.tickGroup.replace("{product}", product) })
    .check();
  await page
    .locator("[data-list-bar]")
    .getByRole("button", {
      name: count > 1 ? t.approve.buttonCount.replace("{count}", String(count)) : t.approve.button,
      exact: true,
    })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: t.approve.button, exact: true })
    .click();
  // D38: the approval succeeded before anything else is read.
  await expect(page.getByText(`${count} ta buyurtma tasdiqlandi.`)).toBeVisible();
}

/** The quantity and the order count a group row shows. */
async function expectGroup(page: Page, product: string, quantity: string, count: number) {
  const row = groupOf(page, product).locator("tr").first();
  await expect(row.locator("td").nth(3)).toContainText(quantity);
  await expect(row).toContainText(t.list.orderCount.replace("{count}", String(count)));
}

/** The person's orders of the subtype as stored, oldest first. */
async function ordersOf(ownerId: string, variantId: string) {
  return withDatabase(async (client) => {
    const found = await client.query<{
      id: string;
      number: string | null;
      status: string;
      department_id: string;
      qty: string;
    }>(
      `select id, number, status, department_id, planned_qty::text as qty from orders
        where owner_id = $1 and variant_id = $2 order by created_at, id`,
      [ownerId, variantId],
    );
    return found.rows;
  });
}

test("S14: two Managers submit two orders each at the same moment; numbers 0001 to 0004, no duplicate, no gap (15 S14; 05 Order number)", async ({
  page,
  browser,
}, info) => {
  // A whole scenario through several roles: three times the usual time.
  test.slow();
  // The counter's lock is proven by the same-moment database test of submit.db.test.ts ("S14",
  // commitWhileWaiting), where the clock is fixed in 2027 and the new year starts at 0001. The
  // browser cannot set the app's clock (plan of 9.1a, decided 3); this test clicks the scenario
  // through and asserts its end: four numbers, no duplicate and no gap (review correction 3).
  const branch = await newBranch();
  const department = await newDepartment(branch.id, `Bo'lim ${tag()}`);
  const first = await newManager(branch.id);
  const second = await newManager(branch.id);
  const run = tag();
  const pens = `Ruchka ${run}`;
  const paper = `Qog'oz ${run}`;
  const pensId = await newProduct(pens, 5000);
  const paperId = await newProduct(paper, 2000);
  for (const owner of [first, second]) {
    await insertDraft(owner, branch.id, pensId, department, 10, 5000);
    await insertDraft(owner, branch.id, paperId, department, 5, 2000);
  }

  // The second Manager in a context of their own, at the project's width.
  const other = await browser.newContext({ viewport: info.project.use.viewport ?? null });
  const otherPage = await other.newPage();
  try {
    const confirms: Locator[] = [];
    for (const [on, owner] of [
      [page, first],
      [otherPage, second],
    ] as const) {
      await signIn(on, owner);
      await on.goto("/orders");
      for (const product of [pens, paper]) await tickOf(on, product).check();
      confirms.push(await openSubmit(on, 2));
    }
    // Both press Confirm together.
    await Promise.all(confirms.map((confirm) => confirm.click()));
    for (const on of [page, otherPage]) {
      await expect(on.getByText(/2 ta buyurtma yuborildi:/)).toBeVisible();
      expect(await scrollsSideways(on)).toBe(false);
    }
  } finally {
    await other.close();
  }

  const year = await withDatabase(async (client) => {
    const found = await client.query<{ yy: string }>(
      "select to_char(now() at time zone 'Asia/Tashkent', 'YY') as yy",
    );
    return found.rows[0]!.yy;
  });
  const numbers: string[] = [];
  for (const owner of [first, second]) {
    for (const variantId of [pensId, paperId]) {
      const [order] = await ordersOf(owner.id, variantId);
      expect(order).toMatchObject({ status: "PENDING_HEAD" });
      numbers.push(order!.number!);
    }
  }
  expect([...numbers].sort()).toEqual(
    ["0001", "0002", "0003", "0004"].map((serial) => `${branch.code}-${year}-${serial}`),
  );
});

test("S17: the list filtered to one week downloads as Excel and PDF with exactly its orders, the Head's name and time, empty Principal and Finance, and the screen's totals (15 S17; 05 Download)", async ({
  page,
}, info) => {
  // A whole scenario through several roles: three times the usual time.
  test.slow();
  const e = en.orders;
  const branch = await newBranch();
  const department = await newDepartment(branch.id, `Bo'lim ${tag()}`);
  const manager = await newManager(branch.id, "en");
  const run = tag();
  // In the week 12–18.10.2026: A (approved below by the Head) and B (bank transfer, 3 × 100 000);
  // outside it: C; in it but never submitted, so never listed: the Draft D (05 Download 1:
  // "exactly the filtered orders"). Each its own product, so each is found by its own tick. The
  // drafts are written with their creation day; the Manager submits A, B and C in the grid, so
  // every history event the files read is an action's own (05 Download 3).
  const plan = {
    A: { at: "2026-10-13T05:00:00Z", qty: 100, price: 5000, pay: "CASH" },
    B: { at: "2026-10-14T05:00:00Z", qty: 3, price: 100_000, pay: "TRANSFER" },
    C: { at: "2026-10-05T05:00:00Z", qty: 7, price: 5000, pay: "CASH" },
    D: { at: "2026-10-15T05:00:00Z", qty: 9, price: 5000, pay: "CASH" },
  } as const;
  const keys = ["A", "B", "C", "D"] as const;
  const product = (key: (typeof keys)[number]) => `Daftar ${run} ${key}`;
  const scene = {} as Record<(typeof keys)[number], { id: string }>;
  for (const key of keys) {
    const variantId = await newProduct(product(key), plan[key].price);
    const row = plan[key];
    scene[key] = await withDatabase(async (client) => {
      const made = await client.query<{ id: string }>(
        `insert into orders (branch_id, owner_id, created_by, variant_id, department_id, needed_by,
                             planned_qty, planned_price, payment_type, created_at, updated_at)
         values ($1, $2, $2, $3, $4, '2031-05-01', $5, $6, $7, $8, $8) returning id`,
        [branch.id, manager.id, variantId, department, row.qty, row.price, row.pay, row.at],
      );
      return { id: made.rows[0]!.id };
    });
  }
  await signIn(page, manager);
  await page.goto("/orders");
  for (const key of ["A", "B", "C"] as const) {
    await page
      .getByRole("checkbox", { name: e.tickRow.replace("{product}", product(key)) })
      .check();
  }
  await page.getByRole("button", { name: e.submit.button.replace("{count}", "3") }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: e.submit.confirm, exact: true })
    .click();
  await expect(page.getByText(/Submitted 3 orders:/)).toBeVisible();
  await page.context().clearCookies();
  const numbers = await withDatabase(async (client) => {
    const found = await client.query<{ id: string; number: string | null }>(
      "select id, number from orders where owner_id = $1",
      [manager.id],
    );
    return new Map(found.rows.map((row) => [row.id, row.number]));
  });
  const number = (key: (typeof keys)[number]) => numbers.get(scene[key].id) ?? null;
  for (const key of ["A", "B", "C"] as const) expect(number(key)).not.toBeNull();
  expect(number("D")).toBeNull();

  // The Head approves A on its page, so the event the files read is the action's own (05 Download 3).
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto(`/orders/${scene.A.id}`);
  await page
    .locator("[data-order-bar]")
    .getByRole("button", { name: t.approve.button, exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: t.approve.button, exact: true })
    .click();
  await expect(page.getByText("1 ta buyurtma tasdiqlandi.")).toBeVisible();
  await page.context().clearCookies();
  const headAt = await withDatabase(async (client) => {
    const found = await client.query<{ at: string }>(
      `select to_char(created_at at time zone 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as at
         from order_events where order_id = $1 and to_status = 'PENDING_PRINCIPAL'`,
      [scene.A.id],
    );
    expect(found.rows).toHaveLength(1);
    return found.rows[0]!.at;
  });

  // The Manager filters the list to one week by the dates typed as they are shown.
  await signIn(page, manager);
  await page.goto("/orders");
  if (info.project.name === "phone-375") {
    await page.getByRole("button", { name: e.list.filters.open, exact: true }).click();
  } else {
    // The dates stand behind "More filters" on a desktop (redesign of 21.10.2026).
    await page.getByRole("button", { name: e.list.filters.more, exact: true }).click();
  }
  await page.getByLabel(e.list.filters.from, { exact: true }).fill("12.10.2026");
  await page.getByLabel(e.list.filters.from, { exact: true }).press("Enter");
  await expect(page).toHaveURL(/from=2026-10-12/);
  await page.getByLabel(e.list.filters.to, { exact: true }).fill("18.10.2026");
  await page.getByLabel(e.list.filters.to, { exact: true }).press("Enter");
  await expect(page).toHaveURL(/to=2026-10-18/);
  // A and B in their two groups (Waiting for Principal, Waiting for Head); C is outside the week.
  await expect(page.locator("tbody[data-group]")).toHaveCount(2);

  // The screen's total: every listed order ticked.
  for (const key of ["A", "B"] as const) {
    await page
      .getByRole("checkbox", { name: e.list.tickGroup.replace("{product}", product(key)) })
      .check();
  }
  const shown = await page.locator('[data-list-bar] [data-total="grand"]').first().innerText();
  const grand = BigInt(shown.replace(/\D/g, ""));
  // A 100 × 5 000 and B 3 × 100 000: 800 000 so'm.
  expect(grand).toBe(800_000n);
  expect(await scrollsSideways(page)).toBe(false);

  const [excel] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: e.download.excel }).click(),
  ]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await excel.path());
  const sheet = workbook.worksheets[0]!;
  const titles = (sheet.getRow(1).values as unknown[]).slice(1).map(String);
  const rows: Record<string, unknown>[] = [];
  const totals = new Map<string, number>();
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const values = (row.values as unknown[]).slice(1);
    if (typeof values[0] === "string" && values[0]) {
      rows.push(Object.fromEntries(titles.map((title, at) => [title, values[at] ?? null])));
    } else if (typeof values[11] === "string" && typeof values[12] === "number") {
      totals.set(values[11], values[12]);
    }
  });
  const c = e.download.columns;
  expect(rows.map((row) => row[c.number]).sort()).toEqual([number("A"), number("B")].sort());
  // Nothing of C (another week) or of the Draft D in any cell, numbered or not.
  const cells: string[] = [];
  sheet.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value))));
  for (const key of ["C", "D"] as const) {
    expect(cells.filter((cell) => cell.includes(product(key)))).toEqual([]);
  }
  const a = rows.find((row) => row[c.number] === number("A"))!;
  expect(a[c.status]).toBe(en.requestStatus.PENDING_PRINCIPAL);
  expect(a["Procurement Head"]).toBe(E2E_ROLES.HEAD.fullName);
  expect(a["Procurement Head, time"]).toBe(headAt);
  expect(a.Principal).toBeNull();
  expect(a["Principal, time"]).toBeNull();
  expect(a.Finance).toBeNull();
  expect(a["Finance, time"]).toBeNull();
  expect(BigInt(totals.get("Grand total")!)).toBe(grand);

  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: e.download.pdf }).click(),
  ]);
  const text = (await pdfPages(new Uint8Array(await readFile(await pdf.path()))))
    .join(" ")
    .replaceAll(NBSP, " ");
  expect(text).toContain(number("A")!);
  expect(text).toContain(number("B")!);
  expect(text).not.toContain(number("C")!);
  expect(text).not.toContain(product("C"));
  expect(text).not.toContain(product("D"));
  expect(text).toContain(E2E_ROLES.HEAD.fullName);
  expect(text).toContain(headAt);
  expect(text).toContain("800 000 so'm");
});

test("S18: the Head changes the price from 5 000 to 6 500; a new draft suggests 6 500, the older keeps 5 000 at -23% vs catalog price, and the history lists both (15 S18; 04 rule 4; 05 Price hint)", async ({
  page,
}) => {
  const branch = await branchId("EA");
  const manager = await newManager(branch);
  const run = tag();
  const notebook = `Daftar ${run}`;
  const science = `Fizika ${run}`;
  const music = `Musiqa ${run}`;
  const variantId = await newProduct(notebook, 5000);
  await newDepartment(branch, science);
  await newDepartment(branch, music);

  const addDraft = async (department: string, quantity: string) => {
    const form = page.getByRole("form", { name: t.add.title });
    const picker = form.getByRole("combobox", { name: t.columns.product });
    const option = page.getByRole("option", { name: new RegExp(notebook) });
    // Typed again until the hit shows: text typed before hydration is not seen by the picker.
    await expect(async () => {
      await picker.fill(notebook);
      await expect(option).toBeVisible({ timeout: 2000 });
    }).toPass();
    await option.click();
    await form.getByLabel(t.columns.requestedBy).selectOption({ label: department });
    await form.getByLabel(t.columns.quantity).fill(quantity);
    await form.getByRole("button", { name: t.add.button }).click();
  };
  const draftRow = async (department: string) => {
    const id = await withDatabase(async (client) => {
      const found = await client.query<{ id: string }>(
        `select o.id from orders o join departments d on d.id = o.department_id
          where o.owner_id = $1 and o.status = 'DRAFT' and d.name = $2`,
        [manager.id, department],
      );
      return found.rows[0]?.id ?? null;
    });
    expect(id).not.toBeNull();
    return page.locator(`tbody tr[data-draft="${id}"]`);
  };

  // The older draft, at the catalog price of the time.
  await signIn(page, manager);
  await page.goto("/orders");
  await addDraft(science, "100");
  await expect.poll(async () => (await ordersOf(manager.id, variantId)).length).toBe(1);
  const older = await draftRow(science);
  await expect(older.getByLabel(t.columns.price)).toHaveValue(shownAmount("5000"));
  await page.context().clearCookies();

  // The Head adds the new price with a note (04 rule 4).
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto(`/prices/${variantId}`);
  await page.getByLabel(uz.prices.price).fill("6 500");
  await page.getByLabel(uz.prices.note).fill("Yetkazib beruvchi narxni oshirdi");
  await page.getByLabel(uz.prices.note).press("Enter");
  await expect(page.getByText(uz.prices.saved).first()).toBeVisible();
  await page.context().clearCookies();

  // A new draft suggests 6 500; the older keeps 5 000 and shows -23% vs catalog price.
  await signIn(page, manager);
  await page.goto("/orders");
  await addDraft(music, "10");
  await expect.poll(async () => (await ordersOf(manager.id, variantId)).length).toBe(2);
  const fresh = await draftRow(music);
  await expect(fresh.getByLabel(t.columns.price)).toHaveValue(shownAmount("6500"));
  await expect(older.getByLabel(t.columns.price)).toHaveValue(shownAmount("5000"));
  await expect(older.locator('[data-cell="price-hint"]')).toHaveText(
    new RegExp(`^${t.priceHint.split("{")[0]}[-−]23%$`),
  );
  expect(await scrollsSideways(page)).toBe(false);
  await page.context().clearCookies();

  // The price history lists both, the new one first.
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto(`/prices/${variantId}`);
  const history = page.locator("section", {
    has: page.getByRole("heading", { name: uz.prices.historyTitle }),
  });
  const rows = history.getByRole("row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText(/6\s500/);
  await expect(rows.nth(2)).toContainText(/5\s000/);
});

test("S19: three orders of 10 Tata pens: the Head sees one row of 20, the Principal 20 and then one row of 30 holding three; approving it moves all three, each with its own number and history; 10 more on a draft raise it to 20 (15 S19; 05 Group rows 1, 4; Drafts 2)", async ({
  page,
}) => {
  // A whole scenario through several roles: three times the usual time.
  test.slow();
  const branch = await branchId("EA");
  const manager = await newManager(branch);
  const run = tag();
  const pens = `Tata ruchka ${run}`;
  const variantId = await newProduct(pens, 5000);
  const science = `Fizika ${run}`;
  const music = `Musiqa ${run}`;
  const scienceId = await newDepartment(branch, science);
  await newDepartment(branch, music);

  /** The Manager submits one draft of 10 pens for the science department. */
  const submitTen = async () => {
    await insertDraft(manager, branch, variantId, scienceId, 10, 5000);
    await signIn(page, manager);
    await page.goto("/orders");
    await tickOf(page, pens).check();
    await (await openSubmit(page, 1)).click();
    await expect(page.getByText(/1 ta buyurtma yuborildi:/)).toBeVisible();
    await page.context().clearCookies();
  };

  await submitTen();
  await submitTen();

  // The Head sees one row "Tata pens, 20" holding the two orders, and approves it.
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto(`/orders?status=PENDING_HEAD&owner=${manager.id}`);
  await expectGroup(page, pens, "20", 2);
  expect(await scrollsSideways(page)).toBe(false);
  await approveGroup(page, pens, 2);
  await page.context().clearCookies();

  // The Principal sees 20.
  await signIn(page, E2E_ROLES.PRINCIPAL);
  await page.goto(`/orders?status=PENDING_PRINCIPAL&owner=${manager.id}`);
  await expectGroup(page, pens, "20", 2);
  await page.context().clearCookies();

  // The last 10, approved by the Head.
  await submitTen();
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto(`/orders?status=PENDING_HEAD&owner=${manager.id}`);
  await expectGroup(page, pens, "10", 1);
  await approveGroup(page, pens, 1);
  await page.context().clearCookies();

  // The Principal now sees one row "Tata pens, 30" holding three orders; approving it moves all.
  await signIn(page, E2E_ROLES.PRINCIPAL);
  await page.goto(`/orders?status=PENDING_PRINCIPAL&owner=${manager.id}`);
  await expectGroup(page, pens, "30", 3);
  expect(await scrollsSideways(page)).toBe(false);
  await approveGroup(page, pens, 3);

  const orders = await ordersOf(manager.id, variantId);
  expect(orders).toHaveLength(3);
  expect(new Set(orders.map((order) => order.number)).size).toBe(3);
  for (const order of orders) {
    expect(order).toMatchObject({ status: "PENDING_FINANCE", qty: "10.000" });
    // Each keeps its own history: submit, the Head's approval and the Principal's, its own rows.
    const moves = await withDatabase(async (client) => {
      const found = await client.query<{ to_status: string }>(
        "select to_status from order_events where order_id = $1 order by created_at",
        [order.id],
      );
      return found.rows.map((row) => row.to_status);
    });
    expect(moves).toEqual(["PENDING_HEAD", "PENDING_PRINCIPAL", "PENDING_FINANCE"]);
    await page.goto(`/orders/${order.id}`);
    await expect(page.locator("[data-order-number]")).toHaveText(order.number!);
    await expect(page.locator('li[data-step="FINANCE"]')).toHaveAttribute("data-state", "current");
  }
  await page.context().clearCookies();

  // 05 Drafts 2, on a draft that is none of the three: 10 more for the same department raise it.
  await signIn(page, manager);
  await page.goto("/orders");
  const form = page.getByRole("form", { name: t.add.title });
  for (const quantity of ["10", "10"]) {
    const option = page.getByRole("option", { name: new RegExp(pens) });
    await expect(async () => {
      await form.getByRole("combobox", { name: t.columns.product }).fill(pens);
      await expect(option).toBeVisible({ timeout: 2000 });
    }).toPass();
    await option.click();
    await form.getByLabel(t.columns.requestedBy).selectOption({ label: music });
    await form.getByLabel(t.columns.quantity).fill(quantity);
    await form.getByRole("button", { name: t.add.button }).click();
    await expect.poll(async () => (await ordersOf(manager.id, variantId)).length).toBe(4);
  }
  await expect(page.getByText(t.add.merged.replace("{quantity}", "20"))).toBeVisible();
  const draftsNow = async () =>
    (await ordersOf(manager.id, variantId))
      .filter((order) => order.status === "DRAFT")
      .map((order) => order.qty);
  await expect.poll(draftsNow).toEqual(["20.000"]);
  await expect(tickOf(page, pens)).toHaveCount(1);
});

test("S23: the order sheet: three rows typed, the department and date copied from the row above, the pens Urgent under More; Submit with nothing ticked sends two, the markers without a price and a sent-back order stay; priced, the markers go with the next number (15 S23; 05 Drafts 4, 6; 11 Order list layout 3)", async ({
  page,
}) => {
  const branch = await newBranch();
  const manager = await newManager(branch.id);
  const run = tag();
  const notebooks = `Daftar ${run}`;
  const pens = `Ruchka ${run}`;
  const markers = `Marker ${run}`;
  const paper = `Qogʻoz ${run}`;
  const maths = `Matematika ${run}`;
  await newProduct(notebooks, 5000);
  await newProduct(pens, 2000);
  // The markers have no price to suggest (05 field 11: "else empty").
  await newProduct(markers, null);
  const paperId = await newProduct(paper, 1000);
  const mathsId = await newDepartment(branch.id, maths);
  // An order the Principal sent back to this Manager stands in the sheet (05 Drafts 5).
  const sentBack = await insertDraft(manager, branch.id, paperId, mathsId, 3, 1000);
  await withDatabase((client) =>
    client.query(
      `update orders set status = 'RETURNED', number = $2, submitted_at = now(), planned_total = 3000
        where id = $1`,
      [sentBack, `${branch.code}-25-0091`],
    ),
  );

  await signIn(page, manager);
  await page.goto("/orders");
  const form = page.getByRole("form", { name: t.add.title });
  const add = async (product: string, quantity: string) => {
    const picker = form.getByRole("combobox", { name: t.columns.product });
    const option = page.getByRole("option", { name: new RegExp(product) });
    // Typed again until the hit shows: text typed before hydration is not seen by the picker.
    await expect(async () => {
      await picker.fill(product);
      await expect(option).toBeVisible({ timeout: 2000 });
    }).toPass();
    await option.click();
    await form.getByLabel(t.columns.quantity).fill(quantity);
    await form.getByRole("button", { name: t.add.button }).click();
    await expect(tickOf(page, product)).toBeVisible();
  };

  // The first row: 100 notebooks for Maths, needed by 05.11.
  await form.getByLabel(t.columns.requestedBy).selectOption({ label: maths });
  await form.getByLabel(t.columns.neededBy).fill("05.11.2031");
  await add(notebooks, "100");
  // The pens row comes with Maths and 05.11 already filled (05 Drafts 6).
  await expect(form.getByLabel(t.columns.requestedBy)).toHaveValue(mathsId);
  await expect(form.getByLabel(t.columns.neededBy)).toHaveValue("05.11.2031");
  await add(pens, "20");
  await add(markers, "5");

  // No row shows a branch cell: the Manager has one branch (11 Order list layout 3).
  await expect(page.locator('td[data-col="branch"]')).toHaveCount(0);

  // The pens get "Urgent" under "More".
  const pensRow = page.locator("tr[data-draft]").filter({ has: tickOf(page, pens) });
  await pensRow.getByRole("button", { name: t.more.label.replace("{product}", pens) }).click();
  const pensMore = page.locator(`tr[data-more-of="${await pensRow.getAttribute("data-draft")}"]`);
  await pensMore.getByLabel(t.columns.priority).selectOption("URGENT");
  const reason = pensMore.getByLabel(t.columns.urgentReason);
  await reason.fill("Imtihon dushanba kuni");
  await reason.press("Enter");
  await expect
    .poll(() => ordersNamed(manager.id, pens).then((found) => found[0]?.priority))
    .toBe("URGENT");

  // The markers' price cell is marked before anything is sent.
  const markersRow = page.locator("tr[data-draft]").filter({ has: tickOf(page, markers) });
  await expect(markersRow.locator('[data-col="price"]')).toContainText(uz.errors.field.required);

  // Submit with nothing ticked: two go, two stay (the markers and the sent-back order).
  await page.getByRole("button", { name: t.submit.readyButton.replace("{count}", "2") }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: t.submit.confirm, exact: true }).click();
  // The dialog stays, pending, until the answer (11 rule 4); the rows sent leave the sheet.
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(tickOf(page, notebooks)).toHaveCount(0);
  await expect(tickOf(page, pens)).toHaveCount(0);

  const numberOf = async (product: string) => (await ordersNamed(manager.id, product))[0]!;
  const first = await numberOf(notebooks);
  const second = await numberOf(pens);
  expect(first.number).toMatch(new RegExp(`^${branch.code}-\\d\\d-0001$`));
  expect(second.number).toMatch(new RegExp(`^${branch.code}-\\d\\d-0002$`));
  expect(second.status).toBe("PENDING_HEAD");
  expect((await numberOf(markers)).number).toBeNull();
  expect(await statusOfOrder(sentBack)).toBe("RETURNED");
  // The markers stay in the sheet, their price cell marked and named in the list on top.
  const top = page.getByRole("alert").filter({ hasText: markers });
  await expect(top).toContainText(t.columns.price);
  await expect(markersRow.locator('[data-col="price"]')).toContainText(uz.errors.field.required);
  await expect(tickOf(page, paper)).toBeVisible();

  // Once the price is typed, Submit (no reload in between) sends it with the next number.
  const price = markersRow.getByLabel(t.columns.price);
  await price.fill("3 000");
  await price.press("Tab");
  await expect.poll(() => numberOf(markers).then((found) => found.price)).toBe("3000");
  await page.getByRole("button", { name: t.submit.readyButton.replace("{count}", "1") }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: t.submit.confirm, exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect
    .poll(() => numberOf(markers).then((found) => found.number))
    .toMatch(new RegExp(`^${branch.code}-\\d\\d-0003$`));
  expect(await statusOfOrder(sentBack)).toBe("RETURNED");
  expect(await scrollsSideways(page)).toBe(false);
});

/** The orders of an owner of a product, oldest first. */
async function ordersNamed(ownerId: string, product: string) {
  return withDatabase(async (client) => {
    const found = await client.query<{
      number: string | null;
      status: string;
      priority: string;
      price: string | null;
    }>(
      `select o.number, o.status, o.priority, o.planned_price::text as price from orders o
         join product_variants v on v.id = o.variant_id join products p on p.id = v.product_id
        where o.owner_id = $1 and p.name = $2 order by o.created_at`,
      [ownerId, product],
    );
    return found.rows;
  });
}

async function statusOfOrder(id: string) {
  return withDatabase(async (client) => {
    const found = await client.query<{ status: string }>(
      "select status from orders where id = $1",
      [id],
    );
    return found.rows[0]!.status;
  });
}
