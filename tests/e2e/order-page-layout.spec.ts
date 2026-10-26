import { type Page, test } from "@playwright/test";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import {
  type Planned,
  as,
  confirmApprove,
  expect,
  financeApproves,
  labelOf,
  listAt,
  newScene,
  notebooks,
  openApprove,
  recordPurchase,
  scrollsSideways,
  statusOf,
  submitInGrid,
  withDatabase,
} from "./acceptance-fixtures";
import { barAction, openMore, orderBar } from "./order-bar";

// Build plan 2.9b, Done when: "the top line of an order Waiting for Principal names the Principal
// and the date; the Plan and actual block shows the planned total only before a purchase and the
// table after; the stepper sits in History; a Playwright test at both widths opens the four
// orders". 11-screens-and-ux.md, Order page layout 1 to 4, rules 6 and 13; 08 The three colours;
// plan of 2.9b, decided items 1 to 5 (Look first) and 7. The order that skipped Finance is opened
// at both widths by acceptance-finance-step.spec.ts, the project that may switch the step off.
// Each project has a scene of its own; every order is the plan of section 8: 100 notebooks ×
// 5 000 in cash plus 20 000 delivery, 520 000.

const o = en.orders;
const DATE = String.raw`\d{2}\.\d{2}\.\d{4}`;

/** The order page's top line (11 Order page layout 1). */
function topLine(page: Page) {
  return page.locator("[data-top-line]");
}

/** The block's planned total alone: no table (11 Order page layout 2; decided item 5). */
async function plannedOnly(page: Page): Promise<void> {
  const block = page.locator("[data-plan-actual]");
  await expect(block.locator('[data-fact="plannedTotal"]')).toContainText(/520\s000/);
  await expect(block.locator("table")).toHaveCount(0);
}

test("2.9b: Waiting for Principal, Open with a difference, Open with only a cancelled record, Not bought, Closed (11 Order page layout 1 to 4)", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const phone = info.project.name === "phone-375";
  const scene = await newScene();
  const atPrincipal = await notebooks(scene);
  const dearer = await notebooks(scene);
  const cancelled = await notebooks(scene);
  const notBought = await notebooks(scene);
  // In card: no cash is given, so buying as planned is an exact match (08 Exact match).
  const closed = await notebooks(scene, "CARD");
  const opened: Planned[] = [dearer, cancelled, notBought, closed];

  await submitInGrid(page, scene, [atPrincipal, ...opened]);
  await as(page, scene.head);
  await listAt(page, scene, "PENDING_HEAD");
  await confirmApprove(page, await openApprove(page, [atPrincipal, ...opened]), 5);

  // (a) Waiting for Principal, seen by its Principal: the top line names the Principal and the
  // date of the Head's approval; the block holds the planned total alone, with no labels before
  // Open; Approve is the main action, Send back and Reject open under "More" (decided item 1).
  await as(page, scene.principal);
  await page.goto(`/orders/${atPrincipal.id}`);
  await expect(topLine(page)).toHaveText(
    new RegExp(`^Waiting for Principal \\(${scene.principal.fullName}\\) since ${DATE}\\.$`),
  );
  await plannedOnly(page);
  await expect(page.locator("[data-plan-actual] [data-colours]")).toHaveCount(0);
  await expect(page.locator("[data-stepper]")).toHaveCount(0);
  const bar = orderBar(page);
  await expect(bar.locator('[data-main-action="APPROVE"]')).toBeVisible();
  const sendBack = bar.getByRole("button", { name: o.moves.button.SEND_BACK, exact: true });
  await expect(sendBack).toBeHidden();
  // "More" by the keyboard (11 rule 13; review correction 3): focused, opened with Enter.
  const more = bar.locator("[data-bar-more]");
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(sendBack).toBeVisible();
  await expect(bar.getByRole("button", { name: o.moves.button.REJECT, exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(sendBack).toBeFocused();
  if (phone) {
    for (const target of [more, sendBack]) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
  expect(await scrollsSideways(page)).toBe(false);
  // The History tab starts with the stepper, standing at the Principal (11 layout 3).
  await page.getByRole("link", { name: o.page.tabs.history }).click();
  await expect(page.locator('[data-stepper] li[data-step="PRINCIPAL"]')).toHaveAttribute(
    "data-state",
    "current",
  );

  // The others go on to Open.
  await listAt(page, scene, "PENDING_PRINCIPAL");
  await confirmApprove(page, await openApprove(page, opened), opened.length);
  await financeApproves(page, scene, opened, {});

  // Open with nothing bought: the planned total and the three grey labels (decided item 5).
  await as(page, scene.manager);
  await page.goto(`/orders/${dearer.id}`);
  await expect(topLine(page)).toHaveText(
    new RegExp(`^Waiting for ${scene.manager.fullName} since ${DATE}\\.$`),
  );
  await plannedOnly(page);
  await expect(labelOf(page, "number")).toHaveAttribute("data-colour", "grey");
  await expect(labelOf(page, "total")).toHaveAttribute("data-colour", "grey");
  await expect(bar.locator('[data-main-action="RECORD_PURCHASE"]')).toBeVisible();

  // (b) Open with a difference: bought at 5 200 each. The table, with the labels above it; no
  // separate planned-total line.
  await recordPurchase(page, dearer, { price: "5200", comment: "Narx oshgan" });
  const block = page.locator("[data-plan-actual]");
  await expect(block.locator('[data-plan-line="total"]')).toContainText(/520\s000/);
  await expect(block.locator('[data-plan-line="total"]')).toContainText(/540\s000/);
  await expect(block.locator('[data-fact="plannedTotal"]')).toHaveCount(0);
  await expect(labelOf(page, "price")).toHaveAttribute("data-colour", "red");
  await expect(labelOf(page, "total")).toContainText(/20\s000/);
  // Done buying with a difference: Send to settlement is the main action, Reopen buying under More.
  await expect(bar.locator('[data-main-action="SEND_TO_SETTLEMENT"]')).toBeVisible();
  await barAction(page, `[data-move="REOPEN_BUYING"]`);
  expect(await scrollsSideways(page)).toBe(false);

  // Open with only a cancelled record: nothing counted is bought, so the planned total and the
  // grey labels, no table (decided item 7; D40).
  await recordPurchase(page, cancelled, { qty: "40", progress: "OPEN" });
  await page.getByRole("link", { name: o.page.tabs.purchases }).click();
  await page.locator('[data-cancel="RECORD"]').click();
  const cancel = page.getByRole("alertdialog");
  await cancel.locator("textarea[data-reason]").fill("Noto'g'ri yozilgan");
  await cancel
    .getByRole("button", { name: o.page.purchases.cancel.button.RECORD, exact: true })
    .click();
  await expect(page.locator("[data-cancelled]")).toHaveCount(1);
  await page.goto(`/orders/${cancelled.id}`);
  await plannedOnly(page);
  await expect(labelOf(page, "total")).toHaveAttribute("data-colour", "grey");

  // A finished Not bought order with nothing received: its labels say "Bought fewer" and "Left …"
  // over the planned total; nothing bought, so no table (decided item 5).
  await page.goto(`/orders/${notBought.id}`);
  await (await barAction(page, '[data-move="MARK_NOT_BOUGHT"]')).click();
  const mark = page.getByRole("alertdialog");
  await mark.locator("textarea[data-reason]").fill("Do'konda yo'q");
  await mark.getByRole("button", { name: o.moves.button.MARK_NOT_BOUGHT, exact: true }).click();
  await expect(page.locator('[data-progress="NOT_BOUGHT"]')).toBeVisible();
  await plannedOnly(page);
  await expect(labelOf(page, "number")).toHaveAttribute("data-colour", "amber");
  await expect(labelOf(page, "total")).toContainText(/Left\s*520\s000/);

  // (d) Closed: bought as planned, closed by its main action; then "Finished on" and Copy as new.
  await recordPurchase(page, closed);
  await expect(bar.locator('[data-main-action="CLOSE_EXACT"]')).toBeVisible();
  await bar.locator('[data-move="CLOSE_EXACT"]').click();
  const close = page.getByRole("alertdialog");
  await close.getByRole("button", { name: o.moves.button.CLOSE_EXACT, exact: true }).click();
  await expect.poll(() => statusOf(closed.id)).toBe("CLOSED");
  await page.goto(`/orders/${closed.id}`);
  await expect(topLine(page)).toHaveText(
    new RegExp(`^Finished on ${DATE}\\. Nobody acts on it\\.$`),
  );
  await expect(bar.locator('[data-main-action="COPY"]')).toBeVisible();
  await expect(bar.locator("[data-bar-more]")).toHaveCount(0);
  await page.getByRole("link", { name: o.page.tabs.history }).click();
  await expect(page.locator('[data-stepper] li[data-step="CLOSED"]')).toHaveAttribute(
    "data-state",
    "done",
  );
  expect(await scrollsSideways(page)).toBe(false);

  // The Head on the Closed order: Copy as new first, Reopen under "More" (decided item 1).
  await as(page, scene.head);
  await page.goto(`/orders/${closed.id}`);
  await expect(bar.locator('[data-main-action="COPY"]')).toBeVisible();
  await openMore(page);
  await expect(bar.locator('[data-move="REOPEN"]')).toBeVisible();

  // No active Principal: "none is assigned", still with the date (decided item 3).
  await withDatabase(async (client) => {
    // user_branches follows through its key (ON UPDATE CASCADE).
    await client.query("update users set is_active = false where id = $1", [scene.principal.id]);
  });
  await page.goto(`/orders/${atPrincipal.id}`);
  await expect(topLine(page)).toHaveText(
    new RegExp(
      `^Waiting for the Principal of ${scene.branch.code} since ${DATE}; none is assigned\\.$`,
    ),
  );
  // The Head has no move at Waiting for Principal but Cancel and Copy: no main action.
  await expect(bar.locator("[data-main-action]")).toHaveCount(0);
});
