import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import sharp from "sharp";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_ROLES } from "./global-setup";

// Build-plan 1.12: a Manager sends a suggestion with name, measure as text, photo and note; the
// Head adds it to the catalog, edited, or declines it with a reason; each side is told (04-catalogs.md
// rule 8; 10, Notifications: "Product suggested | Head; the decision goes back to the Manager";
// plan of 1.12, decision 4, Look first: the /suggestions screens). Both projects share one
// database, so every name is new on every run.

type Person = (typeof E2E_ROLES)[keyof typeof E2E_ROLES];

const t = uz.suggestions;
const c = uz.catalog;

async function signIn(page: Page, user: Person): Promise<void> {
  await page.context().clearCookies();
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

/** The Manager sends a suggestion from the home page's link and lands on its page. */
async function suggest(page: Page, name: string, withPhoto: boolean): Promise<string> {
  await page.goto("/");
  await page.getByRole("link", { name: uz.home.suggest }).click();
  await expect(page.getByRole("heading", { name: t.title, level: 1 })).toBeVisible();
  await page.goto("/suggestions/new");
  await expect(page.getByRole("heading", { name: t.newTitle, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: t.send })).toBeEnabled();
  await page.getByLabel(t.fields.name).fill(name);
  await page.getByLabel(t.fields.unitText).fill("quti");
  await page.getByLabel(t.fields.note).fill("Kimyo xonasi uchun");
  if (withPhoto) {
    const photo = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#1f8a4c" },
    })
      .jpeg()
      .toBuffer();
    await page.locator("#suggestion-photo").setInputFiles({
      name: "taklif.jpg",
      mimeType: "image/jpeg",
      buffer: photo,
    });
    await expect(page.getByRole("button", { name: c.photoReplace })).toBeVisible();
  }
  await noSideScroll(page);
  await page.getByRole("button", { name: t.send }).click();
  await expect(page.getByText(t.sent).first()).toBeVisible();
  await expect(page).toHaveURL(/\/suggestions\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByRole("main").getByText(t.status.PENDING)).toBeVisible();
  return new URL(page.url()).pathname;
}

test("a Manager suggests, the Head adds it edited; a second one is declined with a reason; each side is told (build-plan 1.12)", async ({
  page,
}) => {
  test.slow();
  const suffix = randomUUID().slice(0, 8);
  const category = `Laboratoriya ${suffix}`;
  const measure = `Quti ${suffix}`;
  const added = `Probirka ${suffix}`;
  const declined = `Kolba ${suffix}`;

  // The Head's category and measure to pick at the add (1.5).
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto("/catalog/categories/new");
  await expect(page.getByRole("button", { name: c.save })).toBeEnabled();
  await page.getByLabel(c.fields.name).fill(category);
  await page.getByRole("button", { name: c.save }).click();
  await expect(page).toHaveURL(/\/catalog\/categories\/[0-9a-f-]{36}$/);
  await page.goto("/catalog/measures/new");
  await expect(page.getByRole("button", { name: c.save })).toBeEnabled();
  await page.getByLabel(c.fields.name, { exact: true }).fill(measure);
  await page.getByLabel(c.fields.shortName).fill(`q${suffix}`);
  await page.getByRole("button", { name: c.save }).click();
  await expect(page).toHaveURL(/\/catalog\/measures\/[0-9a-f-]{36}$/);

  // The Manager suggests two items.
  await signIn(page, E2E_ROLES.MANAGER);
  const first = await suggest(page, added, true);
  await expect(page.locator("main").getByRole("img", { name: new RegExp(suffix) })).toBeVisible();
  const second = await suggest(page, declined, false);
  await expect(page.getByRole("button", { name: t.add })).toHaveCount(0);

  // The Head is told, and adds the first with a changed name.
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto("/notifications");
  await expect(page.getByText(added).first()).toBeVisible();
  await page.goto("/catalog");
  await expect(page.getByRole("link", { name: new RegExp(c.suggestionsRow.title) })).toBeVisible();
  await page.goto(first);
  await page.getByRole("link", { name: t.add }).click();
  await expect(page.getByRole("heading", { name: t.addTitle, level: 1 })).toBeVisible();
  await expect(page.getByText(t.askedMeasure.replace("{unit}", "quti"))).toBeVisible();
  await expect(page.getByLabel(c.fields.name)).toHaveValue(added);
  await expect(page.getByRole("button", { name: c.photoReplace })).toBeVisible();
  await expect(page.getByRole("button", { name: c.save })).toBeEnabled();
  await page.getByLabel(c.fields.name).fill(`${added} 10 ml`);
  await page.getByLabel(c.fields.categoryId).selectOption({ label: category });
  await page.getByLabel(c.fields.unitId).selectOption({ label: measure });
  await noSideScroll(page);
  await page.getByRole("button", { name: c.save }).click();
  await expect(page.getByText(t.added).first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${first}$`));
  await expect(page.getByRole("main").getByText(t.status.ADDED)).toBeVisible();
  await expect(page.getByRole("link", { name: `${added} 10 ml` })).toBeVisible();

  // The Head declines the second with a reason, after the confirmation.
  await page.goto(second);
  await page.getByLabel(t.fields.reason).fill("Omborda yetarli");
  await page.getByRole("button", { name: t.decline }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: t.decline }).click();
  await expect(page.getByText(t.declined).first()).toBeVisible();
  await expect(page.getByRole("main").getByText(t.status.DECLINED)).toBeVisible();
  await expect(page.getByText("Omborda yetarli")).toBeVisible();
  await noSideScroll(page);

  // The Manager is told of both decisions and sees them in the list.
  await signIn(page, E2E_ROLES.MANAGER);
  await page.goto("/notifications");
  await expect(page.getByText(new RegExp(`${added}.*katalogga qoʻshildi`)).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`${declined}.*rad etildi`)).first()).toBeVisible();
  await page.goto("/suggestions");
  await expect(page.getByRole("heading", { name: t.title, level: 1 })).toBeVisible();
  await expect(page.getByText(added).filter({ visible: true }).first()).toBeVisible();
  await noSideScroll(page);
});

for (const role of ["PRINCIPAL", "FINANCE"] as const) {
  test(`${role} gets not found on the suggestion pages (03, Permission matrix: "Suggest a new product")`, async ({
    page,
  }) => {
    await signIn(page, E2E_ROLES[role]);
    for (const address of ["/suggestions", "/suggestions/new"]) {
      const response = await page.goto(address);
      expect(response?.status(), address).toBe(404);
    }
  });
}
