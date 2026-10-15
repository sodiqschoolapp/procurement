import type { IconName } from "@/components/icon";
import type { Role } from "@/domain/permissions";

// The menu per role, one config (11-screens-and-ux.md, Interface per role: "Menu, in order"; "A
// page a role cannot use is not shown greyed out; it is simply absent from the menu"). Icons:
// docs/design-system.md, This app, Menu icons. The sidebar, the tab bar and the browser tests
// read this file; the server checks every page again (rule 4: hiding protects nothing).

export type MenuItemId =
  "home" | "orders" | "warehouse" | "stock" | "money" | "analytics" | "reports" | "admin";

export type MenuItem = {
  id: MenuItemId;
  href: string;
  icon: IconName;
  /** The addresses under which the item is active; "/" only on itself. */
  activeOn: readonly string[];
};

const ITEMS: Record<MenuItemId, MenuItem> = {
  home: { id: "home", href: "/", icon: "home", activeOn: ["/"] },
  orders: { id: "orders", href: "/orders", icon: "receipt_long", activeOn: ["/orders"] },
  // Warehouse and Stock open Stock on hand (11, Screens) and are active on every warehouse page
  // (plan of 0.10b, decision 7).
  warehouse: {
    id: "warehouse",
    href: "/warehouse/stock",
    icon: "inventory",
    activeOn: ["/warehouse"],
  },
  stock: { id: "stock", href: "/warehouse/stock", icon: "inventory", activeOn: ["/warehouse"] },
  money: { id: "money", href: "/money", icon: "payments", activeOn: ["/money"] },
  analytics: { id: "analytics", href: "/analytics", icon: "bar_chart", activeOn: ["/analytics"] },
  reports: { id: "reports", href: "/reports", icon: "description", activeOn: ["/reports"] },
  // "Admin groups catalogs, prices, users, branches and settings" (11, Interface per role). It
  // opens /catalog, the first of them (plan of 1.5, decision 11; plan of 1.1, decision 11).
  admin: {
    id: "admin",
    href: "/catalog",
    icon: "tune",
    // The product suggestions belong to the catalog (plan of 1.12, decision 4); a Manager has no
    // Admin item, so nothing is marked there for a Manager.
    activeOn: ["/catalog", "/prices", "/users", "/branches", "/settings", "/suggestions"],
  },
};

const MENUS: Record<Role, readonly MenuItemId[]> = {
  MANAGER: ["home", "orders", "warehouse", "analytics", "reports"],
  HEAD: ["home", "orders", "warehouse", "money", "analytics", "reports", "admin"],
  PRINCIPAL: ["home", "orders", "stock", "analytics", "reports"],
  FINANCE: ["home", "orders", "money", "stock", "analytics", "reports"],
};

/** The role's menu, in the spec's order. */
export function menuFor(role: Role): MenuItem[] {
  return MENUS[role].map((id) => ITEMS[id]);
}

/** Whether the item is the page being shown. */
export function isActive(item: MenuItem, pathname: string): boolean {
  return item.activeOn.some((path) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * The phone tab bar (docs/design-system.md, This app: "a role with more than five items shows the
 * first four and 'More'").
 */
export function tabBarSplit(items: readonly MenuItem[]): {
  shown: MenuItem[];
  more: MenuItem[];
} {
  if (items.length <= 5) return { shown: [...items], more: [] };
  return { shown: items.slice(0, 4), more: items.slice(4) };
}
