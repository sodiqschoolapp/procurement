import { expect, test } from "@playwright/test";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import ru from "../../src/i18n/messages/ru.json" with { type: "json" };
import uz from "../../src/i18n/messages/uz.json" with { type: "json" };

// 01-summary.md, Quality bar: "checked at phone width (375 px) and desktop width (1440 px)".
// 15-quality-and-acceptance.md, Done-check: "New screens were opened at 375 px and 1440 px widths."
// 02-assumptions.md A2: each user picks one of three languages; Uzbek is the default.
// 11-screens-and-ux.md rule 14: every label comes from the translation files.
// Build-plan 0.5: no language in the address; the start page shows in all three languages.
// The two widths are the two projects of playwright.config.ts.

const LANGUAGES = [
  { locale: "uz", messages: uz, cookie: false },
  { locale: "ru", messages: ru, cookie: true },
  { locale: "en", messages: en, cookie: true },
] as const;

for (const { locale, messages, cookie } of LANGUAGES) {
  test(`the start page shows in ${locale}${cookie ? " from the locale cookie" : " by default"} and fits the screen (A2; 11-screens rule 14)`, async ({
    page,
    context,
    baseURL,
  }) => {
    if (cookie) {
      await context.addCookies([{ name: "locale", value: locale, url: baseURL ?? "" }]);
    }
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: messages.start.title })).toBeVisible();
    await expect(page.getByText(messages.start.notice)).toBeVisible();
    await expect(page).toHaveTitle(messages.start.title);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    expect(new URL(page.url()).pathname).toBe("/");

    const sizes = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      screen: document.documentElement.clientWidth,
    }));
    expect(sizes.content).toBeLessThanOrEqual(sizes.screen);
  });
}

test("a cookie that is not one of the three languages shows Uzbek (A2)", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: "locale", value: "de", url: baseURL ?? "" }]);
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: uz.start.title })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "uz");
});
