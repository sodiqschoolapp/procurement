import { type Page, expect, test } from "@playwright/test";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import ru from "../../src/i18n/messages/ru.json" with { type: "json" };
import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_USER } from "./global-setup";

// Build-plan 0.6, Done when: "open a deep link signed out, sign in, land on that page. The login
// page shows in all three languages." edge-cases/system.md: back to the same page after sign-in.
// A2 and 11-screens-and-ux.md rule 14: three languages, every label from the message files.
// Both widths are the two projects of playwright.config.ts.

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.getByLabel(uz.login.username).fill(username);
  await page.getByLabel(uz.login.password).fill(password);
  await page.getByRole("button", { name: uz.login.submit }).click();
}

test("a deep link opened signed out goes to sign-in, then lands on that page (build-plan 0.6; edge-cases/system.md)", async ({
  page,
}) => {
  await page.goto("/orders?tab=x");

  await expect(page).toHaveURL(/\/login\?next=%2Forders%3Ftab%3Dx$/);
  await signIn(page, E2E_USER.username, E2E_USER.password);

  await expect(page).toHaveURL(/\/orders\?tab=x$/);
});

test("a wrong password shows the error line (A8; plan of 0.6, decision 6)", async ({ page }) => {
  await page.goto("/login");
  // An unknown, invented username per run, so the limit of 5 tries never locks the test user.
  await signIn(page, `e2e_nobody_${Math.random().toString(36).slice(2, 10)}`, "invented-wrong");

  await expect(page.getByRole("alert").filter({ hasText: uz.login.errors.wrong })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("empty fields are caught before sending (13-technology.md, Forms and checks)", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: uz.login.submit }).click();

  await expect(page.getByText(uz.login.errors.required)).toHaveCount(2);
});

for (const { locale, messages } of [
  { locale: "ru", messages: ru },
  { locale: "en", messages: en },
  { locale: "uz", messages: uz },
] as const) {
  test(`the sign-in page shows in ${locale} through the language select and fits the screen (A2; 11-screens rule 14)`, async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: uz.login.title })).toBeVisible();

    await page.getByLabel(uz.login.language).selectOption(locale);

    await expect(page.getByRole("heading", { level: 1, name: messages.login.title })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByLabel(messages.login.username)).toBeVisible();
    await expect(page.getByLabel(messages.login.password)).toBeVisible();
    await expect(page.getByRole("button", { name: messages.login.submit })).toBeVisible();
    const sizes = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      screen: document.documentElement.clientWidth,
    }));
    expect(sizes.content).toBeLessThanOrEqual(sizes.screen);
  });
}

test("signing out returns to the sign-in page, and the deep link asks again (A8)", async ({
  page,
}) => {
  await page.goto("/login");
  await signIn(page, E2E_USER.username, E2E_USER.password);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: uz.home.title })).toBeVisible();

  // The profile's sign-out button is there at both widths (plan of 0.10b, decision 11).
  await page.goto("/profile");
  await expect(page.getByRole("main").getByText(E2E_USER.fullName, { exact: true })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: uz.session.signOut }).click();

  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Forders$/);
});
