import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";

import { LanguageChoice } from "./language-choice";
import { ThemeChoice } from "./theme-choice";

// 02-assumptions.md A2 (three languages, each user picks one) and 11-screens-and-ux.md rule 15
// (the theme follows the device until the user chooses one); plan of 0.10b, decision 17.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("./actions", () => ({ chooseOwnLanguageAction: async () => ({ ok: true, data: null }) }));

function wrap(node: React.ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tashkent">
      {node}
    </NextIntlClientProvider>,
  );
}

describe("the language choice on /profile (A2)", () => {
  it("names each language in its own words, the person's own one chosen", () => {
    const html = wrap(<LanguageChoice current="ru" />);
    expect(html).toContain('aria-label="Language"');
    for (const name of ["Oʻzbekcha", "Русский", "English"]) expect(html).toContain(name);
    expect(html).toMatch(/aria-checked="true"[^>]*>Русский/);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  });
});

describe("the theme choice on /profile (11 rule 15)", () => {
  it("offers Like my device first, then Light and Dark, with the device chosen until the browser says otherwise", () => {
    const html = wrap(<ThemeChoice />);
    const words = [...html.matchAll(/role="radio"[^>]*>([^<]+)</g)].map((match) => match[1]);
    expect(words).toEqual(["Like my device", "Light theme", "Dark theme"]);
    expect(html).toMatch(/aria-checked="true"[^>]*>Like my device/);
  });
});
