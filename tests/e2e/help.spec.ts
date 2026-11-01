import { type Page, expect, test } from "@playwright/test";

import ru from "../../src/i18n/messages/ru.json" with { type: "json" };
import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { signIn, scrollsSideways } from "./acceptance-fixtures";
import { E2E_ROLES } from "./global-setup";

// 15-quality-and-acceptance.md S26 (build-plan 9.7, Done when: "S26 passes as a Playwright test at
// 375 px and 1440 px"): a visitor who is not signed in opens /help, chooses Russian and searches
// "write-off"; a Manager then signs in and opens Help from the menu. 11-screens-and-ux.md, Help
// page rules 1, 3 and 4; 03-roles-and-permissions.md rule 9. Both widths are the two projects.

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 640;
}

test("S26: a visitor reads and searches the help in Russian; a Manager opens it from the menu", async ({
  page,
  context,
}) => {
  // A visitor with no session: the page opens, in Uzbek by default, with no school data.
  await page.goto("/help");
  expect(new URL(page.url()).pathname).toBe("/help");
  await expect(page.getByRole("heading", { level: 1, name: uz.help.title })).toBeVisible();
  // The top bar's own link (the help text holds links to the sign-in page too).
  await expect(
    page.getByRole("banner").getByRole("link", { name: uz.help.signIn, exact: true }),
  ).toBeVisible();

  // The visitor chooses Russian on the page, as on the sign-in page (rule 4).
  // A choice made before the page has hydrated changes nothing: choose again until it shows.
  await expect(async () => {
    await page.locator("#language").selectOption("ru");
    await expect(page.getByRole("heading", { level: 1, name: ru.help.title })).toBeVisible({
      timeout: 2000,
    });
  }).toPass();

  // The search leaves only the topics that hold the word, in Russian (rule 3).
  const topics = page.locator("[data-help-topic]");
  const total = await topics.count();
  const word = ru.warehouse.documents.types.WRITE_OFF.toLocaleLowerCase();
  await page.getByLabel(ru.help.searchLabel).fill(word);
  await expect(page.locator("#write-off")).toBeVisible();
  await expect(page.locator("#sign-in")).toBeHidden();
  const shown = page.locator("[data-help-topic]:visible");
  const count = await shown.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(total);
  for (const text of await shown.allTextContents()) {
    expect(text.toLocaleLowerCase()).toContain(word);
  }
  expect(await scrollsSideways(page)).toBe(false);

  // A Manager signs in and opens Help from the menu: on a phone it is under "More".
  await context.clearCookies();
  await signIn(page, E2E_ROLES.MANAGER);
  if (isPhone(page)) {
    const more = page.locator("nav:visible").getByRole("button", { name: uz.shell.menu.more });
    await expect(async () => {
      if ((await page.getByRole("menu").count()) === 0) await more.click();
      await expect(page.getByRole("menuitem", { name: uz.shell.menu.help })).toBeVisible({
        timeout: 1000,
      });
    }).toPass();
    await page.getByRole("menuitem", { name: uz.shell.menu.help }).click();
  } else {
    await page.locator("nav:visible").getByRole("link", { name: uz.shell.menu.help }).click();
  }

  // In the Manager's own language, with no language select and a way back into the app.
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { level: 1, name: uz.help.title })).toBeVisible();
  await expect(page.locator("#language")).toHaveCount(0);
  await expect(
    page.getByRole("banner").getByRole("link", { name: uz.help.backToApp, exact: true }),
  ).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
});

test("the sign-in page links to the help (11, Interface per role)", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: uz.login.help, exact: true }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { level: 1, name: uz.help.title })).toBeVisible();
});
