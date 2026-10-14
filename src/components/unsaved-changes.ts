// The pure decision of the unsaved-changes guard (11-screens-and-ux.md rule 6: "Leaving a form
// with unsaved changes asks first"; plan of 0.10a, decision 9). The guard's browser wiring calls
// it for every link click; a click it says nothing about is left to the browser and Next.js.

export type LinkClick = {
  /** The form has changes that are not saved. */
  dirty: boolean;
  /** The address the page shows now and the address of the link, both absolute. */
  current: string;
  href: string;
  /** MouseEvent.button: 0 is the main button. */
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** The link's `target` and `download` attributes, if any. */
  target: string | null;
  download: boolean;
};

/**
 * True when following the link leaves the form in this tab and the form is dirty. A new tab or
 * window, a download, another button, a link to the same page (with or without a fragment) and
 * a clean form never ask.
 */
export function asksBeforeLeaving(click: LinkClick): boolean {
  if (!click.dirty) return false;
  if (click.button !== 0) return false;
  if (click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return false;
  if (click.download) return false;
  if (click.target !== null && click.target !== "" && click.target !== "_self") return false;
  const current = new URL(click.current);
  const next = new URL(click.href, current);
  if (next.protocol !== "http:" && next.protocol !== "https:") return false;
  const samePage =
    next.origin === current.origin &&
    next.pathname === current.pathname &&
    next.search === current.search;
  return !samePage;
}
