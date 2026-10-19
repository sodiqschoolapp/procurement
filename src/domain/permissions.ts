// The permission matrix of docs/spec/03-roles-and-permissions.md as data, and the one function
// that reads it (developer-rules.md rule 4: one permission layer). Pure: authorize() in
// src/server/authorize.ts reads the actor from the database and asks decide().
//
// Each row of the spec's table is one permission; a row that covers actions guarded by different
// Manager rights is split, and the rights without a row of their own get one (plan of 0.7,
// decision 3). A later task adds the permission its action needs here, and to the expected
// table of tests/permission-matrix-expected.ts.

export const ROLES = ["HEAD", "MANAGER", "PRINCIPAL", "FINANCE"] as const;
export type Role = (typeof ROLES)[number];

/** The nine switches (03-roles-and-permissions.md, "Manager rights the Head can switch"). */
export const MANAGER_RIGHTS = [
  "CREATE_REQUESTS",
  "RECORD_PURCHASES",
  "CANCEL_PURCHASES",
  "CLOSE_ALONE",
  "ISSUE_STOCK",
  "RETURN_REVERSE",
  "TRANSFER_STOCK",
  "WRITE_OFF_COUNT",
  "SET_MINIMUMS",
] as const;
export type ManagerRight = (typeof MANAGER_RIGHTS)[number];

/**
 * What a role may do with a permission.
 * - `no`: never.
 * - `yes`: a permission with no branch (catalogs, settings, prices, rights).
 * - `all`: in every branch.
 * - `own`: in the actor's own branches.
 * - `owner`: in the actor's own branches, on requests the actor owns ("own requests").
 */
export type Grant = "no" | "yes" | "all" | "own" | "owner";

type GlobalRule = {
  scope: "global";
  roles: Record<Role, "no" | "yes">;
};

type BranchRule = {
  scope: "branch";
  roles: Record<Role, "no" | "all" | "own" | "owner">;
  /** The Manager right that guards it; checked for Managers only. */
  right?: ManagerRight;
};

export type PermissionRule = GlobalRule | BranchRule;

const HEAD_ONLY_GLOBAL = { HEAD: "yes", MANAGER: "no", PRINCIPAL: "no", FINANCE: "no" } as const;
const HEAD_ONLY = { HEAD: "all", MANAGER: "no", PRINCIPAL: "no", FINANCE: "no" } as const;
const HEAD_AND_MANAGER = { HEAD: "all", MANAGER: "own", PRINCIPAL: "no", FINANCE: "no" } as const;
const HEAD_AND_OWNER = { HEAD: "all", MANAGER: "owner", PRINCIPAL: "no", FINANCE: "no" } as const;
const FINANCE_ONLY = { HEAD: "no", MANAGER: "no", PRINCIPAL: "no", FINANCE: "own" } as const;
const EVERY_ROLE = { HEAD: "all", MANAGER: "own", PRINCIPAL: "own", FINANCE: "own" } as const;

export const PERMISSIONS = {
  // "Manage catalogs, users, branches, settings"
  "catalog.manage": { scope: "global", roles: HEAD_ONLY_GLOBAL },
  // "Suggest a new product for the catalog": a branch permission, as catalog_suggestions has a
  // branch_id (plan of 0.7, decision 3).
  "catalog.suggest": { scope: "branch", roles: HEAD_AND_MANAGER },
  // Picking from the catalogs (measures, categories, extra cost types, companies; later products):
  // not a row of 03, which says only "everyone else picks from them" (04). Every role: Managers
  // pick on requests and purchases, Finance a supplier on money entries, the Principal filters
  // analytics and reports. Catalogs hold no branch data, so no branch (plan of 1.5, decision 2,
  // Look first). The picker lists active entries only.
  "catalog.pick": {
    scope: "global",
    roles: { HEAD: "yes", MANAGER: "yes", PRINCIPAL: "yes", FINANCE: "yes" },
  },
  // "Create, edit, submit, cancel a request", split by the one owner (03 rule 7; 06 Allowed
  // moves: "Submit: Owner or Head", "Take back: Owner", "Cancel: Owner or Head"): creating is any
  // own branch, the rest only on the Manager's own requests (permission review of 0.7).
  "request.create": { scope: "branch", roles: HEAD_AND_MANAGER, right: "CREATE_REQUESTS" },
  "request.edit": { scope: "branch", roles: HEAD_AND_OWNER, right: "CREATE_REQUESTS" },
  // "Approve, send back or reject at step 1 / 2 / 3"
  "request.approve_step1": { scope: "branch", roles: HEAD_ONLY },
  "request.approve_step2": {
    scope: "branch",
    roles: { HEAD: "no", MANAGER: "no", PRINCIPAL: "own", FINANCE: "no" },
  },
  "request.approve_step3": { scope: "branch", roles: FINANCE_ONLY },
  // "Record money given, returned, paid back"
  "money.record": { scope: "branch", roles: FINANCE_ONLY },
  // The page Money with managers: not a row of 03. 11 Screens: "Money with managers, /money,
  // Finance, Head"; 08 Money with managers: "Finance and the Head have a page" (plan of 4.9,
  // decided item 1, Look first).
  "money.managers": {
    scope: "branch",
    roles: { HEAD: "all", MANAGER: "no", PRINCIPAL: "no", FINANCE: "own" },
  },
  // "Record purchases"
  "purchase.record": { scope: "branch", roles: HEAD_AND_OWNER, right: "RECORD_PURCHASES" },
  // CANCEL_PURCHASES: "Only the Head can cancel a record" when it is off.
  "purchase.cancel": { scope: "branch", roles: HEAD_AND_OWNER, right: "CANCEL_PURCHASES" },
  // "Close a request that matches exactly"
  "request.close_exact": { scope: "branch", roles: HEAD_AND_OWNER, right: "CLOSE_ALONE" },
  // "Send to settlement" (06 Allowed moves: "Open | Send to settlement | Owner or Head"): not a row
  // of 03. No Manager right: CLOSE_ALONE off sends the Manager's orders here ("these orders go to
  // settlement instead", 08 Closing 1), and no switch names it (plan of 2.3, decision 4, Look first).
  "request.send_to_settlement": { scope: "branch", roles: HEAD_AND_OWNER },
  // "Settle and close a request with differences"
  "request.settle": { scope: "branch", roles: FINANCE_ONLY },
  // "Acknowledge a big overspend"
  "request.acknowledge_overspend": { scope: "branch", roles: HEAD_ONLY },
  // "Reopen a closed request"
  "request.reopen": { scope: "branch", roles: HEAD_ONLY },
  // "Move orders to another Manager"
  "request.move_owner": { scope: "branch", roles: HEAD_ONLY },
  // "Issue, return, transfer stock", split by the three rights.
  "stock.issue": { scope: "branch", roles: HEAD_AND_MANAGER, right: "ISSUE_STOCK" },
  "stock.return_reverse": { scope: "branch", roles: HEAD_AND_MANAGER, right: "RETURN_REVERSE" },
  "stock.transfer": { scope: "branch", roles: HEAD_AND_MANAGER, right: "TRANSFER_STOCK" },
  // Receiving a transfer (09 Movement types: "the receiving Manager confirms"), asked on its
  // receiving branch: TRANSFER_STOCK is "Send transfers" only, so no right (plan of 7.2, decided
  // item 2, Look first).
  "stock.receive_transfer": { scope: "branch", roles: HEAD_AND_MANAGER },
  // "Ask for a write-off or stock correction", and starting a count: WRITE_OFF_COUNT, "Ask for
  // write-offs and run stock counts".
  "stock.ask_write_off": { scope: "branch", roles: HEAD_AND_MANAGER, right: "WRITE_OFF_COUNT" },
  "stock.start_count": { scope: "branch", roles: HEAD_AND_MANAGER, right: "WRITE_OFF_COUNT" },
  // "Approve a write-off or stock correction"
  "stock.approve_write_off": { scope: "branch", roles: HEAD_ONLY },
  // SET_MINIMUMS; 04-catalogs.md rule 5: "The Head, or a Manager for their own branches".
  "stock.set_minimums": { scope: "branch", roles: HEAD_AND_MANAGER, right: "SET_MINIMUMS" },
  // "See requests, stock and reports"
  "data.view": { scope: "branch", roles: EVERY_ROLE },
  // "Export to Excel, download PDF, print": for what the role can see (plan of 0.7, decision 4).
  "data.export": { scope: "branch", roles: EVERY_ROLE },
  // "Enter stock directly, without a request"
  "stock.enter_direct": { scope: "branch", roles: HEAD_ONLY },
  // "Add a new price for a product": one price for the whole school (04-catalogs.md rule 4).
  "price.add": { scope: "global", roles: HEAD_ONLY_GLOBAL },
  // "Switch a Manager's rights on or off"
  "manager_rights.switch": { scope: "global", roles: HEAD_ONLY_GLOBAL },
  // One's own language and branch view, and the list of one's branches: not a row of 03 (plan of
  // 0.10b, decision 1, Look first; 11-screens-and-ux.md, Screens: "Notifications, profile: All").
  "profile.edit": {
    scope: "global",
    roles: { HEAD: "yes", MANAGER: "yes", PRINCIPAL: "yes", FINANCE: "yes" },
  },
  // One's own notifications: read them and mark them read. Not a row of 03 (plan of 0.11,
  // decision 2, Look first; 11-screens-and-ux.md, Screens: "Notifications, profile: All"). The
  // SQL filters by the signed-in user, so no branch is named.
  "notification.own": {
    scope: "global",
    roles: { HEAD: "yes", MANAGER: "yes", PRINCIPAL: "yes", FINANCE: "yes" },
  },
  // Uploading a file, before it is attached to anything: not a row of 03 (plan of 0.12, decision
  // 4, Look first). Every role attaches a file somewhere; the attaching action of each later task
  // checks its own row. An upload shows nothing to anyone but its uploader (decision 5).
  "file.upload": {
    scope: "global",
    roles: { HEAD: "yes", MANAGER: "yes", PRINCIPAL: "yes", FINANCE: "yes" },
  },
} as const satisfies Record<string, PermissionRule>;

export type Permission = keyof typeof PERMISSIONS;

/** Who acts: read fresh from the database by authorize() (plan of 0.7, decision 6). */
export type Actor = {
  userId: string;
  role: Role;
  /** The branches of user_branches; empty for the Head, who sees every branch. */
  branchIds: readonly string[];
  /** The Manager rights switched off. No row means enabled. */
  disabledRights: readonly ManagerRight[];
};

/**
 * What the action is about: its branch, and for "own requests" the request's owner. Both are read
 * from the record in the database, never taken from the browser's input: a branch id sent by the
 * browser would let anyone choose the branch the wall checks (developer-rules.md rule 13; the
 * permission review of 0.7). Only a create action, whose record does not exist yet, passes the
 * branch the user chose, and the check then is exactly whether the user may use that branch.
 */
export type Target = { branchId: string; ownerId?: string };

export type Decision = "allow" | "not_found" | "forbidden";

/** Whether the actor sees a branch at all: the Head every branch, the others their own. */
export function seesBranch(actor: Actor, branchId: string): boolean {
  return actor.role === "HEAD" || actor.branchIds.includes(branchId);
}

/**
 * The matrix answer. The order is fixed (plan of 0.7, decision 5): another branch is
 * `not_found` first, so its address tells nothing (03 rule 1); then the role, the Manager right
 * and the owner are each `forbidden`.
 */
export function decide(permission: Permission, actor: Actor, target?: Target): Decision {
  const rule: PermissionRule = PERMISSIONS[permission];

  if (rule.scope === "global") {
    return rule.roles[actor.role] === "yes" ? "allow" : "forbidden";
  }

  if (!target) {
    // A programming error, not a refusal: a branch permission is always asked about a branch.
    throw new Error(`decide(): the permission ${permission} needs a branch.`);
  }
  if (!seesBranch(actor, target.branchId)) return "not_found";

  const grant = rule.roles[actor.role];
  if (grant === "no") return "forbidden";

  // "Switches only take rights away", and only a Manager's (the Head can do everything a
  // Manager can, in any branch).
  if (actor.role === "MANAGER" && rule.right && actor.disabledRights.includes(rule.right)) {
    return "forbidden";
  }

  if (grant === "owner") {
    if (target.ownerId === undefined) {
      throw new Error(`decide(): the permission ${permission} needs the request's owner.`);
    }
    if (target.ownerId !== actor.userId) return "forbidden";
  }

  return "allow";
}

/**
 * The matrix answer for a list of a branch permission, which names no branch: whether the role
 * may use the permission in any branch at all. The list then filters by branch inside its SQL
 * with branchFilter() (developer-rules.md rule 4; plan of 1.12, decision 1, Look first): the Head
 * every branch, everyone else their own. A Manager whose right is switched off is `forbidden`. A
 * permission of "own requests" is not listed this way: its owner is a filter of its own.
 */
export function decideList(permission: Permission, actor: Actor): "allow" | "forbidden" {
  const rule: PermissionRule = PERMISSIONS[permission];
  if (rule.scope === "global") {
    return rule.roles[actor.role] === "yes" ? "allow" : "forbidden";
  }
  const grant = rule.roles[actor.role];
  if (grant === "owner") {
    throw new Error(`decideList(): the permission ${permission} is listed by its owner.`);
  }
  if (grant === "no") return "forbidden";
  if (actor.role === "MANAGER" && rule.right && actor.disabledRights.includes(rule.right)) {
    return "forbidden";
  }
  return "allow";
}

/**
 * Whether the actor may use a branch permission in some branch: for a home page button that leads
 * to the page where the action starts (plan of 6.1, decided item 3; review of the plan, decision 3,
 * Look first). An "own requests" grant counts as allowed, since every Manager may act on their own
 * orders; a switched-off Manager right takes it away. The target page and its action ask
 * authorize() again; this protects nothing.
 */
export function mayInSomeBranch(permission: Permission, actor: Actor): boolean {
  const rule: PermissionRule = PERMISSIONS[permission];
  if (rule.scope !== "branch") {
    throw new Error(`mayInSomeBranch(): the permission ${permission} has no branch.`);
  }
  if (rule.roles[actor.role] === "no") return false;
  if (actor.role === "MANAGER" && rule.right && actor.disabledRights.includes(rule.right)) {
    return false;
  }
  return actor.role === "HEAD" || actor.branchIds.length > 0;
}

/**
 * Whether a role may use a global permission: for a screen that shows a button only when it works
 * (11-screens-and-ux.md, "only the buttons that work right now"). The server asks authorize()
 * again; this protects nothing.
 */
export function roleMay(permission: Permission, role: Role): boolean {
  const rule: PermissionRule = PERMISSIONS[permission];
  if (rule.scope !== "global") {
    throw new Error(`roleMay(): the permission ${permission} needs a branch.`);
  }
  return rule.roles[role] === "yes";
}
