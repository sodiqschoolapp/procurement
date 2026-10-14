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

// The menu's width (docs/design-system.md, Layout shell: the menu "can collapse to a 72-wide rail
// of icons with the shield logo; the choice is kept in the browser"; plan of 0.10b, decision 12).
// The same inline script sets <html data-sidebar="rail"> before the first paint.

export const SIDEBAR_KEY = "sidebar";
export type SidebarChoice = "full" | "rail";

/** The stored choice: "rail" only when exactly that is stored. */
export function readSidebar(stored: string | null | undefined): SidebarChoice {
  return stored === "rail" ? "rail" : "full";
}

/** Keeps the choice and applies it at once. */
export function applySidebar(choice: SidebarChoice): void {
  if (choice === "rail") document.documentElement.dataset.sidebar = "rail";
  else delete document.documentElement.dataset.sidebar;
  try {
    if (choice === "rail") localStorage.setItem(SIDEBAR_KEY, "rail");
    else localStorage.removeItem(SIDEBAR_KEY);
  } catch {
    // Storage blocked (a private window): the choice still applies for this page.
  }
}

/**
 * The inline script of the root layout. It runs before the page paints and repeats the rules of
 * readTheme(), themeAttribute() and readSidebar() in plain JavaScript (src/components/
 * theme.test.ts checks that they agree for every stored value).
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;if(localStorage.getItem(${JSON.stringify(SIDEBAR_KEY)})==="rail")document.documentElement.dataset.sidebar="rail"}catch(e){}`;

/**
 * Calls back when <html> changes its theme or menu choice, for useSyncExternalStore: the
 * controls read the choice the inline script already applied, with no effect that sets state.
 */
export function subscribeToRoot(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-sidebar"],
  });
  return () => observer.disconnect();
}
