import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";

import { Search, isSearchShortcut } from "./search";

// 11-screens-and-ux.md rule 9 ("Ctrl+K or Cmd+K opens a search"); docs/design-system.md, Top
// bar ("the search field with 'Ctrl K' as plain text at its right") and Phone width (a search
// button); plan of 6.10, decided item 7. Typing, the arrow keys, Enter and the pause need a
// browser: tests/e2e/search.spec.ts.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/app/(app)/search-actions", () => ({ searchAction: async () => ({ ok: false }) }));

const key = (init: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}) => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...init,
});

describe("the search shortcut (11 rule 9)", () => {
  it("Ctrl+K and Cmd+K open the search, in either case", () => {
    expect(isSearchShortcut(key({ key: "k", ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ key: "k", metaKey: true }))).toBe(true);
    expect(isSearchShortcut(key({ key: "K", ctrlKey: true }))).toBe(true);
  });

  it("K alone, or with Shift or Alt, does not", () => {
    expect(isSearchShortcut(key({ key: "k" }))).toBe(false);
    expect(isSearchShortcut(key({ key: "k", ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ key: "k", metaKey: true, altKey: true }))).toBe(false);
    expect(isSearchShortcut(key({ key: "j", ctrlKey: true }))).toBe(false);
  });
});

describe("the search button of the top bar (plan of 6.10, decided item 7)", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tashkent">
      <Search />
    </NextIntlClientProvider>,
  );

  it('is named "Search" and shows "Ctrl K" as plain text from 640 px', () => {
    expect(html).toContain('aria-label="Search"');
    expect(html).toContain("Ctrl K");
    expect(html).toContain("sm:inline");
  });

  it("is a 44 px icon button at phone width", () => {
    expect(html).toContain("size-11");
  });
});
