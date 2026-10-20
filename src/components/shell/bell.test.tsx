import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";

import { Bell } from "./bell";

// 10-notifications-analytics-reports.md, Notifications ("an in-app bell with an unread count");
// docs/design-system.md, Page shell and Colour (D60, 21.10.2026: the unread count is the "needs
// you now" highlight, a number on orange with navy text, never a dot that only says "something").
// The refresh on focus and every 60 seconds needs a browser (tests/e2e/notifications.spec.ts).

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

function render(count: number): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tashkent">
      <Bell count={count} />
    </NextIntlClientProvider>,
  );
}

/** The text of the bell without its tags: the number, if any. */
function visibleText(html: string): string {
  return html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "");
}

describe("the bell (plan of 0.11, Screens)", () => {
  it("0 unread: no number, an icon button named Notifications, linking to /notifications", () => {
    const html = render(0);
    expect(visibleText(html)).toBe("");
    expect(html).toContain('href="/notifications"');
    expect(html).toContain('aria-label="Notifications"');
    expect(html).toContain("size-11");
  });

  it.each([
    [1, "1", "Notifications, 1 unread"],
    [7, "7", "Notifications, 7 unread"],
    // The name says what is shown (WCAG 2.5.3 Label in Name; plan of 9.1d).
    [120, "99+", "Notifications, 99+ unread"],
  ])("%i unread shows %j and is named %j", (count, shown, label) => {
    const html = render(count);
    expect(visibleText(html)).toBe(shown);
    expect(html).toContain(`aria-label="${label}"`);
    // The default button: 44 high at phone width, 36 from sm up (Buttons).
    expect(html).toContain("h-11");
    expect(html).toContain("sm:h-9");
  });

  it("the number sits on the orange highlight with navy text, never a status colour (design system, Colour)", () => {
    const html = render(3);
    expect(html).toMatch(/bg-brand[^"]*text-brand-foreground/);
    expect(html).not.toMatch(/bg-warning|bg-destructive/);
  });

  it("with nothing unread there is no highlight at all (no dot that only says something)", () => {
    expect(render(0)).not.toContain("bg-brand");
  });
});
