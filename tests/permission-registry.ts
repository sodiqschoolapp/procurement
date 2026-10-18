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
  // Approve of ticked orders (plan of 2.10, decided item 1, Look first): one action for the three
  // steps, so the permission depends on each order's status: request.approve_step1 at Waiting for
  // Head, request.approve_step2 at Waiting for Principal, request.approve_step3 at Waiting for
  // Finance (the state machine's rows, src/domain/order-moves.ts). The entry names step 1 only
  // because the registry takes one; all three are in the matrix through actions-matrix.db.test.ts
  // (permission review of 2.10, Should fix 1).
  "src/app/(app)/orders/actions.ts#approveOrdersAction": "request.approve_step1",
  // Send back and Reject (plan of 2.11): one action for the three steps, as Approve; the entry
  // names step 1, all three are in the matrix through actions-matrix.db.test.ts. Cancel, Take
  // back and Submit again: request.edit, the last two the owner's only (decisions 2.3 item 5).
  "src/app/(app)/orders/actions.ts#sendBackOrdersAction": "request.approve_step1",
  "src/app/(app)/orders/actions.ts#rejectOrdersAction": "request.approve_step1",
  "src/app/(app)/orders/actions.ts#cancelOrdersAction": "request.edit",
  "src/app/(app)/orders/actions.ts#takeBackOrdersAction": "request.edit",
  "src/app/(app)/orders/actions.ts#submitAgainOrdersAction": "request.edit",
  "src/app/(app)/orders/actions.ts#copyOrdersAsNewAction": "request.create",
  // The order list on /orders (plan of 2.8): each export in the matrix through itself.
  "src/app/(app)/orders/actions.ts#selectAllOnFilterAction": "data.view",
  "src/app/(app)/orders/actions.ts#tickedSummaryAction": "data.view",
  // Record purchases (03; plan of 3.3): the Head, the owner with RECORD_PURCHASES on.
  "src/app/(app)/orders/[id]/purchase/actions.ts#recordPurchaseAction": "purchase.record",
  // Issue to a department (plan of 5.4): stock.issue on the branch (issue-matrix.db.test.ts).
  "src/app/(app)/warehouse/documents/new/actions.ts#issueStockAction": "stock.issue",
  "src/app/(app)/warehouse/documents/new/actions.ts#issueFormChoicesAction": "stock.issue",
  "src/app/(app)/warehouse/documents/new/actions.ts#searchIssueItemsAction": "stock.issue",
  // Return from a department (plan of 5.6, decided item 4, Look first): stock.return_reverse on
  // the branch (return-matrix.db.test.ts).
  "src/app/(app)/warehouse/documents/new/actions.ts#returnStockAction": "stock.return_reverse",
  "src/app/(app)/warehouse/documents/new/actions.ts#returnFormChoicesAction":
    "stock.return_reverse",
  "src/app/(app)/warehouse/documents/new/actions.ts#searchReturnItemsAction":
    "stock.return_reverse",
  // Direct entry by the Head (plan of 5.8): stock.enter_direct on the branch
  // (direct-entry-matrix.db.test.ts).
  "src/app/(app)/warehouse/documents/new/actions.ts#enterStockDirectlyAction": "stock.enter_direct",
  "src/app/(app)/warehouse/documents/new/actions.ts#searchDirectEntryItemsAction":
    "stock.enter_direct",
  // Reverse an issue or a return (plan of 5.7): stock.return_reverse on the document's branch,
  // then its creator or the Head (reverse-matrix.db.test.ts).
  "src/app/(app)/warehouse/items/[id]/actions.ts#reverseStockDocumentAction":
    "stock.return_reverse",
  "src/app/(app)/warehouse/items/[id]/actions.ts#reversePreviewAction": "stock.return_reverse",
  // Ask for a write-off (plan of 5.11): stock.ask_write_off on the branch
  // (write-off-matrix.db.test.ts).
  "src/app/(app)/warehouse/documents/new/actions.ts#askWriteOffAction": "stock.ask_write_off",
  "src/app/(app)/warehouse/documents/new/actions.ts#searchWriteOffItemsAction":
    "stock.ask_write_off",
  // Approve or refuse a write-off (plan of 5.11): the Head (write-off-matrix.db.test.ts).
  "src/app/(app)/warehouse/documents/[id]/actions.ts#decideWriteOffAction":
    "stock.approve_write_off",
  // Set or clear a minimum (plan of 5.10): stock.set_minimums on the branch
  // (minimum-matrix.db.test.ts).
  "src/app/(app)/warehouse/items/[id]/actions.ts#setStockMinimumAction": "stock.set_minimums",
  "src/app/(app)/warehouse/stock/actions.ts#setStockMinimumAction": "stock.set_minimums",
  // Finish order, Not bought, Reopen buying (plan of 3.5, decided item 2, Look first): the same.
  "src/app/(app)/orders/actions.ts#finishOrdersAction": "purchase.record",
  "src/app/(app)/orders/actions.ts#markNotBoughtAction": "purchase.record",
  "src/app/(app)/orders/actions.ts#reopenBuyingAction": "purchase.record",
  // Close of exact matches and Send to settlement (06 Allowed moves, the two rows from Open; plan
  // of 4.4).
  "src/app/(app)/orders/actions.ts#closeExactOrdersAction": "request.close_exact",
  "src/app/(app)/orders/actions.ts#sendToSettlementOrdersAction": "request.send_to_settlement",
  // Cancel record and Cancel trip (plan of 3.7, decided item 5, Look first).
  "src/app/(app)/orders/actions.ts#cancelPurchaseAction": "purchase.cancel",
  "src/app/(app)/orders/actions.ts#cancelTripAction": "purchase.cancel",
  "src/app/(app)/orders/actions.ts#recordMoneyAction": "money.record",
  "src/app/(app)/orders/actions.ts#cancelMoneyAction": "money.record",
  "src/app/(app)/orders/actions.ts#moneyPrefillAction": "data.view",
  "src/app/(app)/orders/actions.ts#settleCashAction": "request.settle",
  "src/app/(app)/orders/actions.ts#confirmSettlementAction": "request.settle",
  "src/app/(app)/orders/actions.ts#sendBackForCorrectionOrdersAction": "request.settle",
  // Finance's Close (06 Allowed moves, "Waiting for settlement | Close"; plan of 4.6).
  "src/app/(app)/orders/actions.ts#closeOrdersAction": "request.settle",
  // The Head's Reopen (06 Allowed moves, "Closed | Reopen | Head"; plan of 4.8).
  "src/app/(app)/orders/actions.ts#reopenOrdersAction": "request.reopen",
  "src/app/(app)/orders/actions.ts#acknowledgeOverspendAction": "request.acknowledge_overspend",
  // Move orders to another Manager and its Manager choices (03 rule 7; plan of 4.10).
  "src/app/(app)/orders/actions.ts#moveOrdersToManagerAction": "request.move_owner",
  "src/app/(app)/orders/actions.ts#moveOwnerChoicesAction": "request.move_owner",
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
  "src/features/catalog/queries/price-prompts.ts#getPricePrompts": "catalog.manage",
  // Product suggestions: the list and one suggestion under the branch wall, the Head's count of
  // pending ones for /catalog (plan of 1.12, decision 1, Look first).
  "src/features/catalog/queries/suggestions.ts#listSuggestions": "catalog.suggest",
  "src/features/catalog/queries/suggestions.ts#getSuggestion": "catalog.suggest",
  "src/features/catalog/queries/suggestions.ts#countPendingSuggestions": "catalog.manage",
  // The preview of an Excel import (plan of 1.10); each kind asks its own permission
  // (IMPORT_PERMISSIONS): prices price.add (1.11), stock stock.enter_direct on its branch (5.9).
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
  // the branch and the draft wall inside the SQL (a taken-back DRAFT keeps its number).
  "src/features/orders/queries/submitted.ts#submittedNumbers": "data.view",
  // The order list on /orders (plan of 2.8): data.view with the branch and the draft wall in the
  // SQL (src/features/orders/queries/order-list.db.test.ts and its matrix test).
  "src/features/orders/queries/order-list.ts#listOrderGroups": "data.view",
  "src/features/orders/queries/order-list.ts#selectAllOnFilter": "data.view",
  "src/features/orders/queries/order-list.ts#tickedSummary": "data.view",
  "src/features/orders/queries/order-list.ts#listOrderFilterChoices": "data.view",
  // The home pages' list numbers (plan of 6.1): the list's walls and filters in the SQL.
  "src/features/orders/queries/order-list.ts#orderTotalsOnFilter": "data.view",
  "src/features/orders/queries/order-list.ts#countOrdersByStatus": "data.view",
  // The orders of a filter with their plans, for the Head's and Finance's homes (plan of 6.2).
  "src/features/orders/queries/order-list.ts#ordersOnFilter": "data.view",
  // The Manager's and the Principal's home (plan of 6.1): data.view, own orders or the branch,
  // behind the order list's walls (src/features/home/queries/home-matrix.db.test.ts).
  "src/features/home/queries/manager-home.ts#getManagerHome": "data.view",
  "src/features/home/queries/principal-home.ts#getPrincipalHome": "data.view",
  // The Head's and Finance's home (plan of 6.2): each under its own approval step, the overspends,
  // write-offs and settlements also under their own rights, behind the list's walls.
  "src/features/home/queries/head-home.ts#getHeadHome": "request.approve_step1",
  "src/features/home/queries/finance-home.ts#getFinanceHome": "request.approve_step3",
  // The Analytics page (plan of 6.3): data.view, the branch wall and the filters in the SQL of
  // spendingWhere() (src/features/analytics/queries/analytics-matrix.db.test.ts).
  "src/features/analytics/queries/filters.ts#getAnalyticsFilters": "data.view",
  "src/features/analytics/queries/spending.ts#getSpending": "data.view",
  "src/features/analytics/queries/spending-records.ts#getSpendingRecords": "data.view",
  // The Head's blocks of 6.4a: data.view, the walls in spendingWhere() and outcomesWhere().
  "src/features/analytics/queries/head-spending.ts#getHeadSpending": "data.view",
  "src/features/analytics/queries/plan-vs-actual.ts#getPlanVsActual": "data.view",
  "src/features/analytics/queries/outcome-orders.ts#getOutcomeOrders": "data.view",
  // The Head's blocks of 6.4b: data.view, the walls in spendingWhere() and stepsWhere().
  "src/features/analytics/queries/prices.ts#getPrices": "data.view",
  "src/features/analytics/queries/prices.ts#getPriceChoices": "data.view",
  "src/features/analytics/queries/approval-speed.ts#getApprovalSpeed": "data.view",
  "src/features/analytics/queries/approval-orders.ts#getApprovalOrders": "data.view",
  // The Head's Managers block of 6.4c: data.view, the walls in outcomesWhere(), cancelledWhere()
  // and cashWhere().
  "src/features/analytics/queries/managers.ts#getManagers": "data.view",
  "src/features/analytics/queries/cancelled-records.ts#getCancelledRecords": "data.view",
  "src/features/analytics/queries/cash-orders.ts#getCashOrders": "data.view",
  // The Head's Warehouse block of 6.4d: data.view, the walls in stockWhere() and movesWhere().
  "src/features/analytics/queries/warehouse.ts#getWarehouse": "data.view",
  "src/features/analytics/queries/stock-lines.ts#getStockLines": "data.view",
  "src/features/analytics/queries/stock-moves.ts#getStockMoves": "data.view",
  // The Principal's blocks of 6.5a: data.view, the walls in spendingWhere(), ordersWhere() and
  // stepsWhere().
  "src/features/analytics/queries/top-products.ts#getTopProducts": "data.view",
  "src/features/analytics/queries/order-statuses.ts#getOrderStatuses": "data.view",
  "src/features/analytics/queries/status-orders.ts#getStatusOrders": "data.view",
  "src/features/analytics/queries/my-approvals.ts#getMyApprovals": "data.view",
  "src/features/analytics/queries/my-orders.ts#getMyOrders": "data.view",
  "src/features/analytics/queries/my-estimates.ts#getMyEstimates": "data.view",
  "src/features/analytics/queries/my-cash.ts#getMyCash": "data.view",
  // The order list's download, Excel and PDF (plan of 2.14, decided item 4, Look first): data.export
  // with the list's own walls in the SQL (queries/order-download-matrix.db.test.ts).
  "src/features/orders/queries/order-list.ts#orderDownload": "data.export",
  // The order page /orders/[id] (plan of 2.9): data.view with the branch and the draft wall in
  // the SQL (src/features/orders/queries/order-page.db.test.ts and its matrix test).
  "src/features/orders/queries/order-page.ts#getOrderPage": "data.view",
  // Who approved a refused order meanwhile (plan of 2.10, decided item 3, Look first): data.view
  // with the branch and the draft wall in the SQL.
  "src/features/orders/queries/newest-moves.ts#newestMoves": "data.view",
  // The download route's file: file.upload for a file no record holds; each owner a later task
  // adds to src/server/files/owners.ts names its own permission there (plan of 0.12, decision 5).
  "src/features/files/queries/file-for-download.ts#fileForDownload": "file.upload",
  // The Head's settings form, and the school name of the shell for every role (plan of 1.1,
  // decision 4, Look first).
  "src/features/settings/queries/settings.ts#getSettingsForHead": "catalog.manage",
  "src/features/settings/queries/settings.ts#getSchoolName": "profile.edit",
  // The purchase form (plan of 3.3): data.view with the branch wall in the SQL, then
  // purchase.record on the order (record-purchase-matrix.db.test.ts).
  "src/features/purchasing/queries/purchase-form.ts#getPurchaseForm": "purchase.record",
  "src/features/money/queries/money-prefill.ts#moneyPrefillOrders": "data.view",
  "src/features/orders/queries/move-owner-choices.ts#moveOwnerChoices": "request.move_owner",
  "src/features/money/queries/order-money.ts#getOrderMoney": "data.view",
  "src/features/money/queries/settlement.ts#getSettlement": "request.settle",
  // Money with managers (plan of 4.9, decided item 1, Look first).
  "src/features/money/queries/money-with-managers.ts#getMoneyWithManagers": "money.managers",
  // Stock on hand (plan of 5.2): data.view with the branch wall in the SQL.
  "src/features/warehouse/queries/item-card.ts#getItemCard": "data.view",
  "src/features/warehouse/queries/stock-on-hand.ts#listStockOnHand": "data.view",
  "src/features/warehouse/queries/stock-on-hand.ts#stockCategoryChoices": "data.view",
  // The issue form's choices (plan of 5.4): stock.issue on the branch; the branches in the SQL.
  "src/features/warehouse/queries/issue-form.ts#issueBranchChoices": "stock.issue",
  "src/features/warehouse/queries/issue-form.ts#issueFormChoices": "stock.issue",
  "src/features/warehouse/queries/issue-form.ts#searchIssueItems": "stock.issue",
  // The write-off form (plan of 5.11): stock.ask_write_off; the branches in the SQL.
  "src/features/warehouse/queries/issue-form.ts#writeOffBranchChoices": "stock.ask_write_off",
  "src/features/warehouse/queries/issue-form.ts#searchWriteOffItems": "stock.ask_write_off",
  // A document's page (plans of 5.11 and 5.12) and the documents list (plan of 5.12): data.view
  // with the branch wall in the SQL.
  "src/features/warehouse/queries/document.ts#getStockDocument": "data.view",
  "src/features/warehouse/queries/documents.ts#listStockDocuments": "data.view",
  "src/features/warehouse/queries/documents.ts#documentDepartmentChoices": "data.view",
  "src/features/warehouse/queries/direct-entry-form.ts#directEntryBranchChoices":
    "stock.enter_direct",
  "src/features/warehouse/queries/direct-entry-form.ts#searchDirectEntryItems":
    "stock.enter_direct",
  "src/features/warehouse/queries/return-form.ts#returnBranchChoices": "stock.return_reverse",
  "src/features/warehouse/queries/return-form.ts#returnFormChoices": "stock.return_reverse",
  "src/features/warehouse/queries/return-form.ts#searchReturnItems": "stock.return_reverse",
  "src/features/warehouse/queries/reverse-preview.ts#getReversePreview": "stock.return_reverse",
  // The issue note PDF (plan of 5.4, decided item 8): data.view's branch filter in the SQL, then
  // data.export on the document's branch.
  "src/features/warehouse/queries/issue-note.ts#getIssueNote": "data.export",
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
      // authorizeList() is authorize() for a list, which names no branch (the order download, 2.14).
      const checks = /\b(requireUser|authorize|authorizeList)\(/.test(code);
      if (!checks && !OPEN_ROUTES.includes(path)) missing.push(`open route ${path}`);
    }
  }
  return missing;
}
