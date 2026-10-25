import { randomUUID } from "node:crypto";

import { type Browser, type Page, expect, test } from "@playwright/test";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_BRANCHES, E2E_ROLES } from "./global-setup";

// Build-plan 1.3: the Head creates a user with a generated password, which is shown once and
// signs in; the Head renews it, the user's open session ends and the new one signs in (A8;
// 13-technology.md, Login); the user form's unsaved-changes guard; other roles get "not found"
// (03 rule 1). Users are never deleted and both projects share one database, so every username is
// new on every run.

type Person = { username: string; password: string };

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

async function newPage(browser: Browser, page: Page): Promise<Page> {
  const context = await browser.newContext({ viewport: page.viewportSize() });
  return context.newPage();
}

for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
  test(`${role} opening the user pages gets not found (03 rule 1)`, async ({ page }) => {
    await signIn(page, E2E_ROLES[role]);
    for (const address of ["/users", "/users/new", "/users/00000000-0000-4000-8000-000000000000"]) {
      const response = await page.goto(address);
      expect(response?.status(), address).toBe(404);
    }
  });
}

test("the Head creates a user with a generated password and renews it (A8)", async ({
  page,
  browser,
}) => {
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto("/branches");
  await page
    .getByRole("navigation", { name: uz.admin.label })
    .getByRole("link", { name: uz.admin.users })
    .click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole("heading", { name: uz.users.title, level: 1 })).toBeVisible();
  await noSideScroll(page);

  await page.getByRole("link", { name: uz.users.new }).first().click();
  await expect(page).toHaveURL(/\/users\/new$/);
  const create = page.getByRole("button", { name: uz.users.create });
  await expect(create).toBeEnabled();

  const username = `e2e_${randomUUID().slice(0, 8)}`;
  const [branch] = E2E_BRANCHES;
  await page.getByLabel(uz.users.fullName).fill("Sinov Foydalanuvchi");
  await page.getByLabel(uz.users.username, { exact: true }).fill(username);
  await page.getByLabel(uz.users.phone).fill("+998 90 000 77 01");
  await page.getByLabel(`${branch.code} · ${branch.name}`).check();
  await page.getByRole("button", { name: uz.users.generate, exact: true }).click();
  const password = await page.getByLabel(uz.users.password).inputValue();
  expect(password).toHaveLength(12);
  await create.click();

  // Shown once, here only (A8).
  await expect(page.getByText(uz.users.created).first()).toBeVisible();
  await expect(page.getByTestId("shown-password")).toHaveText(password);
  await noSideScroll(page);
  await page.getByRole("link", { name: uz.users.openUser }).click();
  await expect(page).toHaveURL(/\/users\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Sinov Foydalanuvchi", level: 1 })).toBeVisible();
  await expect(page.getByText(uz.audit.actions.user.create).first()).toBeVisible();
  await noSideScroll(page);

  // The generated password signs in, on another device.
  const other = await newPage(browser, page);
  await signIn(other, { username, password });

  // A renewal: the old session ends at once, the new password signs in (A8).
  await page.getByRole("button", { name: uz.users.generate, exact: true }).click();
  const renewed = await page.getByLabel(uz.users.password).inputValue();
  expect(renewed).not.toBe(password);
  await page.getByRole("button", { name: uz.users.renew }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Sinov Foydalanuvchi");
  await dialog.getByRole("button", { name: uz.users.renew }).click();
  await expect(page.getByText(uz.users.renewed).first()).toBeVisible();
  await expect(page.getByTestId("shown-password")).toHaveText(renewed);
  await expect(page.getByText(uz.audit.actions.user.renew_password).first()).toBeVisible();

  await other.goto("/profile");
  await expect(other).toHaveURL(/\/login/);
  await signIn(other, { username, password: renewed });
  await other.context().close();
});

test("the user form asks before leaving with unsaved changes", async ({ page }) => {
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto("/users/new");
  await expect(page.getByRole("button", { name: uz.users.create })).toBeEnabled();
  await page.getByLabel(uz.users.fullName).fill("Yozilgan ism");
  await page
    .getByRole("navigation", { name: uz.admin.label })
    .getByRole("link", { name: uz.admin.branches })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(uz.unsavedChanges.title);
  await dialog.getByRole("button", { name: uz.common.cancel }).click();
  await expect(page).toHaveURL(/\/users\/new$/);
  await expect(page.getByLabel(uz.users.fullName)).toHaveValue("Yozilgan ism");
});

// Build-plan 1.4, Done when (by hand, automated): "switch one off and the Manager gets a bell
// notice". 03, "Manager rights the Head can switch"; 10 Notifications. The Manager is made here,
// so no other spec sees a right switched off (review of the plan of 1.4, correction 1).
test("the Head switches a Manager's right off and the Manager gets a bell notice (03; 10)", async ({
  page,
  browser,
}) => {
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto("/users/new");
  const create = page.getByRole("button", { name: uz.users.create });
  await expect(create).toBeEnabled();
  const username = `e2e_${randomUUID().slice(0, 8)}`;
  const [branch] = E2E_BRANCHES;
  await page.getByLabel(uz.users.fullName).fill("Huquq Sinovchi");
  await page.getByLabel(uz.users.username, { exact: true }).fill(username);
  await page.getByLabel(uz.users.phone).fill("+998 90 000 77 02");
  await page.getByLabel(`${branch.code} · ${branch.name}`).check();
  await page.getByRole("button", { name: uz.users.generate, exact: true }).click();
  const password = await page.getByLabel(uz.users.password).inputValue();
  await create.click();
  await expect(page.getByTestId("shown-password")).toHaveText(password);
  await page.getByRole("link", { name: uz.users.openUser }).click();
  await expect(page).toHaveURL(/\/users\/[0-9a-f-]{36}$/);

  // All ten on by default (03; ten since 1.12b).
  const rights = page.locator("section", {
    has: page.getByRole("heading", { name: uz.managerRights.title, level: 2 }),
  });
  await expect(rights).toBeVisible();
  const purchases = rights.getByRole("checkbox", { name: uz.managerRights.names.RECORD_PURCHASES });
  await expect(rights.getByRole("checkbox", { checked: true })).toHaveCount(10);
  await expect(purchases).toBeEnabled();
  const box = await page.locator("label[for='right-RECORD_PURCHASES']").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await noSideScroll(page);

  await purchases.uncheck();
  await expect(page.getByText(uz.managerRights.switchedOff).first()).toBeVisible();
  await expect(purchases).not.toBeChecked();
  await expect(page.getByText(uz.audit.actions.user.switch_right).first()).toBeVisible();
  // The history names the right, Yes → No (plan of 1.4, decision 6; diff review, Should fix 1).
  const history = page.locator("section", {
    has: page.getByRole("heading", { name: uz.users.history, level: 2 }),
  });
  await expect(history).toContainText(uz.managerRights.names.RECORD_PURCHASES);
  await expect(history).toContainText(uz.audit.yes);
  await expect(history).toContainText(uz.audit.no);

  // The Manager's bell (10 Notifications: "A Manager's right is switched on or off → That Manager").
  const manager = await newPage(browser, page);
  await signIn(manager, { username, password });
  await expect(manager.getByTestId("bell")).toHaveText("1");
  await manager.goto("/notifications");
  await expect(manager.getByTestId("notification").first()).toContainText(
    uz.managerRights.names.RECORD_PURCHASES,
  );
  await noSideScroll(manager);
  await manager.context().close();
});
