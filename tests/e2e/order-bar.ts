import { type Locator, type Page, expect } from "@playwright/test";

// The order page's action bar since 2.9b (11-screens-and-ux.md, Order page layout 4: "the main
// next action this user can take as one button, and the user's other actions now under More").
// A test reaches an action the same way wherever it sits: the main one directly, any other after
// "More" is opened. What is checked about the action does not change (plan of 2.9b, decided item
// 6, Look first).

/** The order page's bar. */
export function orderBar(page: Page): Locator {
  return page.locator("[data-order-bar]");
}

/** Opens "More" when it is there and closed. */
export async function openMore(page: Page): Promise<void> {
  const more = orderBar(page).locator("[data-bar-more]");
  if ((await more.count()) === 0) return;
  if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
}

/**
 * One action of the bar, reachable: `target` is a selector inside the bar or a locator of it. The
 * action must be offered; under "More" it is opened first.
 */
export async function barAction(page: Page, target: string | Locator): Promise<Locator> {
  const action = typeof target === "string" ? orderBar(page).locator(target) : target;
  await action.first().waitFor({ state: "attached" });
  if (!(await action.first().isVisible())) await openMore(page);
  await expect(action.first()).toBeVisible();
  return action;
}
