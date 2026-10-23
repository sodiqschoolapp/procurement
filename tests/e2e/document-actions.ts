import type { Page } from "@playwright/test";

// The new-document buttons of Stock on hand and the documents list: from 640 px each is a link;
// on a phone the first stands alone and the others open from "More"
// (src/features/warehouse/components/document-actions.tsx; redesign of 22.10.2026).

/**
 * Opens a new document by its button's words. Below 640 px, with three or more actions, every one
 * but the first opens from More. Decided by the width and the button's place once the actions are
 * on the page, never by what is visible at one instant: a page still drawing would read as folded
 * (CI of 9847cc8).
 */
export async function clickDocumentAction(page: Page, name: string): Promise<void> {
  const actions = page.locator("[data-document-action]");
  await actions.first().waitFor({ state: "attached" });
  const phone = (page.viewportSize()?.width ?? 1440) < 640;
  const first = (await actions.first().textContent())?.trim() === name;
  if (phone && (await actions.count()) > 2 && !first) {
    await page.locator("[data-document-more]").click();
    await page.getByRole("menuitem", { name, exact: true }).click();
    return;
  }
  await page.getByRole("link", { name, exact: true }).click();
}

/** The button of one document type, shown or folded: its count says whether the user has it. */
export function documentAction(page: Page, type: string) {
  return page.locator(`[data-document-action="${type}"]`);
}
