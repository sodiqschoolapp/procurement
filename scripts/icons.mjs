// Writes src/components/icon-paths.ts: the SVG path of every Material Symbols Rounded icon the
// app uses, outlined, and the filled path of the icons that can be the active menu item, from the
// dev dependency @material-symbols/svg-400 (docs/design-system.md, Icons: "Outlined at rest;
// filled only for the active menu item"; "drawn from SVG paths, never a font ligature"). Run with
// `npm run icons` after changing the list; src/components/icon-paths.test.ts fails while the
// committed file differs from what this script writes.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Design system "Icons" (common actions) and "This app" (menu icons), then the app's own. */
export const ICONS = [
  // Common actions.
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
  // The phone tab bar's "More" (plan of 0.10b).
  "more_horiz",
  // "Mark all as read" on /notifications (plan of 0.11).
  "done_all",
  // The pending button; the request statuses and the colour labels.
  "progress_activity",
  "schedule",
  "undo",
  "shopping_cart",
  "block",
  // The Substituted label of an order (plan of 3.6).
  "swap_horiz",
  "cancel",
  // The drafts grid (plan of 2.5b): delete a draft, the "Taken back" label, the reference photo.
  "delete",
  "history",
  "add_photo_alternate",
  // The redesign of 21.10.2026 (D60): filters, row actions, empty states, dates and trends.
  "filter_list",
  "check",
  "arrow_forward",
  "inbox",
  "task_alt",
  "calendar_month",
  "trending_up",
  "trending_down",
  "local_shipping",
];

/** The icons that are drawn filled when they are the active menu item or tab (design system). */
export const FILLED_ICONS = [
  "home",
  "receipt_long",
  "inventory",
  "payments",
  "bar_chart",
  "description",
  "tune",
  "person",
  "notifications",
  "more_horiz",
];

/**
 * Names the package files under another name. Material Symbols renamed `expand_more` to
 * `keyboard_arrow_down`; the glyph is the same, and the app keeps the design system's name.
 */
const FILE_NAMES = { expand_more: "keyboard_arrow_down" };

const PACKAGE = new URL("../node_modules/@material-symbols/svg-400/rounded/", import.meta.url);
const OUTPUT = new URL("../src/components/icon-paths.ts", import.meta.url);

function pathOf(name, filled = false) {
  const file = `${FILE_NAMES[name] ?? name}${filled ? "-fill" : ""}.svg`;
  const svg = readFileSync(new URL(file, PACKAGE), "utf8");
  if (!svg.includes('viewBox="0 -960 960 960"')) throw new Error(`${file}: unexpected viewBox`);
  const paths = [...svg.matchAll(/<path d="([^"]+)"\/>/g)].map((match) => match[1]);
  if (paths.length !== 1) throw new Error(`${file}: expected one path, found ${paths.length}`);
  return paths[0];
}

/** The source of src/components/icon-paths.ts. */
export function iconPathsSource() {
  const lines = ICONS.map((name) => `  ${name}: ${JSON.stringify(pathOf(name))},`);
  const filled = FILLED_ICONS.map((name) => `  ${name}: ${JSON.stringify(pathOf(name, true))},`);
  return [
    "// Written by scripts/icons.mjs (`npm run icons`); do not edit by hand. Material Symbols",
    "// Rounded, weight 400 (Apache-2.0), viewBox 0 -960 960 960: outlined, and filled for the",
    "// icons that can be the active menu item.",
    "",
    "export const ICON_PATHS = {",
    ...lines,
    "} as const;",
    "",
    "export type IconName = keyof typeof ICON_PATHS;",
    "",
    "export const FILLED_ICON_PATHS: Partial<Record<IconName, string>> = {",
    ...filled,
    "};",
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUTPUT, iconPathsSource());
  console.log(`Wrote ${ICONS.length} icons to src/components/icon-paths.ts`);
}
