import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Every screen of src/app as the role that opens it, shared by the accessibility pass (9.1d) and
// the speed run (9.2; review of the plan of 9.2, Should fix 3): one list, one completeness test
// (accessibility.spec.ts). The addresses take the ids of the records each run made.

export type Who = "head" | "manager" | "principal" | "finance";

/** The records the detail screens open. */
export type ScreenIds = {
  branch: string;
  department: string;
  /** A user's page: a Manager of `branch`. */
  manager: string;
  unit: string;
  product: string;
  subtype: string;
  suggestion: string;
  document: string;
  draft: string;
  waiting: string;
  open: string;
  settling: string;
  settlingVariant: string;
};

export const PERIOD = "period=this_month&branch=all";

export type Screen = {
  route: string;
  who: Who | null;
  url: (w: ScreenIds) => string;
  note: string;
};

const s = (
  route: string,
  who: Who | null,
  url: (w: ScreenIds) => string = () => route,
  note = "",
): Screen => ({
  route,
  who,
  url,
  note,
});

/** Every screen of src/app, as the role that opens it (plan of 9.1d, decided item 5). */
export const SCREENS: Screen[] = [
  s("/login", null),
  ...(["head", "manager", "principal", "finance"] as const).flatMap((who) => [
    s("/", who),
    s("/analytics", who),
  ]),
  s("/analytics/approvals", "head", () => `/analytics/approvals?${PERIOD}&key=step:all`),
  s("/analytics/cancelled", "head", () => `/analytics/cancelled?${PERIOD}`),
  s("/analytics/cash-needed", "finance", () => `/analytics/cash-needed?${PERIOD}&key=needed:all`),
  s("/analytics/cash", "finance", () => `/analytics/cash?${PERIOD}`),
  s("/analytics/money", "finance", () => `/analytics/money?${PERIOD}&key=money:given`),
  s("/analytics/moves", "head", () => `/analytics/moves?${PERIOD}&key=moves:use`),
  s(
    "/analytics/order-status",
    "principal",
    () => `/analytics/order-status?${PERIOD}&key=status:all`,
  ),
  s("/analytics/orders", "head", () => `/analytics/orders?${PERIOD}`),
  s("/analytics/records", "head", () => `/analytics/records?${PERIOD}`),
  s("/analytics/settlements", "finance", () => `/analytics/settlements?${PERIOD}&key=settled`),
  s("/analytics/stock", "head", () => `/analytics/stock?${PERIOD}&key=stock:value`),
  s("/branches", "head"),
  s("/branches/new", "head"),
  s("/branches/[id]", "head", (w) => `/branches/${w.branch}`),
  s("/catalog", "head"),
  s("/catalog/[catalog]", "head", () => "/catalog/measures"),
  s("/catalog/[catalog]/new", "head", () => "/catalog/companies/new"),
  s("/catalog/[catalog]/[id]", "head", (w) => `/catalog/measures/${w.unit}`),
  s("/catalog/departments", "head"),
  s("/catalog/departments/new", "head"),
  s("/catalog/departments/[id]", "head", (w) => `/catalog/departments/${w.department}`),
  s("/catalog/import/[kind]", "head", () => "/catalog/import/products"),
  s("/catalog/products", "head"),
  s("/catalog/products/new", "head"),
  s("/catalog/products/[id]", "head", (w) => `/catalog/products/${w.product}`),
  s(
    "/catalog/products/[id]/subtypes/new",
    "head",
    (w) => `/catalog/products/${w.product}/subtypes/new`,
  ),
  s(
    "/catalog/products/[id]/subtypes/[subtypeId]",
    "head",
    (w) => `/catalog/products/${w.product}/subtypes/${w.subtype}`,
  ),
  s("/money", "head"),
  s("/money", "finance"),
  s("/notifications", "manager"),
  s("/orders", "manager"),
  s("/orders", "head"),
  s("/orders/[id]", "manager", (w) => `/orders/${w.draft}`, "draft"),
  s("/orders/[id]", "head", (w) => `/orders/${w.waiting}`, "waiting for Head"),
  s("/orders/[id]", "manager", (w) => `/orders/${w.open}`, "open"),
  s("/orders/[id]", "finance", (w) => `/orders/${w.settling}`, "waiting for settlement"),
  s("/orders/[id]/purchase", "manager", (w) => `/orders/${w.open}/purchase`),
  s("/orders/purchase", "manager", (w) => `/orders/purchase?ids=${w.open}`),
  s("/orders/settle", "finance", (w) => `/orders/settle?ids=${w.settling}`),
  s("/prices", "head"),
  s("/prices/[variantId]", "head", (w) => `/prices/${w.subtype}`),
  s("/profile", "manager"),
  s("/reports", "head"),
  s("/settings", "head"),
  s("/suggestions", "manager"),
  s("/suggestions/new", "manager"),
  s("/suggestions/[id]", "head", (w) => `/suggestions/${w.suggestion}`),
  s("/suggestions/[id]/add", "head", (w) => `/suggestions/${w.suggestion}/add`),
  s("/users", "head"),
  s("/users/new", "head"),
  s("/users/[id]", "head", (w) => `/users/${w.manager}`),
  s("/warehouse/counts", "manager"),
  s("/warehouse/documents", "manager"),
  s("/warehouse/documents/new", "manager", () => "/warehouse/documents/new?type=ISSUE"),
  s("/warehouse/documents/[id]", "manager", (w) => `/warehouse/documents/${w.document}`),
  s(
    "/warehouse/items/[id]",
    "manager",
    (w) => `/warehouse/items/${w.settlingVariant}?branch=${w.branch}`,
  ),
  s("/warehouse/stock", "manager"),
  s("/warehouse/stock", "head"),
];

/** Every page.tsx under src/app as its address pattern, route groups left out. */
export function appRoutes(): string[] {
  const root = join(process.cwd(), "src", "app");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === "page.tsx") {
        const parts = relative(root, dir)
          .split(sep)
          .filter((part) => part !== "" && !/^\(.*\)$/.test(part));
        found.push(`/${parts.join("/")}`);
      }
    }
  };
  walk(root);
  return found.sort();
}
