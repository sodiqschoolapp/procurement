import type { Permission } from "@/domain/permissions";

// Every way in, listed (developer-rules.md rule 4: "Every server action and query calls the same
// authorize() function"; plan of 0.7). tests/permission-registry.test.ts turns red when a server
// action, a query or a page that skips the sign-in check is not listed here. A later task adds
// its actions and queries with the permission they ask authorize() for, and a matrix test with
// describePermissionMatrix() (tests/helpers/permission-matrix.ts).

/** `OPEN`: runs before a user is known, or ends the caller's own session only. */
type Entry = Permission | "OPEN";

/** Exports of `"use server"` files, as `<file>#<export>`. */
export const SERVER_ACTIONS: Record<string, Entry> = {
  // Decisions 0.6, item 3 (Look first): no authorize(), outside the action wrapper.
  "src/app/login/actions.ts#signInAction": "OPEN",
  "src/app/login/actions.ts#signOutAction": "OPEN",
  "src/app/login/actions.ts#chooseLanguageAction": "OPEN",
  // One's own language and branch view (plan of 0.10b, decisions 1 and 3, Look first).
  "src/app/(app)/profile/actions.ts#chooseOwnLanguageAction": "profile.edit",
  // "all" asks profile.edit; a branch id asks data.view on that branch, proved by the matrix
  // test "chooseBranch with a branch" (permission review of 0.10b, Must fix 1).
  "src/app/(app)/branch-actions.ts#chooseBranchAction": "profile.edit",
  // One's own notifications (plan of 0.11, decision 2, Look first).
  "src/app/(app)/notifications/actions.ts#openNotificationAction": "notification.own",
  "src/app/(app)/notifications/actions.ts#markAllNotificationsReadAction": "notification.own",
  // "Manage catalogs, users, branches, settings" (03; plan of 1.1).
  "src/app/(app)/settings/actions.ts#saveSettingsAction": "catalog.manage",
  // The Head's branches (plan of 1.2).
  "src/app/(app)/branches/actions.ts#createBranchAction": "catalog.manage",
  "src/app/(app)/branches/actions.ts#updateBranchAction": "catalog.manage",
  "src/app/(app)/branches/actions.ts#setBranchActiveAction": "catalog.manage",
  // The Head's users (plan of 1.3).
  "src/app/(app)/users/actions.ts#createUserAction": "catalog.manage",
  "src/app/(app)/users/actions.ts#updateUserAction": "catalog.manage",
  "src/app/(app)/users/actions.ts#setUserActiveAction": "catalog.manage",
  "src/app/(app)/users/actions.ts#renewUserPasswordAction": "catalog.manage",
  // "Switch a Manager's rights on or off" (03; plan of 1.4).
  "src/app/(app)/users/actions.ts#switchManagerRightAction": "manager_rights.switch",
  // The Head's measures, categories, extra cost types and companies (plan of 1.5).
  "src/app/(app)/catalog/actions.ts#createCatalogEntryAction": "catalog.manage",
  "src/app/(app)/catalog/actions.ts#updateCatalogEntryAction": "catalog.manage",
  "src/app/(app)/catalog/actions.ts#setCatalogEntryActiveAction": "catalog.manage",
  // The Head's departments (plan of 1.6).
  "src/app/(app)/catalog/departments/actions.ts#createDepartmentAction": "catalog.manage",
  "src/app/(app)/catalog/departments/actions.ts#updateDepartmentAction": "catalog.manage",
  "src/app/(app)/catalog/departments/actions.ts#setDepartmentActiveAction": "catalog.manage",
  // The Head's products and services (plan of 1.7).
  "src/app/(app)/catalog/products/actions.ts#createProductAction": "catalog.manage",
  "src/app/(app)/catalog/products/actions.ts#updateProductAction": "catalog.manage",
  "src/app/(app)/catalog/products/actions.ts#setProductActiveAction": "catalog.manage",
  // The Head's subtypes of a product (plan of 1.8).
  "src/app/(app)/catalog/products/[id]/subtypes/actions.ts#createSubtypeAction": "catalog.manage",
  "src/app/(app)/catalog/products/[id]/subtypes/actions.ts#updateSubtypeAction": "catalog.manage",
  "src/app/(app)/catalog/products/[id]/subtypes/actions.ts#setSubtypeActiveAction":
    "catalog.manage",
  // "Add a new price for a product": the Head only (03; plan of 1.9, decision 4, Look first).
  "src/app/(app)/prices/actions.ts#addPriceAction": "price.add",
  // The Head's Excel import of products and departments (plan of 1.10): the permission is checked
  // before the file is read (plan review, correction 1).
  "src/app/(app)/catalog/import/actions.ts#previewImportAction": "catalog.manage",
  "src/app/(app)/catalog/import/actions.ts#saveImportAction": "catalog.manage",
  // Product suggestions (plan of 1.12, decisions 1 and 2, Look first): suggesting is
  // catalog.suggest on the branch; adding and declining are the Head's catalog.manage.
  "src/app/(app)/suggestions/actions.ts#suggestProductAction": "catalog.suggest",
  "src/app/(app)/suggestions/actions.ts#addSuggestedProductAction": "catalog.manage",
  "src/app/(app)/suggestions/actions.ts#declineSuggestionAction": "catalog.manage",
  // The drafts grid on /orders (plan of 2.5b, review of the plan, Must fix 7): each export is in
  // the permission matrix through itself (src/app/(app)/orders/actions-matrix.db.test.ts), beside
  // the 2.5a definitions' own (drafts-matrix.db.test.ts; permission review of 2.5b).
  "src/app/(app)/orders/actions.ts#createDraftAction": "request.create",
  "src/app/(app)/orders/actions.ts#updateDraftAction": "request.edit",
  "src/app/(app)/orders/actions.ts#deleteDraftAction": "request.edit",
  "src/app/(app)/orders/actions.ts#setDraftsNeededByAction": "request.edit",
  "src/app/(app)/orders/actions.ts#searchDraftProductsAction": "request.create",
  "src/app/(app)/orders/actions.ts#listDraftChoicesAction": "request.create",
  "src/app/(app)/orders/actions.ts#getDraftAction": "data.view",
  // Submit of ticked drafts (plan of 2.7): the state machine's SUBMIT move under request.edit
  // (src/domain/order-moves.ts), in the matrix through describeSubmitMatrix.
  "src/app/(app)/orders/actions.ts#submitDraftsAction": "request.edit",
};

/** Exports of `src/features/<area>/queries/`, as `<file>#<export>`. */
export const QUERIES: Record<string, Permission> = {
  // The change history of one record: Head only (plan of 0.9, decision 3, Look first).
  "src/features/audit/queries/change-history.ts#listChangeHistory": "catalog.manage",
  // The branches of the top bar's branch view (plan of 0.10b).
  "src/features/catalog/queries/my-branches.ts#listMyBranches": "profile.edit",
  "src/features/catalog/queries/my-branches.ts#currentBranchChoice": "profile.edit",
  // The Head's branch list and one branch (plan of 1.2).
  "src/features/catalog/queries/branches.ts#listBranches": "catalog.manage",
  "src/features/catalog/queries/branches.ts#getBranch": "catalog.manage",
  // The four small catalogs: the Head's list, one entry, the counts of /catalog (plan of 1.5,
  // review correction 2), and the picker of every role (decision 2, Look first).
  "src/features/catalog/queries/catalog-entries.ts#listCatalogEntries": "catalog.manage",
  "src/features/catalog/queries/catalog-entries.ts#getCatalogEntry": "catalog.manage",
  "src/features/catalog/queries/catalog-entries.ts#countActiveCatalogEntries": "catalog.manage",
  "src/features/catalog/queries/catalog-entries.ts#listCatalogChoices": "catalog.pick",
  // Departments: the Head's list and one department (plan of 1.6).
  "src/features/catalog/queries/departments.ts#listDepartments": "catalog.manage",
  "src/features/catalog/queries/departments.ts#getDepartment": "catalog.manage",
  // Products: the Head's list, one product, the form's choices and the category filter (1.7).
  "src/features/catalog/queries/products.ts#listProducts": "catalog.manage",
  "src/features/catalog/queries/products.ts#getProduct": "catalog.manage",
  "src/features/catalog/queries/products.ts#listProductChoices": "catalog.manage",
  "src/features/catalog/queries/products.ts#listCategoryFilter": "catalog.manage",
  // Subtypes: a product's real subtypes and one subtype (1.8).
  "src/features/catalog/queries/subtypes.ts#listSubtypes": "catalog.manage",
  "src/features/catalog/queries/subtypes.ts#getSubtype": "catalog.manage",
  // Prices: the Admin list and one subtype's price history (plan of 1.9, decision 4, Look first).
  "src/features/catalog/queries/prices.ts#listPrices": "catalog.manage",
  "src/features/catalog/queries/prices.ts#getPriceHistory": "catalog.manage",
  // Product suggestions: the list and one suggestion under the branch wall, the Head's count of
  // pending ones for /catalog (plan of 1.12, decision 1, Look first).
  "src/features/catalog/queries/suggestions.ts#listSuggestions": "catalog.suggest",
  "src/features/catalog/queries/suggestions.ts#getSuggestion": "catalog.suggest",
  "src/features/catalog/queries/suggestions.ts#countPendingSuggestions": "catalog.manage",
  // The preview of an Excel import (plan of 1.10).
  "src/features/catalog/queries/imports.ts#previewImport": "catalog.manage",
  // The Head's users, the vacancy warning and the form's branches (plan of 1.3).
  "src/features/users/queries/users.ts#listUsers": "catalog.manage",
  "src/features/users/queries/users.ts#getUser": "catalog.manage",
  "src/features/users/queries/users.ts#getManagerRights": "manager_rights.switch",
  "src/features/users/queries/users.ts#listBranchVacancies": "catalog.manage",
  "src/features/users/queries/users.ts#listBranchChoices": "catalog.manage",
  // The bell and /notifications (plan of 0.11, decision 2, Look first).
  "src/features/notifications/queries/my-notifications.ts#listMyNotifications": "notification.own",
  "src/features/notifications/queries/my-notifications.ts#countMyUnread": "notification.own",
  // The drafts grid (plan of 2.5a, decided item 9, Look first): its rows under data.view with the
  // draft wall, Principal and Finance refused the list; the picker and the grid's choices under
  // request.create on the branch, as they show that branch's stock and departments.
  "src/features/orders/queries/drafts.ts#listDrafts": "data.view",
  "src/features/orders/queries/drafts.ts#getDraft": "data.view",
  "src/features/orders/queries/draft-picker.ts#searchDraftProducts": "request.create",
  "src/features/orders/queries/draft-picker.ts#listDraftChoices": "request.create",
  // The numbers of just-submitted orders for the Submit message (plan of 2.7): data.view with
  // the branch inside the SQL; a draft has no number, so nothing behind the draft wall is read.
  "src/features/orders/queries/submitted.ts#submittedNumbers": "data.view",
  // The download route's file: file.upload for a file no record holds; each owner a later task
  // adds to src/server/files/owners.ts names its own permission there (plan of 0.12, decision 5).
  "src/features/files/queries/file-for-download.ts#fileForDownload": "file.upload",
  // The Head's settings form, and the school name of the shell for every role (plan of 1.1,
  // decision 4, Look first).
  "src/features/settings/queries/settings.ts#getSettingsForHead": "catalog.manage",
  "src/features/settings/queries/settings.ts#getSchoolName": "profile.edit",
};

/**
 * Pages, layouts and routes open to a signed-out visitor (progress 0.16 and 0.6). Every other
 * `page`, `layout` and `route` file, and every special route file (`opengraph-image`, `sitemap`
 * and the like), calls requireUser() or authorize() itself.
 */
export const OPEN_ROUTES: readonly string[] = [
  "src/app/login/page.tsx",
  // The health check of the host (0.16).
  "src/app/health/route.ts",
  // The root layout reads the session for the language only and shows no data (0.5, 0.6).
  "src/app/layout.tsx",
];

export type SourceFile = { path: string; text: string };

/** The names a module exports: functions, constants and `export { a, b }`. */
export function exportedNames(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(
    /^export\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?|const|let)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.add(match[1]!);
  }
  for (const match of text.matchAll(/^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/gm)) {
    if (!["async", "function", "class"].includes(match[1]!)) names.add("default");
  }
  for (const match of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of match[1]!.split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (name) names.add(name);
    }
  }
  return [...names];
}

/** Whether a file starts with the `"use server"` directive (comments before it allowed). */
export function isServerActionFile(text: string): boolean {
  const code = text.replace(/^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, "");
  return /^["']use server["']/.test(code);
}

/** A `"use server"` inside a function: an inline action, which has no place in the registry. */
export function hasInlineServerAction(text: string): boolean {
  return /\{\s*(\/\/[^\n]*\n\s*)*["']use server["']/.test(text);
}

// Route files of the App Router that answer a request: pages, layouts, routes, and the special
// files that render metadata (Next.js 16, file conventions).
const ROUTE_FILE =
  /^src\/app\/(.*\/)?(page|layout|route|template|default|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)\.tsx?$/;

/** What is not listed: unlisted server actions and queries, and pages that are open by mistake. */
export function unlisted(files: readonly SourceFile[]): string[] {
  const missing: string[] = [];
  for (const { path, text } of files) {
    if (/\.test\.tsx?$/.test(path)) continue;
    if (isServerActionFile(text)) {
      for (const name of exportedNames(text)) {
        if (!(`${path}#${name}` in SERVER_ACTIONS)) missing.push(`server action ${path}#${name}`);
      }
    }
    if (/^src\/features\/[^/]+\/queries\//.test(path)) {
      for (const name of exportedNames(text)) {
        if (!(`${path}#${name}` in QUERIES)) missing.push(`query ${path}#${name}`);
      }
    }
    if (hasInlineServerAction(text)) {
      // Actions live in their own "use server" files, where this registry sees them.
      missing.push(`inline server action ${path}`);
    }
    if (ROUTE_FILE.test(path)) {
      // Comments do not count as a check.
      const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      const checks = /\b(requireUser|authorize)\(/.test(code);
      if (!checks && !OPEN_ROUTES.includes(path)) missing.push(`open route ${path}`);
    }
  }
  return missing;
}
