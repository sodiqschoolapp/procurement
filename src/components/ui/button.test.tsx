import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BUTTON_KINDS, BUTTON_SIZES, Button } from "./button";

// docs/design-system.md, Buttons ("three sizes, four kinds, one shape"; the app's own look of
// 21.10.2026, D60: the secondary button is white with a hairline edge) and 11-screens-and-ux.md
// rule 4 ("Every button shows a loading state at once") and rule 13 (44 px touch targets on
// phones).

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe("the shared button (design system, Buttons)", () => {
  it("has exactly the four kinds and the six sizes", () => {
    expect(Object.keys(BUTTON_KINDS)).toEqual(["default", "secondary", "ghost", "destructive"]);
    expect(Object.keys(BUTTON_SIZES)).toEqual([
      "sm",
      "default",
      "lg",
      "icon-sm",
      "icon",
      "icon-lg",
    ]);
  });

  it("sizes: default 40 and 44 at phone width, large 44 and 48 at phone width, icon 40 and 44", () => {
    expect(BUTTON_SIZES.default.split(" ")).toEqual(expect.arrayContaining(["h-11", "sm:h-10"]));
    expect(BUTTON_SIZES.lg.split(" ")).toEqual(expect.arrayContaining(["h-12", "sm:h-11"]));
    expect(BUTTON_SIZES.icon.split(" ")).toEqual(expect.arrayContaining(["size-11", "sm:size-10"]));
  });

  it("a small button is 44 high at phone width and 32 from the sm width up (design system, Buttons, 14.10.2026; build-plan 0.10b)", () => {
    expect(BUTTON_SIZES.sm.split(" ")).toEqual(expect.arrayContaining(["h-11", "sm:h-8"]));
    expect(BUTTON_SIZES.sm.split(" ")).not.toContain("h-8");
    expect(BUTTON_SIZES["icon-sm"].split(" ")).toEqual(
      expect.arrayContaining(["size-11", "sm:size-8"]),
    );
    expect(BUTTON_SIZES["icon-sm"].split(" ")).not.toContain("size-8");
  });

  it("only the secondary kind draws a hairline edge (design system, Buttons)", () => {
    for (const variant of Object.keys(BUTTON_KINDS) as (keyof typeof BUTTON_KINDS)[]) {
      const html = render(<Button variant={variant}>{variant}</Button>);
      if (variant === "secondary") expect(html).toMatch(/\bborder border-border-strong\b/);
      else expect(html, variant).not.toMatch(/\bborder\b|\bborder-/);
    }
  });

  it("is a button that does not submit unless asked to", () => {
    expect(render(<Button>{"x"}</Button>)).toContain('type="button"');
    expect(render(<Button type="submit">{"x"}</Button>)).toContain('type="submit"');
  });

  it("pending: disabled, aria-busy and the turning loading icon, words kept (rule 4)", () => {
    const html = render(<Button pending>{"Save"}</Button>);
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("animate-spin");
    expect(html).toContain("Save");
  });

  it("pending with an icon: the loading icon takes the icon's place", () => {
    const idle = render(<Button icon="add">{"Add"}</Button>);
    const pending = render(
      <Button icon="add" pending>
        {"Add"}
      </Button>,
    );
    expect(idle.match(/<svg/g)).toHaveLength(1);
    expect(pending.match(/<svg/g)).toHaveLength(1);
    expect(pending).toContain("animate-spin");
  });

  it("not pending: no loading icon and not busy", () => {
    const html = render(<Button>{"Save"}</Button>);
    expect(html).not.toContain("aria-busy=");
    expect(html).not.toContain("animate-spin");
  });
});
