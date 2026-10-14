import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_BRANCHES, E2E_ROLES } from "./global-setup";

// Build-plan 1.6: departments per branch with the responsible person as plain text; the name is
// unique inside a branch; deactivate; change history (04-catalogs.md, Catalogs table: Departments;
// rules 2, 3, 9; A6; 11-screens-and-ux.md rules 6, 8, 12, 13; plan of 1.6). Departments are never
// deleted and both projects share one database, so every name is new on every run.

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

const t = uz.catalog;
const [first, second] = E2E_BRANCHES;

/** Opens the new-department page and waits for the form to run in the browser. */
async function openNew(page: Page): Promise<void> {
  await page.goto("/catalog/departments/new");
  await expect(
    page.getByRole("heading", { name: t.kinds.departments.newTitle, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: t.save })).toBeEnabled();
}

/** The form's branch, not the branch switcher of the top bar, which has the same label. */
function branchField(page: Page) {
  return page.locator("form").getByLabel(t.fields.branch);
}

function branchOption(branch: (typeof E2E_BRANCHES)[number]): string {
  return t.branchOption.replace("{code}", branch.code).replace("{name}", branch.name);
}

for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
  test(`${role} opening the department pages gets not found (03, "Manage catalogs …")`, async ({
    page,
  }) => {
    await signIn(page, E2E_ROLES[role]);
    for (const address of [
      "/catalog/departments",
      "/catalog/departments/new",
      "/catalog/departments/00000000-0000-4000-8000-000000000000",
    ]) {
      const response = await page.goto(address);
      expect(response?.status(), address).toBe(404);
    }
  });
}

test("the Head adds a department in two branches, is refused it twice in one, and deactivates it (Done when)", async ({
  page,
}, info) => {
  test.slow();
  const suffix = randomUUID().slice(0, 8);
  const name = `Oshxona ${suffix}`;
  await signIn(page, E2E_ROLES.HEAD);

  // /catalog lists Departments beside the four catalogs of 1.5.
  await page.goto("/catalog");
  await page.getByRole("link", { name: new RegExp(t.kinds.departments.title) }).click();
  await expect(page).toHaveURL(/\/catalog\/departments$/);

  // In the first branch, with its responsible person.
  await openNew(page);
  const save = page.getByRole("button", { name: t.save });
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(
    info.project.name === "phone-375" ? 44 : 40,
  );
  await branchField(page).selectOption({ label: branchOption(first) });
  await page.getByLabel(t.fields.name).fill(` ${name} `);
  await page.getByLabel(t.fields.responsibleName, { exact: true }).fill("Sinov Oshpazov");
  await page.getByLabel(t.fields.responsiblePhone).fill("+998 90 000 00 11");
  await save.click();
  await expect(page.getByText(t.created).first()).toBeVisible();
  await expect(page).toHaveURL(/\/catalog\/departments\/[0-9a-f-]{36}$/);
  const firstAddress = page.url();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(
    page.getByText(t.branchLine.replace("{code}", first.code).replace("{name}", first.name)),
  ).toBeVisible();
  await noSideScroll(page);

  // The same name in the second branch is allowed.
  await openNew(page);
  await branchField(page).selectOption({ label: branchOption(second) });
  await page.getByLabel(t.fields.name).fill(name);
  await page.getByRole("button", { name: t.save }).click();
  await expect(page.getByText(t.created).first()).toBeVisible();
  await expect(page).toHaveURL(/\/catalog\/departments\/[0-9a-f-]{36}$/);

  // Twice in the first branch is refused, in other capital letters too (04 rule 3).
  await openNew(page);
  await branchField(page).selectOption({ label: branchOption(first) });
  await page.getByLabel(t.fields.name).fill(name.toUpperCase());
  await page.getByRole("button", { name: t.save }).click();
  await expect(page.getByText(uz.errors.field.taken)).toBeVisible();
  await expect(page).toHaveURL(/\/catalog\/departments\/new$/);

  // Both are in the list, found by search.
  await page.goto(`/catalog/departments?q=${suffix}`);
  const rows = page.getByRole("row").filter({ hasText: name });
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: first.code })).toContainText("Sinov Oshpazov");
  await noSideScroll(page);

  // Deactivated through the confirm dialog (rule 6); it stays, with its history (rules 2, 9).
  await page.goto(firstAddress);
  await page.getByRole("button", { name: t.deactivate }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(t.deactivateResult);
  await dialog.getByRole("button", { name: t.deactivate }).click();
  await expect(page.getByText(t.deactivated).first()).toBeVisible();
  // The closing dialog already reads "Activate" for a moment: wait until it is gone.
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: t.activate })).toBeVisible();
  await expect(page.getByText(uz.audit.actions.department.deactivate).first()).toBeVisible();
  await expect(page.getByText(uz.audit.actions.department.create).first()).toBeVisible();

  await page.goto(`/catalog/departments?q=${suffix}`);
  await expect(rows.filter({ hasText: first.code })).toContainText(t.inactive);
  await expect(rows.filter({ hasText: second.code })).toContainText(t.active);
});
