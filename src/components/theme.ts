// The theme (docs/design-system.md, Colour: "The theme follows the device by default; the person
// can choose light or dark, and the choice is kept in the browser"; 11-screens-and-ux.md rule
// 15). The choice lives in localStorage only, never on the server (plan of 0.10a, decision 3).
// <html data-theme> is set before the first paint by THEME_SCRIPT, so a dark-theme person sees
// no white flash; without the attribute, globals.css follows the device.

export const THEME_KEY = "theme";
export const THEMES = ["device", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** The stored choice, or "device" for nothing stored or a value that is not a theme. */
export function readTheme(stored: string | null | undefined): Theme {
  return THEMES.find((theme) => theme === stored) ?? "device";
}

/** The `data-theme` value for a choice: none when the device decides. */
export function themeAttribute(theme: Theme): "light" | "dark" | null {
  return theme === "device" ? null : theme;
}

/** Keeps the choice and applies it at once. */
export function applyTheme(theme: Theme): void {
  const attribute = themeAttribute(theme);
  if (attribute) document.documentElement.dataset.theme = attribute;
  else delete document.documentElement.dataset.theme;
  try {
    if (theme === "device") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked (a private window): the theme still applies for this page.
  }
}

/**
 * The inline script of the root layout. It runs before the page paints and repeats the rule of
 * readTheme() and themeAttribute() in plain JavaScript (src/components/theme.test.ts checks
 * that both agree for every stored value).
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
