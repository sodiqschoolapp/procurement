import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import sharp from "sharp";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_ROLES } from "./global-setup";

// Build-plan 1.8, Done when (by hand, automated too): "the spec's phase 1 check, add a product with
// subtypes and a photo"; "a product without subtypes shows none on screen". 04-catalogs.md,
// Catalogs table (Subtypes), rules 1, 3, 6, 9; open question 18 (plan of 1.8, decision 1: the
// first subtype names the existing items, which keep what the product had; D64); 11-screens-and-ux.md rules 6, 12, 13. Entries are
// never deleted and both projects share one database, so every name is new on every run.

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

async function openNew(page: Page, address: string, title: string | RegExp): Promise<void> {
  await page.goto(address);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: t.save })).toBeEnabled();
}

async function saveNew(page: Page, pattern: RegExp): Promise<void> {
  await page.getByRole("button", { name: t.save }).click();
  await expect(page.getByText(t.created).first()).toBeVisible();
  await expect(page).toHaveURL(pattern);
}

for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
  test(`${role} opening the subtype pages gets not found (03, "Manage catalogs …")`, async ({
    page,
  }) => {
    await signIn(page, E2E_ROLES[role]);
    const product = "00000000-0000-4000-8000-000000000000";
    for (const address of [
      `/catalog/products/${product}/subtypes/new`,
      `/catalog/products/${product}/subtypes/00000000-0000-4000-8000-000000000001`,
    ]) {
      const response = await page.goto(address);
      expect(response?.status(), address).toBe(404);
    }
  });
}

test("the Head adds a product, sees no subtypes, adds two subtypes, one with a photo, and sees both in the list (phase 1 check)", async ({
  page,
}) => {
  test.slow();
  const suffix = randomUUID().slice(0, 8);
  const category = `Qog'oz ${suffix}`;
  const measure = `Pachka ${suffix}`;
  const name = `Ofis qog'ozi ${suffix}`;
  await signIn(page, E2E_ROLES.HEAD);

  await openNew(page, "/catalog/categories/new", t.kinds.categories.newTitle);
  await page.getByLabel(t.fields.name).fill(category);
  await saveNew(page, /\/catalog\/categories\/[0-9a-f-]{36}$/);
  await openNew(page, "/catalog/measures/new", t.kinds.measures.newTitle);
  await page.getByLabel(t.fields.name, { exact: true }).fill(measure);
  await page.getByLabel(t.fields.shortName).fill(`p${suffix}`);
  await saveNew(page, /\/catalog\/measures\/[0-9a-f-]{36}$/);

  // A product with a price: it shows no subtypes (build-plan 1.8, Done when).
  await openNew(page, "/catalog/products/new", t.kinds.products.newTitle);
  await page.getByLabel(t.fields.name).fill(name);
  await page.getByLabel(t.fields.categoryId).selectOption({ label: category });
  await page.getByLabel(t.fields.unitId).selectOption({ label: measure });
  await page.getByLabel(t.fields.referencePrice).fill("50 000");
  await saveNew(page, /\/catalog\/products\/[0-9a-f-]{36}$/);
  const productUrl = page.url();
  await expect(page.getByRole("heading", { name: t.subtypes.title, level: 2 })).toBeVisible();
  await expect(page.getByText(t.subtypes.none)).toBeVisible();

  // The first subtype: the note, and the existing items named too; they keep the product's price
  // (04 rule 1; D64, replacing decisions 1.8 item 1).
  await page.getByRole("link", { name: t.subtypes.new }).click();
  await expect(
    page.getByRole("heading", { name: t.subtypes.newTitle.replace("{product}", name), level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(t.subtypes.firstNote)).toBeVisible();
  await expect(page.getByRole("button", { name: t.save })).toBeEnabled();
  await page.getByLabel(t.fields.existingName).fill("A5");
  await page.getByLabel(t.fields.name, { exact: true }).fill("A4");
  const photo = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#e0a020" },
  })
    .jpeg()
    .toBuffer();
  await page.locator("#subtype-photo").setInputFiles({
    name: "a4.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  await expect(page.getByRole("button", { name: t.photoReplace })).toBeVisible();
  await saveNew(page, new RegExp(`${productUrl.split("/").pop()}$`));

  // The second subtype: its own price is typed; a duplicate name is refused (04 rule 3).
  await page.getByRole("link", { name: t.subtypes.new }).click();
  await expect(
    page.getByRole("heading", { name: t.subtypes.newTitle.replace("{product}", name), level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(t.subtypes.firstNote)).toHaveCount(0);
  await expect(page.getByLabel(t.fields.existingName)).toHaveCount(0);
  await expect(page.getByRole("button", { name: t.save })).toBeEnabled();
  await page.getByLabel(t.fields.name).fill("a4");
  await page.getByRole("button", { name: t.save }).click();
  await expect(page.getByText(uz.errors.field.taken)).toBeVisible();
  // After a refusal the error toast covers Save at phone width: submit with Enter (progress 1.5).
  await page.getByLabel(t.fields.referencePrice).fill("60 000");
  await page.getByLabel(t.fields.name).fill("A3");
  await page.getByLabel(t.fields.name).press("Enter");
  await expect(page.getByText(t.created).first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${productUrl.split("/").pop()}$`));

  // All three in the product's list: A5 with the product's 50 000, A4 with its small photo, A3
  // with the product's (none).
  const section = page.locator("section", {
    has: page.getByRole("heading", { name: t.subtypes.title }),
  });
  await expect(section.getByRole("link", { name: "A4" }).first()).toBeVisible();
  await expect(section.getByRole("link", { name: "A3" }).first()).toBeVisible();
  await expect(section.getByRole("link", { name: "A5" }).first()).toBeVisible();
  await expect(
    section
      .getByText(/50\s000/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  const small = section.getByRole("img", { name: new RegExp(`${suffix} A4`) }).first();
  await expect
    .poll(() => small.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(160);
  await expect(
    section
      .getByText(/60\s000/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  // The product's own price now reads "per subtype" (decision 4).
  await expect(page.getByText(t.subtypes.pricePerSubtype)).toBeVisible();
  await noSideScroll(page);

  // The subtype page: price read-only, history, Deactivate behind the dialog.
  await section.getByRole("link", { name: "A3" }).first().click();
  await expect(page.getByRole("heading", { name: "A3", level: 1 })).toBeVisible();
  await expect(page.getByLabel(t.fields.referencePrice)).toHaveCount(0);
  await expect(page.getByText(uz.audit.actions.subtype.create).first()).toBeVisible();
  await page.getByRole("button", { name: t.deactivate }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(t.deactivateResult);
  await dialog.getByRole("button", { name: t.deactivate }).click();
  // The closing dialog already reads "Activate" for a moment: wait until it is gone.
  await expect(dialog).toBeHidden();
  await expect(page.getByText(t.deactivated).first()).toBeVisible();
  await noSideScroll(page);

  // A4 deactivated the same way; A5 is then the last active one: no Deactivate, the reason
  // instead (decision 3).
  await page.goto(productUrl);
  await section.getByRole("link", { name: "A4" }).first().click();
  await expect(page.getByRole("heading", { name: "A4", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: t.deactivate }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: t.deactivate }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(page.getByText(t.deactivated).first()).toBeVisible();
  await page.goto(productUrl);
  await section.getByRole("link", { name: "A5" }).first().click();
  await expect(page.getByRole("heading", { name: "A5", level: 1 })).toBeVisible();
  await expect(page.getByText(t.subtypes.lastActive)).toBeVisible();
  await expect(page.getByRole("button", { name: t.deactivate })).toHaveCount(0);

  // The products list shows the count of subtypes in place of a price.
  await page.goto(`/catalog/products?q=${suffix}`);
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    t.subtypes.count.replace("{count, plural, other {# tur}}", "3 tur"),
  );
});
