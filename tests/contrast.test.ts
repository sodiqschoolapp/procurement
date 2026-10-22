import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// docs/design-system.md, "Colour" and "Accessibility": "Text 4.5 : 1 and controls 3 : 1 in both
// themes (checked by tests/contrast.test.ts)"; 11-screens-and-ux.md rule 13 (contrast meets WCAG
// AA) and rule 15 (light and dark themes). The tokens are read from src/app/globals.css, converted
// from oklch to sRGB and checked against the hex values of the design system's table and against
// each other. Rewritten for the app's own look of 21.10.2026 (D60): the requirement changed.

const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

type Tokens = Record<string, string>;

/** The `--name: value;` lines of the first block that opens with `opening`. */
function blockAfter(opening: string): Tokens {
  const start = CSS.indexOf(opening);
  if (start < 0) throw new Error(`No block "${opening}" in globals.css`);
  const body = CSS.slice(start + opening.length, CSS.indexOf("}", start));
  const tokens: Tokens = {};
  for (const [, name = "", value = ""] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const LIGHT = blockAfter(":root {");
const DARK_BY_DEVICE = blockAfter(':root:not([data-theme="light"]) {');
const DARK = blockAfter(':root[data-theme="dark"] {');

// --- oklch to sRGB (CSS Color 4, the reference matrices) ---

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

/** An `oklch(L C H)` token as sRGB channels in 0..255, rounded to whole channels. */
function rgbOf(value: string): [number, number, number] {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!match) throw new Error(`Not an oklch value: ${value}`);
  const [lightness, chroma, hue] = match.slice(1).map(Number) as [number, number, number];
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((channel) =>
    Math.round(Math.min(1, Math.max(0, fromLinear(channel))) * 255),
  ) as [number, number, number];
}

function hexOf(value: string): string {
  return `#${rgbOf(value)
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function rgbOfHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => toLinear(channel / 255)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG 2 contrast ratio of two colours. */
function contrast(first: [number, number, number], second: [number, number, number]): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

// --- the design system's values ---

// docs/design-system.md, Colour (D60, 21.10.2026): the table's light and dark hex values.
const LIGHT_HEX: Record<string, string> = {
  background: "#F5F6F8",
  foreground: "#06113C",
  card: "#FFFFFF",
  "card-foreground": "#06113C",
  popover: "#FFFFFF",
  "popover-foreground": "#06113C",
  primary: "#06113C",
  "primary-foreground": "#FFFFFF",
  "primary-hover": "#1B2754",
  secondary: "#FFFFFF",
  "secondary-foreground": "#06113C",
  "secondary-hover": "#F1F3F7",
  muted: "#F8F9FB",
  "muted-foreground": "#5A6278",
  accent: "#F1F3F7",
  "accent-foreground": "#06113C",
  destructive: "#B42318",
  "destructive-bg": "#FEF1F0",
  success: "#13703A",
  "success-bg": "#EBF7EF",
  warning: "#8A4B00",
  "warning-bg": "#FFF5DB",
  info: "#2348A8",
  "info-bg": "#EEF3FD",
  today: "#FFF6EE",
  "today-muted": "#5A6278",
  topbar: "#FFFFFF",
  link: "#06113C",
  border: "#E3E6EC",
  "border-strong": "#D2D7E0",
  input: "#868EA3",
  ring: "#06113C",
  brand: "#FF8A32",
  "brand-foreground": "#06113C",
  sidebar: "#FFFFFF",
  "sidebar-foreground": "#3D4560",
  "sidebar-primary": "#EDF0F7",
  "sidebar-primary-foreground": "#06113C",
  "sidebar-accent": "#F1F3F7",
  "sidebar-accent-foreground": "#06113C",
  "sidebar-border": "#E3E6EC",
  "sidebar-ring": "#06113C",
  "sidebar-avatar": "#06113C",
  "chart-1": "#34498A",
  "chart-2": "#7C8DBF",
  "chart-3": "#B9C3DE",
  "chart-4": "#5A6278",
  "chart-5": "#C9CED9",
};

const DARK_CARD = "#111831";

const DARK_HEX: Record<string, string> = {
  background: "#0A0F1E",
  foreground: "#E8EBF3",
  card: DARK_CARD,
  "card-foreground": "#E8EBF3",
  popover: "#151D3A",
  "popover-foreground": "#E8EBF3",
  primary: "#E8ECF6",
  "primary-foreground": "#06113C",
  "primary-hover": "#CBD3E8",
  secondary: "#172041",
  "secondary-foreground": "#E8EBF3",
  "secondary-hover": "#1F2A50",
  muted: "#151C36",
  "muted-foreground": "#9AA3BC",
  accent: "#1A2343",
  "accent-foreground": "#E8EBF3",
  destructive: "#FF8F85",
  "destructive-bg": "#4B1D1B",
  success: "#6FD08C",
  "success-bg": "#12361E",
  warning: "#FFD27A",
  "warning-bg": "#402C05",
  info: "#9DBBFF",
  "info-bg": "#1F2E54",
  today: "#382315",
  "today-muted": "#C9C2C4",
  topbar: DARK_CARD,
  link: "#E8EBF3",
  border: "#232C4A",
  "border-strong": "#2E3858",
  input: "#5E6990",
  ring: "#FF8A32",
  brand: "#FF8A32",
  "brand-foreground": "#06113C",
  sidebar: "#0D1328",
  "sidebar-foreground": "#B7BFD4",
  "sidebar-primary": "#1C2547",
  "sidebar-primary-foreground": "#FFFFFF",
  "sidebar-accent": "#161E38",
  "sidebar-accent-foreground": "#FFFFFF",
  "sidebar-border": "#1E2642",
  "sidebar-ring": "#FF8A32",
  "sidebar-avatar": "#2A3561",
  "chart-1": "#8EA2DA",
  "chart-2": "#5D6FA6",
  "chart-3": "#3A4877",
  "chart-4": "#9AA3BC",
  "chart-5": "#2E3858",
};

/** Text pairs, 4.5 : 1: [text, background]. `#FFFFFF` stands for the avatar's white initials. */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["foreground", "popover"],
  ["foreground", "topbar"],
  ["foreground", "accent"],
  ["foreground", "muted"],
  ["foreground", "today"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "today"],
  ["muted-foreground", "accent"],
  ["today-muted", "today"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["secondary-foreground", "secondary"],
  ["secondary-foreground", "secondary-hover"],
  ["brand-foreground", "brand"],
  ["destructive", "card"],
  ["destructive", "destructive-bg"],
  ["destructive", "background"],
  ["success", "card"],
  ["success", "success-bg"],
  ["warning", "card"],
  ["warning", "warning-bg"],
  ["info", "card"],
  ["info", "info-bg"],
  ["link", "card"],
  ["link", "background"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-foreground", "sidebar-accent"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["#FFFFFF", "sidebar-avatar"],
];

/** Control pairs, 3 : 1: field borders, focus rings and chart marks. */
const CONTROL_PAIRS: readonly (readonly [string, string])[] = [
  ["input", "card"],
  ["input", "background"],
  ["ring", "card"],
  ["ring", "background"],
  ["sidebar-ring", "sidebar"],
  ["chart-1", "card"],
];

const THEMES = [
  { name: "light", tokens: LIGHT, expected: LIGHT_HEX },
  { name: "dark", tokens: DARK, expected: DARK_HEX },
] as const;

function colourOf(tokens: Tokens, name: string): [number, number, number] {
  if (name.startsWith("#")) return rgbOfHex(name);
  const value = tokens[name];
  if (value === undefined) throw new Error(`No token --${name}`);
  return rgbOf(value);
}

describe("the design system's colours (docs/design-system.md, Colour; 11-screens rule 15; D60)", () => {
  it("the dark tokens under the device setting equal those under data-theme=dark", () => {
    expect(DARK_BY_DEVICE).toEqual(DARK);
  });

  for (const { name, tokens, expected } of THEMES) {
    it(`every ${name} token is the design system's hex value`, () => {
      const actual = Object.fromEntries(
        Object.keys(expected).map((token) => [
          token,
          tokens[token] === undefined ? "missing" : hexOf(tokens[token]),
        ]),
      );
      expect(actual).toEqual(expected);
    });
  }

  it("each dark tint keeps its colour's hue, not the card's (design system, Colour; 22.10.2026)", () => {
    // The hue of a tint is within 10° of its colour's own: red stays red, amber amber, green
    // green, blue blue, the orange highlight orange. The old 16% mix over the card read as grey
    // (amber, hue 292) or purple (red, hue 313).
    const hueOf = (value: string) => Number(/^oklch\([\d.]+ [\d.]+ ([\d.]+)\)$/.exec(value)?.[1]);
    const apart = (one: number, other: number) => {
      const turn = Math.abs(one - other) % 360;
      return Math.min(turn, 360 - turn);
    };
    for (const [tint, colour] of [
      ["destructive-bg", "destructive"],
      ["warning-bg", "warning"],
      ["success-bg", "success"],
      ["info-bg", "info"],
      ["today", "brand"],
    ] as const) {
      expect(apart(hueOf(DARK[tint] ?? ""), hueOf(DARK[colour] ?? "")), tint).toBeLessThan(10);
    }
  });

  it("orange is never text on a light surface: it fails 4.5 : 1 on white (design system, Colour)", () => {
    // The reason --ring is navy in the light theme and orange text is never used there.
    expect(contrast(rgbOf(LIGHT.brand ?? ""), rgbOf(LIGHT.card ?? ""))).toBeLessThan(3);
  });
});

describe("contrast in both themes (design system, Accessibility; 11-screens rule 13)", () => {
  for (const { name, tokens } of THEMES) {
    for (const [text, background] of TEXT_PAIRS) {
      it(`${name}: ${text} on ${background} is at least 4.5 : 1`, () => {
        const ratio = contrast(colourOf(tokens, text), colourOf(tokens, background));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const [control, background] of CONTROL_PAIRS) {
      it(`${name}: ${control} on ${background} is at least 3 : 1`, () => {
        const ratio = contrast(colourOf(tokens, control), colourOf(tokens, background));
        expect(ratio).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("the ratio function gives the design system's own figure (navy on orange 7.75 : 1)", () => {
    expect(contrast(rgbOfHex("#06113C"), rgbOfHex("#FF8A32"))).toBeCloseTo(7.75, 2);
  });
});
