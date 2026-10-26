import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { withGuardLock } from "./acceptance-fixtures";
import { E2E_ROLES } from "./global-setup";
import { shownAmount } from "./shown-amount";

// Build-plan 1.1, Done when (the by-hand check, automated): "set the school name and see it in
// the shell". 11-screens-and-ux.md, Screens ("Settings, /settings, Head"), rules 4, 6 and 13;
// plan of 1.1, decisions 11, 12 and 13. The settings belong to the whole school and both projects
// run at once, so each project changes its own key: the desktop the school name (the sidebar is
// hidden at phone width), the phone the reminder hours. Progress 0.10a: the first form proves the
// unsaved-changes guard's browser wiring, a menu link and the back button.

type Person = (typeof E2E_ROLES)[keyof typeof E2E_ROLES];

async function signIn(page: Page, user: Person): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(uz.login.username).fill(user.username);
  await page.getByLabel(uz.login.password).fill(user.password);
  await page.getByRole("button", { name: uz.login.submit }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function noSideScroll(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.screen);
}

const invented = () => randomUUID().slice(0, 8);

/** Opens /settings and waits for the form to run in the browser: Save is enabled then. */
async function openSettings(page: Page): Promise<void> {
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: uz.settings.save, exact: true })).toBeEnabled();
}

test("the Head sets the school name and sees it in the menu and the history (Done when)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop-1440", "the sidebar is hidden at phone width");
  await signIn(page, E2E_ROLES.HEAD);

  // Admin opens /catalog (plan of 1.5, decision 11; until 1.5 it opened /settings, decision 11 of
  // 1.1), and the Admin row leads on to Settings.
  await page.getByRole("link", { name: uz.shell.menu.admin }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await page
    .getByRole("navigation", { name: uz.admin.label })
    .getByRole("link", { name: uz.admin.settings })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: uz.settings.title, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: uz.settings.save, exact: true })).toBeEnabled();

  const name = `Sinov maktabi ${invented()}`;
  await page.getByLabel(uz.settings.schoolName).fill(name);
  await page.getByRole("button", { name: uz.settings.save, exact: true }).click();

  await expect(page.getByText(uz.settings.saved)).toBeVisible();
  await expect(page.locator("aside").getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: name }).first()).toContainText(
    uz.audit.actions.settings.change,
  );
  await noSideScroll(page);
});

test("the Head changes the reminder hours at phone width (rules 4, 13)", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-375", "the desktop project changes the school name");
  await signIn(page, E2E_ROLES.HEAD);
  await openSettings(page);
  // The date of the last copy of the database (13 Running it; build-plan 8.2b): the browser
  // tests' server never copies, so none yet.
  await expect(page.locator("[data-last-copy]")).toHaveText(uz.settings.noCopy);

  const field = page.getByLabel(uz.settings.reminderHours);
  const before = await field.inputValue();
  const hours = before === "36" ? "30" : "36";
  await field.fill(hours);
  const save = page.getByRole("button", { name: uz.settings.save, exact: true });
  // A 44 px touch target at phone width (rule 13).
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await save.click();

  await expect(page.getByText(uz.settings.saved)).toBeVisible();
  await openSettings(page);
  await expect(page.getByLabel(uz.settings.reminderHours)).toHaveValue(hours);
  await noSideScroll(page);
});

test("a value out of range is refused with a line under its field, and nothing is saved", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-375", "one project is enough for the server's answer");
  await signIn(page, E2E_ROLES.HEAD);
  await openSettings(page);

  const field = page.getByLabel(uz.settings.escalationHours);
  const before = await field.inputValue();
  await field.fill("721");
  await page.getByRole("button", { name: uz.settings.save, exact: true }).click();

  await expect(page.getByText(uz.errors.field.tooLarge)).toBeVisible();
  await openSettings(page);
  await expect(page.getByLabel(uz.settings.escalationHours)).toHaveValue(before);
});

test("the Head sets the overspend guard amount beside the percent; a negative one is refused (build-plan 2.1)", async ({
  page,
}, info) => {
  // The settings are one per school: only the desktop project changes this key.
  test.skip(info.project.name !== "desktop-1440", "the phone project changes the reminder hours");
  // S12 of acceptance-money.spec.ts changes the same key: one lock keeps them apart, and the
  // amount found at the start is put back (plan of 9.1b, decided item 4). The wait for S12 counts
  // in the test's time.
  test.setTimeout(240_000);
  await withGuardLock(async () => {
    await signIn(page, E2E_ROLES.HEAD);
    await openSettings(page);

    const field = page.getByLabel(uz.settings.overspendGuardMinAmount);
    await expect(page.getByLabel(uz.settings.overspendGuardPercent)).toBeVisible();
    // The field shows the amount grouped, 250 000 (redesign of 21.10.2026), and saves the digits.
    const before = await field.inputValue();
    const amount = before === shownAmount("250000") ? "150000" : "250000";
    await field.fill(amount);
    await page.getByRole("button", { name: uz.settings.save, exact: true }).click();
    await expect(page.getByText(uz.settings.saved)).toBeVisible();

    await openSettings(page);
    await expect(page.getByLabel(uz.settings.overspendGuardMinAmount)).toHaveValue(
      shownAmount(amount),
    );

    // 08, Overspend guard: whole so'm, 0 or more; "-5" is refused under its field, nothing saved.
    await page.getByLabel(uz.settings.overspendGuardMinAmount).fill("-5");
    await page.getByRole("button", { name: uz.settings.save, exact: true }).click();
    await expect(page.getByText(uz.errors.field.wrongFormat)).toBeVisible();
    await openSettings(page);
    await expect(page.getByLabel(uz.settings.overspendGuardMinAmount)).toHaveValue(
      shownAmount(amount),
    );
    await noSideScroll(page);
  });
});

for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
  test(`${role} opening /settings gets not found (decision 12)`, async ({ page }) => {
    await signIn(page, E2E_ROLES[role]);
    const response = await page.goto("/settings");
    expect(response?.status()).toBe(404);
  });
}

test("leaving with unsaved changes asks first: by a menu link and by the back button (rule 6)", async ({
  page,
}, info) => {
  await signIn(page, E2E_ROLES.HEAD);
  await openSettings(page);
  await page.getByLabel(uz.settings.priceHintPercent).fill("55");

  // A menu link: the sidebar on a desktop, the tab bar on a phone (Orders: in the dev server
  // the Next.js indicator covers the phone's first tab).
  const menu = page.locator(info.project.name === "phone-375" ? "nav:visible" : "aside");
  await menu.getByRole("link", { name: uz.shell.menu.orders }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(uz.unsavedChanges.title);
  await dialog.getByRole("button", { name: uz.common.cancel }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByLabel(uz.settings.priceHintPercent)).toHaveValue("55");

  // The back button.
  await page.goBack();
  await expect(dialog).toContainText(uz.unsavedChanges.title);
  await expect(page).toHaveURL(/\/settings$/);
  await dialog.getByRole("button", { name: uz.unsavedChanges.leave }).click();
  await expect(page).not.toHaveURL(/\/settings$/);
});
