import { describe, expect, it } from "vitest";

import { ROLES } from "@/domain/permissions";

import { isActive, menuFor, tabBarSplit } from "./menu";

// 11-screens-and-ux.md, Interface per role ("Menu, in order"), written out a second time by hand
// as the oracle; docs/design-system.md, This app (Menu icons; Phone tab bar).

const SPEC_MENUS = {
  MANAGER: ["home", "orders", "warehouse", "analytics", "reports"],
  HEAD: ["home", "orders", "warehouse", "money", "analytics", "reports", "admin"],
  PRINCIPAL: ["home", "orders", "stock", "analytics", "reports"],
  FINANCE: ["home", "orders", "money", "stock", "analytics", "reports"],
} as const;

const SPEC_ICONS = {
  home: "home",
  orders: "receipt_long",
  warehouse: "inventory",
  stock: "inventory",
  money: "payments",
  analytics: "bar_chart",
  reports: "description",
  admin: "tune",
} as const;

describe("the menu per role (11, Interface per role)", () => {
  for (const role of ROLES) {
    it(`${role}: exactly the spec's items, in its order`, () => {
      expect(menuFor(role).map((item) => item.id)).toEqual(SPEC_MENUS[role]);
    });
  }

  it("the Principal has no Admin and no Money", () => {
    const ids = menuFor("PRINCIPAL").map((item) => item.id);
    expect(ids).not.toContain("admin");
    expect(ids).not.toContain("money");
  });

  it("every item has the icon of the design system (This app, Menu icons)", () => {
    for (const role of ROLES) {
      for (const item of menuFor(role)) expect(item.icon, item.id).toBe(SPEC_ICONS[item.id]);
    }
  });
});

describe("the active item (plan of 0.10b, decision 7)", () => {
  const head = Object.fromEntries(menuFor("HEAD").map((item) => [item.id, item]));

  it("Home only on /", () => {
    expect(isActive(head.home!, "/")).toBe(true);
    expect(isActive(head.home!, "/orders")).toBe(false);
  });

  // 11-screens-and-ux.md: "Admin groups catalogs, prices, users, branches and settings"; prices
  // since 1.9.
  it("Warehouse on every warehouse page, Admin on catalogs, prices, users, branches and settings", () => {
    expect(isActive(head.warehouse!, "/warehouse/documents")).toBe(true);
    expect(isActive(head.warehouse!, "/warehouse/stock")).toBe(true);
    expect(isActive(head.admin!, "/pricesx")).toBe(false);
    for (const path of [
      "/catalog/products",
      "/prices",
      "/prices/x",
      "/users",
      "/branches",
      "/settings",
      // The product suggestions since 1.12 (plan of 1.12, decision 4).
      "/suggestions",
      "/suggestions/x/add",
    ]) {
      expect(isActive(head.admin!, path), path).toBe(true);
    }
  });

  // Plan of 1.5, decision 11 (plan of 1.1, decision 11: /settings until /catalog existed).
  it("Admin opens /catalog", () => {
    expect(head.admin!.href).toBe("/catalog");
  });

  it("a path that only starts with the same letters is not active", () => {
    expect(isActive(head.orders!, "/ordersx")).toBe(false);
    expect(isActive(head.money!, "/moneyx/1")).toBe(false);
  });
});

describe("the phone tab bar (design system, This app: Phone tab bar)", () => {
  it("Head: the first four and More with Analytics, Reports, Admin", () => {
    const { shown, more } = tabBarSplit(menuFor("HEAD"));
    expect(shown.map((item) => item.id)).toEqual(["home", "orders", "warehouse", "money"]);
    expect(more.map((item) => item.id)).toEqual(["analytics", "reports", "admin"]);
  });

  it("Finance: the first four and More with Analytics and Reports", () => {
    const { shown, more } = tabBarSplit(menuFor("FINANCE"));
    expect(shown.map((item) => item.id)).toEqual(["home", "orders", "money", "stock"]);
    expect(more.map((item) => item.id)).toEqual(["analytics", "reports"]);
  });

  it("Manager and Principal: all five, no More", () => {
    for (const role of ["MANAGER", "PRINCIPAL"] as const) {
      expect(tabBarSplit(menuFor(role))).toEqual({ shown: menuFor(role), more: [] });
    }
  });
});
