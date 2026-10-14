import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { readTheme, THEME_KEY, THEME_SCRIPT, themeAttribute } from "./theme";

// docs/design-system.md, Colour: the theme follows the device until the person chooses light or
// dark; the choice is kept in the browser (11-screens-and-ux.md rule 15; plan of 0.10a,
// decision 3).

/** Runs the inline script against a stored value and returns the data-theme it set. */
function scriptResult(stored: string | null, throws = false): string | undefined {
  const dataset: Record<string, string> = {};
  runInNewContext(THEME_SCRIPT, {
    localStorage: {
      getItem: (key: string) => {
        if (throws) throw new Error("storage blocked");
        return key === THEME_KEY ? stored : null;
      },
    },
    document: { documentElement: { dataset } },
  });
  return dataset.theme;
}

describe("the theme choice (design system, Colour; 11-screens rule 15)", () => {
  it("follows the device when nothing or something unknown is stored", () => {
    expect(readTheme(null)).toBe("device");
    expect(readTheme("blue")).toBe("device");
    expect(themeAttribute("device")).toBeNull();
  });

  it("keeps a chosen light or dark theme", () => {
    expect(themeAttribute(readTheme("light"))).toBe("light");
    expect(themeAttribute(readTheme("dark"))).toBe("dark");
  });

  it("the inline script applies the same rule before the first paint", () => {
    for (const stored of [null, "light", "dark", "device", "blue", ""]) {
      expect(scriptResult(stored) ?? null, String(stored)).toBe(themeAttribute(readTheme(stored)));
    }
  });

  it("the inline script leaves the device to decide when storage is blocked", () => {
    expect(scriptResult("dark", true)).toBeUndefined();
  });
});
