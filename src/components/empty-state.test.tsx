import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./empty-state";

// docs/design-system.md, Parts, "Empty state" (the app's own look of 21.10.2026, D60: an outlined
// icon, a title that says what belongs there, at most one short line, the button that creates
// it and at most one quiet second action); 11-screens-and-ux.md rule 12.

describe("the empty state (design system, Empty state; 11-screens rule 12)", () => {
  const html = renderToStaticMarkup(
    <EmptyState
      title="No orders yet"
      line="Orders you add appear here."
      action={{ label: "New order", href: "/orders/new" }}
      quietAction={{ label: "Show all branches", href: "/orders?branch=all" }}
    />,
  );

  it("a title, then at most one line", () => {
    expect(html).toMatch(/<h2 class="[^"]*">No orders yet<\/h2>/);
    expect(html.match(/<p /g)).toHaveLength(1);
  });

  it("one primary action and one quiet action", () => {
    expect(html.match(/bg-primary /g)).toHaveLength(1);
    expect(html).toContain('href="/orders/new"');
    expect(html.match(/bg-transparent text-foreground/g)).toHaveLength(1);
  });

  it("the icon is decoration, hidden from screen readers", () => {
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("without actions or a line it shows only the title", () => {
    const bare = renderToStaticMarkup(<EmptyState title="Nothing" />);
    expect(bare).not.toContain("<a ");
    expect(bare).not.toContain("<button");
    expect(bare).not.toContain("<p ");
  });

  it("inline: no panel of its own inside a panel", () => {
    const inline = renderToStaticMarkup(<EmptyState title="Nothing" inline />);
    expect(inline).not.toContain("bg-card");
    expect(html).toContain("bg-card");
  });
});
