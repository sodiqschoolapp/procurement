import { expect, test } from "@playwright/test";

import messages from "../../src/i18n/messages/uz.json" with { type: "json" };

// 01-summary.md, Quality bar: "checked at phone width (375 px) and desktop width (1440 px)".
// 15-quality-and-acceptance.md, Done-check: "New screens were opened at 375 px and 1440 px widths."
// 11-screens-and-ux.md, rule 14: every label comes from the translation files; Uzbek is the default (A2).
// The two widths are the two projects of playwright.config.ts.

test("the start page shows its Uzbek title and fits the screen (01-summary Quality bar; 11-screens rule 14)", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: messages.start.title })).toBeVisible();
  await expect(page.getByText(messages.start.notice)).toBeVisible();
  await expect(page).toHaveTitle(messages.start.title);
  await expect(page.locator("html")).toHaveAttribute("lang", "uz");

  const sizes = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.screen);
});
