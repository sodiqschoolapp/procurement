import { type ManagerRight, type Permission, ROLES, type Role } from "@/domain/permissions";

// The permission matrix of docs/spec/03-roles-and-permissions.md, written out a second time by
// hand, row by row, as the oracle of the matrix tests. It is never read from PERMISSIONS of
// src/domain/permissions.ts: a wrong entry there must turn a test red (plan of 0.7, "What will
// exist"). Each line quotes its row of the spec; the splits are decision 3 of the plan of 0.7.
//
// "no": refused; "yes": allowed (no branch); "all": every branch; "own": own branches;
// "owner": own branches, own requests. `right`: the Manager right that guards the Manager's "Yes".

type Expected = {
  row: string;
  HEAD: string;
  MANAGER: string;
  PRINCIPAL: string;
  FINANCE: string;
  right?: ManagerRight;
};

export const EXPECTED_MATRIX: Record<Permission, Expected> = {
  "catalog.manage": {
    row: "Manage catalogs, users, branches, settings",
    HEAD: "yes",
    MANAGER: "no",
    PRINCIPAL: "no",
    FINANCE: "no",
  },
  "catalog.suggest": {
    row: "Suggest a new product for the catalog",
    HEAD: "all",
    MANAGER: "own",
    PRINCIPAL: "no",
    FINANCE: "no",
  },
  "catalog.pick": {
    row: "Pick from the catalogs (not a row of 03; plan of 1.5, decision 2, Look first)",
    HEAD: "yes",
    MANAGER: "yes",
    PRINCIPAL: "yes",
    FINANCE: "yes",
  },
  "request.create": {
    row: "Create, edit, submit, cancel a request (create)",
    HEAD: "all",
    MANAGER: "own",
    PRINCIPAL: "no",
    FINANCE: "no",
    right: "CREATE_REQUESTS",
  },
  "request.edit": {
    row: "Create, edit, submit, cancel a request (edit, submit, cancel, take back: 03 rule 7, 06 Allowed moves)",
    HEAD: "all",
    MANAGER: "owner",
    PRINCIPAL: "no",
    FINANCE: "no",
    right: "CREATE_REQUESTS",
  },
  "request.approve_step1": {
    row: "Approve, send back or reject at step 1",
    HEAD: "all",
    MANAGER: "no",
    PRINCIPAL: "no",
    FINANCE: "no",
  },
  "request.approve_step2": {
    row: "Approve, send back or reject at step 2",
    HEAD: "no",
    MANAGER: "no",
    PRINCIPAL: "own",
    FINANCE: "no",
  },
  "request.approve_step3": {
    row: "Approve, send back or reject at step 3",
    HEAD: "no",
    MANAGER: "no",
    PRINCIPAL: "no",
    FINANCE: "own",
  },
  "money.record": {
    row: "Record money given, returned, paid back",
    HEAD: "no",
    MANAGER: "no",
    PRINCIPAL: "no",
    FINANCE: "own",
  },
  // Not a row of 03: 11 Screens, "Money with managers | /money | Finance, Head" (plan of 4.9,
  // decided item 1, Look first).
  "money.managers": {
    row: "Money with managers (11 Screens)",
    HEAD: "all",
    MANAGER: "no",
    PRINCIPAL: "no",
    FINANCE: "own",
  },
  "purchase.record": {
    row: "Record purchases",
    HEAD: "all",
    MANAGER: "owner",
    PRINCIPAL: "no",
    FINANCE: "no",
    right: "RECORD_PURCHASES",
  },
  "purchase.cancel": {
    row: "Cancel purchase records (Manager rights: CANCEL_PURCHASES)",
    HEAD: "all",
    MANAGER: "owner",
    PRINCIPAL: "no",
    FINANCE: "no",
    right: "CANCEL_PURCHASES",
  },
  "request.close_exact": {
    row: "Close a request that matches exactly",
    HEAD: "all",
    MANAGER: "owner",
    PRINCIPAL: "no",
    FINANCE: "no",
    right: "CLOSE_ALONE",
  },
  "request.send_to_settlement": {
    row: "Send an order to settlement (not in 03: 06 Allowed moves; plan of 2.3, decision 4, Look first)",
    HEAD: "all",
    MANAGER: "owner",
    PRINCIPAL: "no",
    FINANCE: "no",
  },
  "request.settle": {
    row: "Settle and close a request with differences",
    HEAD: "no",
    MANAGER: "no",
    PRINCIPAL: "no",
    FINANCE: "own",
  },
  "request.acknowledge_overspend": {
    row: "Acknowledge a big overspend",
    HEAD: "all",
    MANAGER: "no",
    PRINCIPAL: "no",
    FINANCE: "no",
  },
  "request.reopen": {
    row: "Reopen a closed request",
    HEAD: "all",
    MANAGER: "no",
    PRINCIPAL: "no",
    FINANCE: "no",
  },
  "stock.issue": {
    row: "Issue, return, transfer stock (issue)",
    HEAD: "all",
    MANAGER: "own",
    PRINCIPAL: "no",
    FINANCE: "no",
    right: "ISSUE_STOCK",
  },
  "stock.return_reverse": {
    row: "Issue, return, transfer stock (return, reverse)",
    HEAD: "all",
    MANAGER: "own",
    PRINCIPAL: "no",
    FINANCE: "no",
    right: "RETURN_REVERSE",
  },
  "stock.transfer": {
    row: "Issue, return, transfer stock (transfer)",
    HEAD: "all",
    MANAGER: "own",
    PRINCIPAL: "no",
    FINANCE: "no",
    right: "TRANSFER_STOCK",
  },
  "stock.ask_write_off": {
    row: "Ask for a write-off or stock correction",
    HEAD: "all",
    MANAGER: "own",
    PRINCIPAL: "no",
    FINANCE: "no",
    right: "WRITE_OFF_COUNT",
  },
  "stock.start_count": {
    row: "Run stock counts (Manager rights: WRITE_OFF_COUNT)",
    HEAD: "all",
    MANAGER: "own",
    PRINCIPAL: "no",
    FINANCE: "no",
    right: "WRITE_OFF_COUNT",
  },
  "stock.approve_write_off": {
    row: "Approve a write-off or stock correction",
    HEAD: "all",
    MANAGER: "no",
    PRINCIPAL: "no",
    FINANCE: "no",
  },
  "stock.set_minimums": {
    row: "Set minimum stock levels (Manager rights: SET_MINIMUMS; 04-catalogs.md rule 5)",
    HEAD: "all",
    MANAGER: "own",
    PRINCIPAL: "no",
    FINANCE: "no",
    right: "SET_MINIMUMS",
  },
  "data.view": {
    row: "See requests, stock and reports",
    HEAD: "all",
    MANAGER: "own",
    PRINCIPAL: "own",
    FINANCE: "own",
  },
  "data.export": {
    row: "Export to Excel, download PDF, print",
    HEAD: "all",
    MANAGER: "own",
    PRINCIPAL: "own",
    FINANCE: "own",
  },
  "stock.enter_direct": {
    row: "Enter stock directly, without a request",
    HEAD: "all",
    MANAGER: "no",
    PRINCIPAL: "no",
    FINANCE: "no",
  },
  "price.add": {
    row: "Add a new price for a product",
    HEAD: "yes",
    MANAGER: "no",
    PRINCIPAL: "no",
    FINANCE: "no",
  },
  "manager_rights.switch": {
    row: "Switch a Manager's rights on or off",
    HEAD: "yes",
    MANAGER: "no",
    PRINCIPAL: "no",
    FINANCE: "no",
  },
  "profile.edit": {
    row: "Change one's own language and branch view (not in 03: plan of 0.10b, decision 1, Look first)",
    HEAD: "yes",
    MANAGER: "yes",
    PRINCIPAL: "yes",
    FINANCE: "yes",
  },
  "notification.own": {
    row: "See one's own notifications and mark them read (not in 03: plan of 0.11, decision 2, Look first)",
    HEAD: "yes",
    MANAGER: "yes",
    PRINCIPAL: "yes",
    FINANCE: "yes",
  },
  "file.upload": {
    row: "Upload a file before it is attached to anything (not in 03: plan of 0.12, decision 4, Look first)",
    HEAD: "yes",
    MANAGER: "yes",
    PRINCIPAL: "yes",
    FINANCE: "yes",
  },
};

export type Place = "own" | "other";
export type Answer = "allow" | "not_found" | "forbidden";

/**
 * The answer the spec expects for a role, in its own branch or another one, on a request it owns
 * (where ownership matters). Head sees every branch, so "other" is the same as "own" for it.
 */
export function expectedAnswer(permission: Permission, role: Role, place: Place): Answer {
  const entry = EXPECTED_MATRIX[permission];
  const grant = entry[role];
  const withoutBranch = ROLES.some((each) => entry[each] === "yes");
  if (withoutBranch) return grant === "yes" ? "allow" : "forbidden";
  if (place === "other" && role !== "HEAD") return "not_found";
  return grant === "no" ? "forbidden" : "allow";
}
