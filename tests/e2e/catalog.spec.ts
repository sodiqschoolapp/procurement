import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_ROLES } from "./global-setup";

// Build-plan 1.5: four catalog screens under /catalog/... on one shared component; " Paper " and
// "paper" clash; only the Head can write (04-catalogs.md, Catalogs table, rules 2, 3, 9;
// 11-screens-and-ux.md rules 6, 8, 12, 13; plan of 1.5). Entries are never deleted and both
// projects share one database, so every name is new on every run.

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

/** Opens a catalog's new-entry page and waits for the form to run in the browser. */
async function openNew(page: Page, kind: keyof typeof t.kinds): Promise<void> {
  await page.goto(`/catalog/${kind}/new`);
  await expect(page.getByRole("heading", { name: t.kinds[kind].newTitle, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: t.save })).toBeEnabled();
}

async function saveNew(page: Page, by: "click" | "enter" = "click"): Promise<void> {
  if (by === "click") await page.getByRole("button", { name: t.save }).click();
  // After a refusal the error toast covers Save at phone width until it fades: Enter in a field
  // saves the form as well.
  else await page.keyboard.press("Enter");
  // The toast and the history row can carry the same words: the first is enough.
  await expect(page.getByText(t.created).first()).toBeVisible();
  await expect(page).toHaveURL(/\/catalog\/[a-z-]+\/[0-9a-f-]{36}$/);
}

for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
  test(`${role} opening the catalog pages gets not found (Done when: only the Head can write)`, async ({
    page,
  }) => {
    await signIn(page, E2E_ROLES[role]);
    for (const address of [
      "/catalog",
      "/catalog/measures",
      "/catalog/companies/new",
      "/catalog/categories/00000000-0000-4000-8000-000000000000",
    ]) {
      const response = await page.goto(address);
      expect(response?.status(), address).toBe(404);
    }
  });
}

test("an unknown catalog, an unknown entry and an address that is not an id are not found", async ({
  page,
}) => {
  await signIn(page, E2E_ROLES.HEAD);
  for (const address of [
    "/catalog/colours",
    "/catalog/measures/00000000-0000-4000-8000-000000000000",
    "/catalog/measures/abc",
  ]) {
    const response = await page.goto(address);
    expect(response?.status(), address).toBe(404);
  }
});

test("the Head fills the four catalogs, sees a clash refused, finds and deactivates an entry (04 rules 2, 3, 9)", async ({
  page,
}, info) => {
  // Four catalogs and a dozen pages in one path: three times the usual time, for the phone.
  test.slow();
  const suffix = randomUUID().slice(0, 8);
  await signIn(page, E2E_ROLES.HEAD);

  // Admin opens /catalog (plan of 1.5, decision 11); the sidebar is hidden at phone width.
  if (info.project.name === "desktop-1440") {
    await page.getByRole("link", { name: uz.shell.menu.admin }).click();
  } else {
    await page.goto("/catalog");
  }
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByRole("heading", { name: t.title, level: 1 })).toBeVisible();
  await noSideScroll(page);
  await page.getByRole("link", { name: new RegExp(t.kinds.measures.title) }).click();
  await expect(page).toHaveURL(/\/catalog\/measures$/);

  // A measure.
  await openNew(page, "measures");
  const save = page.getByRole("button", { name: t.save });
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(
    info.project.name === "phone-375" ? 44 : 40,
  );
  await page.getByLabel(t.fields.name, { exact: true }).fill(`Kilogramm ${suffix}`);
  await page.getByLabel(t.fields.shortName).fill(`kg${suffix}`);
  await page.getByLabel(t.fields.allowDecimal).check();
  await saveNew(page);

  // A category, then " Paper " against "paper" (Done when; rule 3).
  await openNew(page, "categories");
  await page.getByLabel(t.fields.name).fill(` Paper ${suffix} `);
  await saveNew(page);
  await expect(page.getByRole("heading", { name: `Paper ${suffix}`, level: 1 })).toBeVisible();
  await openNew(page, "categories");
  await page.getByLabel(t.fields.name).fill(`paper ${suffix}`);
  await page.getByRole("button", { name: t.save }).click();
  await expect(page.getByText(uz.errors.field.taken)).toBeVisible();
  await expect(page).toHaveURL(/\/catalog\/categories\/new$/);

  // An extra cost type.
  await openNew(page, "extra-costs");
  await page.getByLabel(t.fields.name).fill(`Yetkazib berish ${suffix}`);
  await saveNew(page);

  // A company: an unchosen kind is refused, then saved with a kind and a phone.
  await openNew(page, "companies");
  await page.getByLabel(t.fields.name).fill(`Sinov Savdo ${suffix}`);
  await page.getByRole("button", { name: t.save }).click();
  await expect(page.getByText(uz.errors.field.required)).toBeVisible();
  await page.getByLabel(t.fields.kind).selectOption("SUPPLIER");
  await page.getByLabel(t.fields.phone).fill("+998 90 000 00 00");
  await saveNew(page, "enter");
  await noSideScroll(page);

  // Found by search, the search kept in the address (rule 8).
  await page.goto("/catalog/companies");
  await page.getByRole("searchbox").fill(`savdo ${suffix}`);
  await page.getByRole("button", { name: t.find }).click();
  await expect(page).toHaveURL(new RegExp(`q=savdo`));
  const row = page.getByRole("row").filter({ hasText: `Sinov Savdo ${suffix}` });
  await expect(row).toContainText(t.companyKind.SUPPLIER);
  await noSideScroll(page);
  await row.getByRole("link").click();

  // Deactivated through the confirm dialog (rule 6); the entry stays, with its history (rules 2, 9).
  await page.getByRole("button", { name: t.deactivate }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(t.deactivateResult);
  await dialog.getByRole("button", { name: t.deactivate }).click();
  await expect(page.getByText(t.deactivated).first()).toBeVisible();
  await expect(page.getByRole("button", { name: t.activate })).toBeVisible();
  await expect(page.getByText(uz.audit.actions.company.deactivate).first()).toBeVisible();
  await expect(page.getByText(uz.audit.actions.company.create).first()).toBeVisible();

  await page.goto(`/catalog/companies?q=${suffix}`);
  await expect(page.getByRole("row").filter({ hasText: `Sinov Savdo ${suffix}` })).toContainText(
    t.inactive,
  );
  await noSideScroll(page);
});
