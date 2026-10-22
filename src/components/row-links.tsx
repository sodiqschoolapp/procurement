"use client";

import type { MouseEvent, ReactNode } from "react";

import { cn } from "./utils";

// A row or card with one destination is that destination (docs/design-system.md, Panels and
// lists; redesign of 22.10.2026). A click anywhere on an element marked `data-row` goes to its one
// control marked `data-row-link` (a link or a button), as a click on that control would. It is
// not a stretched link: a stretched link needs `position: relative` on a table row, which Safari
// does not honour. The control stays the one thing a keyboard and a screen reader meet; this only
// widens where a pointer may click.
//
// A click is left alone when it lands on another control (a tick box, a button, a field), when
// it ends a text selection (so a number or an amount can still be copied), or when it is not the
// main button. Ctrl, Cmd or Shift on a row opens a link in a new tab, as on the link itself.
// Never on a row whose card holds actions (approve, send back): there a missed tap would do
// something else.

const CONTROLS = "a, button, input, select, textarea, label, summary, [role=button], [role=link]";

export function rowClick(event: MouseEvent<HTMLElement>): void {
  if (event.defaultPrevented || event.button !== 0) return;
  const target = event.target as HTMLElement;
  if (target.closest(CONTROLS)) return;
  const row = target.closest<HTMLElement>("[data-row]");
  const control = row?.querySelector<HTMLElement>("[data-row-link]");
  if (!control) return;
  if (window.getSelection()?.toString()) return;
  if (control instanceof HTMLAnchorElement && (event.metaKey || event.ctrlKey || event.shiftKey)) {
    window.open(control.href, "_blank", "noopener");
    return;
  }
  control.click();
}

/** The rows inside take a click anywhere as a click on their one `data-row-link` control. */
export function RowLinks({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // The keyboard uses each row's own link or button; this only widens the pointer's target.
    <div onClick={rowClick} className={cn("contents", className)}>
      {children}
    </div>
  );
}
