import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Segmented } from "./segmented";

// docs/design-system.md, "Fields and switches": two to four choices; the chosen item white with
// navy text, the others muted; 32 high, 44 at phone width (11-screens-and-ux.md rule 13). A
// radio group, so the choices are announced and the arrow keys move between them.

const THEMES = [
  { value: "device", label: "Like my device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

function render(options: readonly { value: string; label: string }[], value = "light"): string {
  return renderToStaticMarkup(
    <Segmented label="Theme" options={options} value={value} onValueChange={() => {}} />,
  );
}

describe("the segmented control (design system, Fields and switches)", () => {
  it("is a named radio group with one checked item", () => {
    const html = render(THEMES);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Theme"');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  });

  it("items are 44 high at phone width and 32 from 640 px on", () => {
    expect(render(THEMES)).toContain("h-11");
    expect(render(THEMES)).toContain("sm:h-8");
  });

  it("the chosen item is white with navy text, the others muted", () => {
    const html = render(THEMES);
    expect(html).toContain("data-checked:bg-card data-checked:text-foreground");
    expect(html).toContain("text-muted-foreground");
  });

  it("refuses one choice or more than four", () => {
    expect(() => render(THEMES.slice(0, 1))).toThrow(/two to four/);
    const five = ["a", "b", "c", "d", "e"].map((value) => ({ value, label: value }));
    expect(() => render(five, "a")).toThrow(/two to four/);
  });
});

describe("the segmented control while its choice is saved (11-screens rule 4)", () => {
  it("is disabled and dimmed at once, and the chosen item shows the turning icon", () => {
    const html = renderToStaticMarkup(
      <Segmented label="Theme" options={THEMES} value="light" onValueChange={() => {}} pending />,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("opacity-60");
    expect(html.match(/animate-spin/g)).toHaveLength(1);
    expect(html.match(/aria-disabled="true"|data-disabled/g)?.length).toBeGreaterThan(0);
  });

  it("is neither busy nor turning when nothing is saved", () => {
    const html = render(THEMES);
    expect(html).not.toContain("aria-busy");
    expect(html).not.toContain("animate-spin");
  });
});
