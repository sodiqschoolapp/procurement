import type { Page } from "@playwright/test";

// The new-document buttons of Stock on hand and the documents list: from 640 px each is a link;
// on a phone the first stands alone and the others open from "More"
// (src/features/warehouse/components/document-actions.tsx; redesign of 22.10.2026).

/** Opens a new document by its button's words, through More when the button is folded. */
export async function clickDocumentAction(page: Page, name: string): Promise<void> {
  const link = page.getByRole("link", { name, exact: true });
  if (await link.isVisible()) {
    await link.click();
    return;
  }
  await page.locator("[data-document-more]").click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

/** The button of one document type, shown or folded: its count says whether the user has it. */
export function documentAction(page: Page, type: string) {
  return page.locator(`[data-document-action="${type}"]`);
}
