import { describe, expect, it } from "vitest";

import { asksBeforeLeaving, type LinkClick } from "./unsaved-changes";

// 11-screens-and-ux.md rule 6: "Leaving a form with unsaved changes asks first" (plan of 0.10a,
// decision 9). The browser wiring is proved by the first form's e2e test (review correction 8).

const CLICK: LinkClick = {
  dirty: true,
  current: "https://ombor-test.example/orders/new",
  href: "/orders",
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  target: null,
  download: false,
};

describe("the unsaved-changes guard decides when to ask (11-screens rule 6)", () => {
  it("asks when a dirty form is left for another page", () => {
    expect(asksBeforeLeaving(CLICK)).toBe(true);
    expect(asksBeforeLeaving({ ...CLICK, href: "/orders/new?step=2" })).toBe(true);
    expect(asksBeforeLeaving({ ...CLICK, href: "https://other.example/" })).toBe(true);
    expect(asksBeforeLeaving({ ...CLICK, target: "_self" })).toBe(true);
  });

  it("does not ask when the form is clean", () => {
    expect(asksBeforeLeaving({ ...CLICK, dirty: false })).toBe(false);
  });

  it("does not ask for a link to the same page, with or without a fragment", () => {
    expect(asksBeforeLeaving({ ...CLICK, href: "/orders/new" })).toBe(false);
    expect(asksBeforeLeaving({ ...CLICK, href: "#lines" })).toBe(false);
  });

  it("does not ask for a new tab, a new window or a download", () => {
    expect(asksBeforeLeaving({ ...CLICK, target: "_blank" })).toBe(false);
    expect(asksBeforeLeaving({ ...CLICK, ctrlKey: true })).toBe(false);
    expect(asksBeforeLeaving({ ...CLICK, metaKey: true })).toBe(false);
    expect(asksBeforeLeaving({ ...CLICK, shiftKey: true })).toBe(false);
    expect(asksBeforeLeaving({ ...CLICK, altKey: true })).toBe(false);
    expect(asksBeforeLeaving({ ...CLICK, button: 1 })).toBe(false);
    expect(asksBeforeLeaving({ ...CLICK, download: true })).toBe(false);
  });

  it("does not ask for a link that is not a web page (mailto, tel)", () => {
    expect(asksBeforeLeaving({ ...CLICK, href: "tel:+998900000000" })).toBe(false);
  });
});
