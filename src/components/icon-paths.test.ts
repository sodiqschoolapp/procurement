import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ICONS, iconPathsSource } from "../../scripts/icons.mjs";

import { ICON_PATHS } from "./icon-paths";

// docs/design-system.md, Icons: Material Symbols Rounded, filled, drawn from SVG; the common
// actions and this app's menu icons (section "This app"). Plan of 0.10a, test of the generated
// icon file: a list change without `npm run icons` fails here.

const DESIGN_SYSTEM_ICONS = [
  "search",
  "notifications",
  "download",
  "print",
  "add",
  "edit",
  "close",
  "expand_more",
  "chevron_left",
  "chevron_right",
  "arrow_back",
  "check_circle",
  "warning",
  "error",
  "info",
  "inventory_2",
  "logout",
  "dark_mode",
  "light_mode",
  "language",
  "tune",
  // Menu icons of this app.
  "home",
  "receipt_long",
  "inventory",
  "payments",
  "bar_chart",
  "description",
  "person",
];

describe("the generated icon file (design system, Icons)", () => {
  it("equals what scripts/icons.mjs writes from the package", () => {
    const committed = readFileSync(new URL("./icon-paths.ts", import.meta.url), "utf8");
    expect(committed).toBe(iconPathsSource());
  });

  it("holds every icon of the design system and of this app's menu", () => {
    for (const name of DESIGN_SYSTEM_ICONS) {
      expect(Object.keys(ICON_PATHS), name).toContain(name);
    }
    expect(Object.keys(ICON_PATHS)).toEqual(ICONS);
  });

  it("each icon is one filled path in the 960 grid", () => {
    for (const path of Object.values(ICON_PATHS)) {
      expect(path).toMatch(/^[Mm][\d.-]/);
      expect(path).not.toMatch(/[<>"]/);
    }
  });
});
