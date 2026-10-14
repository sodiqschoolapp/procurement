import { randomInt, randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_ROLES } from "./global-setup";

// Build-plan 1.2, Done when: "a Manager cannot open the screen"; and the Head's own path: create
// a branch, see it in the list, rename it, deactivate it through the confirm dialog and see the
// history (04-catalogs.md, Branches, rules 2 and 9; 11-screens-and-ux.md rules 6, 8, 13; plan of
// 1.2). Branches are never deleted and both projects share one database, so every code and name
// is new on every run.

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

/**
 * Four capital letters, new on every run (04, Branches: 2 to 4 Latin capital letters). It starts
 * with "A", so on a database that keeps earlier runs' branches it sorts onto the list's first page
 * (25 a page, ordered by code).
 */
function inventedCode(): string {
  return `A${Array.from({ length: 3 }, () => String.fromCharCode(65 + randomInt(26))).join("")}`;
}

for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
  test(`${role} opening the branch pages gets not found, and has no Admin item (Done when)`, async ({
    page,
  }) => {
    await signIn(page, E2E_ROLES[role]);
    await expect(page.getByRole("link", { name: uz.shell.menu.admin })).toHaveCount(0);
    for (const address of [
      "/branches",
      "/branches/new",
      "/branches/00000000-0000-4000-8000-000000000000",
    ]) {
      const response = await page.goto(address);
      expect(response?.status(), address).toBe(404);
    }
  });
}

test("an unknown branch and an address that is not an id are not found for the Head", async ({
  page,
}) => {
  await signIn(page, E2E_ROLES.HEAD);
  for (const address of ["/branches/00000000-0000-4000-8000-000000000000", "/branches/abc"]) {
    const response = await page.goto(address);
    expect(response?.status(), address).toBe(404);
  }
});

test("the Head creates, renames and deactivates a branch, and sees the history (04 rules 2 and 9)", async ({
  page,
}, info) => {
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto("/settings");
  // The Admin pages lead to each other (plan of 1.2, decision 12).
  await page
    .getByRole("navigation", { name: uz.admin.label })
    .getByRole("link", { name: uz.admin.branches })
    .click();
  await expect(page).toHaveURL(/\/branches$/);
  await expect(page.getByRole("heading", { name: uz.branches.title, level: 1 })).toBeVisible();
  await noSideScroll(page);

  await page.getByRole("link", { name: uz.branches.new }).first().click();
  await expect(page).toHaveURL(/\/branches\/new$/);
  const save = page.getByRole("button", { name: uz.branches.save });
  await expect(save).toBeEnabled();
  // A 44 px touch target at phone width (rule 13).
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(
    info.project.name === "phone-375" ? 44 : 40,
  );

  // A lower-case code is refused with a line under the field (Done when).
  const suffix = randomUUID().slice(0, 8);
  const code = inventedCode();
  await page.getByLabel(uz.branches.name).fill(`Sinov filiali ${suffix}`);
  await page.getByLabel(uz.branches.code).fill(code.toLowerCase());
  await page.getByLabel(uz.branches.address).fill("Sinov ko'chasi 7");
  await save.click();
  await expect(page.getByText(uz.errors.field.wrongFormat)).toBeVisible();
  await expect(page).toHaveURL(/\/branches\/new$/);

  await page.getByLabel(uz.branches.code).fill(code);
  await save.click();
  // The toast and the history row can carry the same words: the first is enough.
  await expect(page.getByText(uz.branches.created).first()).toBeVisible();
  await expect(page).toHaveURL(/\/branches\/[0-9a-f-]{36}$/);
  const address = page.url();

  // Renamed: the change shows in the history.
  await expect(page.getByRole("button", { name: uz.branches.save })).toBeEnabled();
  await page.getByLabel(uz.branches.name).fill(`Sinov filiali ${suffix} yangi`);
  await page.getByRole("button", { name: uz.branches.save }).click();
  // The toast and the history row can carry the same words: the first is enough.
  await expect(page.getByText(uz.branches.saved).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: `Sinov filiali ${suffix} yangi`, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(uz.audit.actions.branch.update).first()).toBeVisible();

  // Deactivated through the confirm dialog (rule 6); the row stays (rule 2).
  await page.getByRole("button", { name: uz.branches.deactivate }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(uz.branches.deactivateResult);
  await dialog.getByRole("button", { name: uz.branches.deactivate }).click();
  // The toast and the history row can carry the same words: the first is enough.
  await expect(page.getByText(uz.branches.deactivated).first()).toBeVisible();
  await expect(page.getByRole("button", { name: uz.branches.activate })).toBeVisible();
  await expect(page.getByText(uz.audit.actions.branch.deactivate).first()).toBeVisible();
  await noSideScroll(page);

  // In the list, inactive, with the history behind it.
  await page.goto("/branches");
  const listed = page.getByRole("row").filter({ hasText: code });
  await expect(listed).toContainText(`Sinov filiali ${suffix} yangi`);
  await expect(listed).toContainText(uz.branches.inactive);
  await noSideScroll(page);
  await page.goto(address);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Sinov filiali ${suffix}`);
});
