import AxeBuilder from "@axe-core/playwright";
import { type Locator, type Page, test } from "@playwright/test";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import {
  type Person,
  type Planned,
  type Scene,
  countOf,
  expect,
  groupOf,
  labelOf,
  newScene,
  notebooks,
  statusOf,
  stockOf,
} from "./acceptance-fixtures";

// Build plan 9.1d, Done when: "S1 passes with the keyboard only" (15-quality-and-acceptance.md S1;
// 11-screens-and-ux.md rule 13, "Everything works with the keyboard"). The same scenario as
// acceptance-money.spec.ts's S1, at both widths, but every step is a key: Tab and Shift+Tab to
// reach a control, Enter or Space to press it, typing to fill it. A locator only asserts where the
// focus is or what the page shows; nothing is clicked or filled through one (plan of 9.1d,
// decided item 8: the branch, people, product, department and the complete draft come from the
// fixtures, as 9.1b's S1 starts). Each dialog and step the walk opens is checked by axe, serious
// and critical failing (plan review, must-fix 2).

const o = en.orders;
const m = en.orders.moves;

/** Tab (or Shift+Tab) until the control has the focus; 300 presses is a control out of reach. */
async function tabTo(page: Page, control: Locator, back = false): Promise<void> {
  await expect(control).toBeVisible();
  for (let press = 0; press < 300; press += 1) {
    if (await control.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
  }
  throw new Error(`Tab never reached ${control.toString()}`);
}

async function noSeriousFinding(page: Page, step: string): Promise<void> {
  // A dialog fades and scales in: axe reads colours mid-way and finds low contrast. Wait until
  // every finite animation and transition of the page has ended.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = result.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      rule: violation.id,
      elements: violation.nodes.map((node) => node.target.join(" ")),
    }));
  expect(serious, `axe at ${step}`).toEqual([]);
}

/** Signs in through the form with the keyboard. */
async function signInByKeys(page: Page, person: Person): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await tabTo(page, page.locator("#username"));
  await page.keyboard.type(person.username);
  await page.keyboard.press("Tab");
  await expect(page.locator("#password")).toBeFocused();
  await page.keyboard.type(person.password);
  // Enter again from the password field until the home page opens: on a loaded `next dev` server
  // a first Enter can come before the form has hydrated.
  await expect(async () => {
    if (new URL(page.url()).pathname === "/login") {
      await tabTo(page, page.locator("#password"));
      await page.keyboard.press("Enter");
    }
    await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
  }).toPass();
}

/** The list of the owner's orders at one status, as an address typed in. */
async function listAt(page: Page, scene: Scene, status: string): Promise<void> {
  await page.goto(`/orders?status=${status}&owner=${scene.manager.id}`);
  await page.waitForLoadState("networkidle");
}

/** Ticks the order's group row with Space. */
async function tickByKeys(page: Page, order: Planned): Promise<void> {
  const box = groupOf(page, order.product).getByRole("checkbox", {
    name: o.list.tickGroup.replace("{product}", order.product),
  });
  await tabTo(page, box);
  await page.keyboard.press("Space");
  await expect(box).toBeChecked();
}

/** An approver ticks the order, opens Approve and confirms it, all by keys. */
async function approveByKeys(page: Page, scene: Scene, order: Planned, status: string) {
  await listAt(page, scene, status);
  await tickByKeys(page, order);
  await tabTo(
    page,
    page.locator("[data-list-bar]").getByRole("button", { name: o.approve.button, exact: true }),
  );
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function confirmByKeys(page: Page, dialog: Locator, button: string, done: string) {
  await tabTo(page, dialog.getByRole("button", { name: button, exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByText(done)).toBeVisible();
}

test("S1 with the keyboard only: three approvals, 520 000 given, bought exactly, the Manager closes; stock +100, cash count 0 (9.1d Done when; 15 S1; 11 rule 13)", async ({
  page,
}) => {
  // A whole scenario through four roles, by keys: three times the usual time.
  test.slow();
  const scene = await newScene();
  const order = await notebooks(scene);

  // The Manager ticks the draft in the grid and submits it, through the confirmation.
  await signInByKeys(page, scene.manager);
  await page.goto("/orders");
  await page.waitForLoadState("networkidle");
  const tick = page.getByRole("checkbox", {
    name: o.tickRow.replace("{product}", order.product),
  });
  await tabTo(page, tick);
  await page.keyboard.press("Space");
  await expect(tick).toBeChecked();
  await tabTo(page, page.getByRole("button", { name: o.submit.button.replace("{count}", "1") }));
  await page.keyboard.press("Enter");
  const submit = page.getByRole("alertdialog");
  await expect(submit).toBeVisible();
  await noSeriousFinding(page, "the Submit confirmation");
  await confirmByKeys(page, submit, o.submit.confirm, "Submitted 1 order");

  // The Head and the Principal approve on the list.
  for (const [approver, status] of [
    [scene.head, "PENDING_HEAD"],
    [scene.principal, "PENDING_PRINCIPAL"],
  ] as const) {
    await signInByKeys(page, approver);
    const dialog = await approveByKeys(page, scene, order, status);
    await noSeriousFinding(page, `the approval of ${status}`);
    await confirmByKeys(page, dialog, o.approve.button, "Approved 1 order.");
  }

  // Finance approves with the 520 000 in cash prefilled (08 When Finance approves).
  await signInByKeys(page, scene.finance);
  const finance = await approveByKeys(page, scene, order, "PENDING_FINANCE");
  await expect(finance.locator(`[data-cash-row="${order.id}"] input`)).toHaveValue("520000");
  await noSeriousFinding(page, "Finance's approval with cash");
  await confirmByKeys(page, finance, o.approve.button, "Approved 1 order.");

  // The Manager records the purchase exactly as planned from the order page.
  await signInByKeys(page, scene.manager);
  await page.goto(`/orders/${order.id}`);
  await page.waitForLoadState("networkidle");
  await tabTo(page, page.locator("[data-record-purchase]"));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}/purchase$`));
  await page.waitForLoadState("networkidle");
  await tabTo(page, page.getByRole("button", { name: en.purchase.form.sameAsPlanned }));
  await page.keyboard.press("Enter");
  await expect(page.locator(`#purchase-qty-${order.id}`)).toHaveValue("100");
  await noSeriousFinding(page, "the purchase form");
  await tabTo(page, page.getByRole("button", { name: en.purchase.form.save }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  await expect(page.locator('[data-progress="DONE"]')).toBeVisible();
  for (const label of ["number", "price", "total"] as const) {
    await expect(labelOf(page, label)).toHaveAttribute("data-colour", "green");
  }

  // The exact match closes from the list, after the sentence of 08 Closing 1.
  await listAt(page, scene, "PURCHASING");
  await tickByKeys(page, order);
  await tabTo(page, page.locator('[data-list-bar] [data-move="CLOSE_EXACT"]'));
  await page.keyboard.press("Enter");
  const close = page.getByRole("alertdialog");
  await expect(close.locator("[data-close-confirm]")).toHaveText(m.closeConfirm);
  await noSeriousFinding(page, "the Close confirmation");
  await confirmByKeys(page, close, m.button.CLOSE_EXACT, "Closed 1 order.");

  // The closed order's page, and S1's end: closed, stock +100, cash count 0.
  await page.goto(`/orders/${order.id}`);
  await page.waitForLoadState("networkidle");
  await noSeriousFinding(page, "the closed order's page");
  expect(await statusOf(order.id)).toBe("CLOSED");
  expect(await stockOf(scene.branch.id, order.variantId)).toBe("100.000");
  expect(await countOf(order.id)).toBe(0);
});
