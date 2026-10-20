import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// docs/design-system.md, "Colour" and "Accessibility": "Text 4.5 : 1 and controls 3 : 1 in both
// themes (checked by the app's contrast test)"; 11-screens-and-ux.md rule 13 (contrast meets
// WCAG AA) and rule 15 (light and dark themes). The tokens are read from src/app/globals.css,
// converted from oklch to sRGB and checked against the hex values of the design system's tables
// and against each other (plan of 0.10a; review corrections 6 and decision 6).

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

const LIGHT_HEX: Record<string, string> = {
  background: "#ECECEC",
  foreground: "#06113C",
  card: "#FFFFFF",
  "card-foreground": "#06113C",
  popover: "#FFFFFF",
  "popover-foreground": "#06113C",
  primary: "#FF8A32",
  "primary-foreground": "#06113C",
  "primary-hover": "#DE7230",
  secondary: "#DCDFE8",
  "secondary-hover": "#CDD1DD",
  "secondary-foreground": "#06113C",
  muted: "#F6F6F6",
  "muted-foreground": "#4A5270",
  accent: "#ECECEC",
  "accent-foreground": "#06113C",
  destructive: "#A3221A",
  "destructive-bg": "#FDE7E4",
  success: "#146C2E",
  "success-bg": "#E6F4EA",
  warning: "#7A4A00",
  "warning-bg": "#FFF1CC",
  info: "#1D4FA8",
  "info-bg": "#E3ECFB",
  today: "#FFF4E8",
  // Decision 5: the light values the design system implies for the four named tokens.
  "today-muted": "#4A5270",
  topbar: "#FFFFFF",
  link: "#06113C",
  border: "#DBDBDB",
  input: "#7C849C",
  ring: "#06113C",
  sidebar: "#06113C",
  "sidebar-foreground": "#C9CFE3",
  "sidebar-primary": "#FF8A32",
  "sidebar-primary-foreground": "#06113C",
  "sidebar-accent": "#0E1B4D",
  "sidebar-accent-foreground": "#FFFFFF",
  "sidebar-border": "#16224F",
  "sidebar-ring": "#FF8A32",
  "sidebar-avatar": "#1B2A63",
};

const DARK_CARD = "#0B1438";

/** "The colour at 16% over the card", composited in sRGB and rounded (review decision 6). */
function tintOverDarkCard(hex: string): string {
  const colour = rgbOfHex(hex);
  const card = rgbOfHex(DARK_CARD);
  return `#${colour
    .map((channel, i) => Math.round(0.16 * channel + 0.84 * (card[i] ?? 0)))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

const DARK_HEX: Record<string, string> = {
  ...LIGHT_HEX,
  background: "#040920",
  foreground: "#ECECEC",
  card: DARK_CARD,
  "card-foreground": "#ECECEC",
  popover: DARK_CARD,
  "popover-foreground": "#ECECEC",
  secondary: "#1C2856",
  "secondary-hover": "#26346A",
  "secondary-foreground": "#ECECEC",
  muted: "#16224F",
  "muted-foreground": "#A9B1CC",
  accent: "#16224F",
  "accent-foreground": "#ECECEC",
  destructive: "#FF8F85",
  "destructive-bg": tintOverDarkCard("#FF8F85"),
  success: "#6FD08C",
  "success-bg": tintOverDarkCard("#6FD08C"),
  warning: "#FFD27A",
  "warning-bg": tintOverDarkCard("#FFD27A"),
  info: "#9DBBFF",
  "info-bg": tintOverDarkCard("#9DBBFF"),
  today: "#2A1C14",
  "today-muted": "#D9C2B0",
  topbar: "#08102F",
  link: "#FFB37A",
  border: "#1C2856",
  input: "#5A6690",
  ring: "#FF8A32",
};

/** Text pairs, 4.5 : 1: [text, background]. `#FFFFFF` stands for the avatar's white initials. */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["foreground", "topbar"],
  ["foreground", "accent"],
  ["foreground", "today"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "today"],
  // Review correction 6: the unchosen items of the segmented control's track.
  ["muted-foreground", "accent"],
  ["today-muted", "today"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["secondary-foreground", "secondary"],
  ["secondary-foreground", "secondary-hover"],
  ["destructive", "card"],
  ["destructive", "destructive-bg"],
  // Review correction 6: a danger quiet button in a page header on the canvas.
  ["destructive", "background"],
  ["success", "card"],
  ["success", "success-bg"],
  ["warning", "card"],
  ["warning", "warning-bg"],
  ["info", "card"],
  ["info", "info-bg"],
  ["link", "card"],
  // Plan of 9.1d: the plain links that were orange, on the canvas too.
  ["link", "background"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-foreground", "sidebar-accent"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["#FFFFFF", "sidebar-avatar"],
];

/** Control pairs, 3 : 1: field borders and focus rings. */
const CONTROL_PAIRS: readonly (readonly [string, string])[] = [
  ["input", "card"],
  ["input", "background"],
  ["ring", "card"],
  ["ring", "background"],
  ["sidebar-ring", "sidebar"],
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

describe("the design system's colours (docs/design-system.md, Colour; 11-screens rule 15)", () => {
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

  it("the dark tints are the colour at 16% over the card (review decision 6)", () => {
    // Worked through once by hand: danger #FF8F85 over #0B1438 is #322844.
    expect(tintOverDarkCard("#FF8F85")).toBe("#322844");
    expect(hexOf(DARK["destructive-bg"] ?? "")).toBe("#322844");
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
