import { createTranslator, NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";

// 03-roles-and-permissions.md rule 9: "The Help page (/help, section 11) is the one page that
// opens without signing in. It reads no data." Build-plan 9.7, Done when: "a test shows /help
// answers to a visitor with no session and makes no database read". The database client is
// replaced by one that counts every use; a visitor has no session cookie.

const reads = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/server/db/client", () => ({
  db: new Proxy(
    {},
    {
      get() {
        reads.count += 1;
        throw new Error("The Help page read the database.");
      },
    },
  ),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, has: () => false, getAll: () => [] }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: "en", messages: en, namespace: namespace as never }),
}));

const { default: HelpPage } = await import("./page");

beforeEach(() => {
  reads.count = 0;
});

describe("the Help page for a visitor (03 rule 9; 11 Help page; build-plan 9.7)", () => {
  it("answers without a session and without a database read", async () => {
    const page = await HelpPage();
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tashkent">
        {page}
      </NextIntlClientProvider>,
    );

    expect(reads.count).toBe(0);
    expect(html).toContain(en.help.title);
    expect(html).toContain("Order statuses");
    expect(html).toContain('id="finance-step"');
    // A visitor is offered the sign-in, the language select and no way "back" into the app.
    expect(html).toContain(en.help.signIn);
    expect(html).not.toContain(en.help.backToApp);
    expect(html).toContain('id="language"');
  });
});
