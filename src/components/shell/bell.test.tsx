import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";

import { Bell } from "./bell";

// 10-notifications-analytics-reports.md, Notifications ("an in-app bell with an unread count");
// docs/design-system.md, "What we never do" 4 and 12 (a count is a plain number; no dot that only
// says "something"); plan of 0.11, Screens and review of the plan, Must fix 1: no pill, no
// orange. The refresh on focus and every 60 seconds needs a browser (tests/e2e/notifications.spec.ts).

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
    [120, "99+", "Notifications, 120 unread"],
  ])("%i unread shows %j and is named %j", (count, shown, label) => {
    const html = render(count);
    expect(visibleText(html)).toBe(shown);
    expect(html).toContain(`aria-label="${label}"`);
    // The medium button: 44 high at phone width, 40 from sm up (Buttons).
    expect(html).toContain("h-11");
    expect(html).toContain("sm:h-10");
  });

  it("the number is plain text: no orange, no pill (What we never do 4; 11 rule 11)", () => {
    const html = render(3);
    expect(html).not.toMatch(/bg-primary|rounded-full|bg-warning|bg-destructive/);
  });
});
