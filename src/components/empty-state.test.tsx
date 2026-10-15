import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./empty-state";

// docs/design-system.md, "Empty page" (a brand moment: a Bitter title, one short line, the first
// action as a primary button, at most one quiet second action, the hexagon drawing hidden at
// phone width) and "What we never do" 6; 11-screens-and-ux.md rule 12.

describe("the empty state (design system, Empty page; 11-screens rule 12)", () => {
  const html = renderToStaticMarkup(
    <EmptyState
      title="No orders yet"
      line="Orders you add appear here."
      action={{ label: "New order", href: "/orders/new" }}
      quietAction={{ label: "Show all branches", href: "/orders?branch=all" }}
    />,
  );

  it("the title is set in Bitter, then one line", () => {
    expect(html).toMatch(/<h2 class="[^"]*font-slab[^"]*">No orders yet<\/h2>/);
    expect(html.match(/<p /g)).toHaveLength(1);
  });

  it("one primary action and one quiet action", () => {
    expect(html.match(/bg-primary /g)).toHaveLength(1);
    expect(html).toContain('href="/orders/new"');
    expect(html.match(/bg-transparent text-foreground/g)).toHaveLength(1);
  });

  it("the drawing is decoration, hidden from screen readers and at phone width", () => {
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*class="[^"]*hidden sm:block/);
  });

  it("without actions it shows only the title and the line", () => {
    const bare = renderToStaticMarkup(<EmptyState title="Nothing" line="Nothing here." />);
    expect(bare).not.toContain("<a ");
    expect(bare).not.toContain("<button");
  });
});
