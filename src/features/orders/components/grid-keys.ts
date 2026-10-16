// Enter in the drafts grid (11-screens-and-ux.md rule 2: "Tab and Enter move between cells, and
// Enter on the last row adds a draft"; rule 13: everything works with the keyboard; plan of 2.6,
// decided items 2 and 3). Tab is the browser's own order, cell by cell along the row. Enter moves
// to the same column of the next draft, Shift+Enter to the row above; Enter on the last draft goes
// to the add row, where Enter adds. A typed field or a select moves; a button and the tick box
// keep Enter as their own click; the product picker with its list open keeps Enter to pick. The
// DOM glue is in drafts-grid.tsx; these are the plain decisions, tested without a browser.

export type KeyTarget = {
  tagName: string;
  type?: string;
  /** The `aria-expanded` attribute: "true" while a combobox shows its list. */
  expanded?: string | null;
};

const KEEPS_ENTER = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "image"]);

/** Whether Enter on this element moves to another row. */
export function enterMoves(target: KeyTarget): boolean {
  const tag = target.tagName.toUpperCase();
  if (tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  if (KEEPS_ENTER.has((target.type ?? "text").toLowerCase())) return false;
  return target.expanded !== "true";
}

/** The row Enter goes to: an index of the shown drafts, "add" for the add row, or null. */
export function enterGoesTo(from: number, rows: number, up: boolean): number | "add" | null {
  if (from < 0 || from >= rows) return null;
  if (up) return from === 0 ? null : from - 1;
  return from + 1 < rows ? from + 1 : "add";
}
