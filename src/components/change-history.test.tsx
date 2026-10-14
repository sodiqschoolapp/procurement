import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/domain/audit";
import { NBSP } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";

import { ChangeHistory, type ChangeHistoryEntry, type HistoryField } from "./change-history";

// 04-catalogs.md rule 9: "who changed what and when" (build-plan 0.9); 11-screens-and-ux.md
// rule 10 (money, dates and 24-hour Tashkent time through the shared formats) and rule 14 (every
// label from the three message files). Rendered with react-dom/server, as no page shows it yet.

const MESSAGES = { uz, ru, en } as const;

function render(
  entries: readonly ChangeHistoryEntry[],
  fields: Readonly<Record<string, HistoryField>> = {},
  locale: Locale = "en",
): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Tashkent">
      <ChangeHistory entries={entries} fields={fields} />
    </NextIntlClientProvider>,
  );
}

/** The visible text, with tags removed and spaces made plain. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll(NBSP, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FIELDS: Record<string, HistoryField> = {
  fullName: { label: "audit.who", kind: "text" },
  limit: { label: "audit.what", kind: "money" },
  isActive: { label: "audit.when", kind: "boolean" },
  locale: { label: "audit.title", kind: { enum: "languages" } },
};

const EDIT: ChangeHistoryEntry = {
  id: "00000000-0000-4000-8000-000000000001",
  action: "user.create",
  actorName: "Invented Head",
  // 20:30 UTC on 31 December is 01:30 on 1 January in Tashkent (developer-rules.md rule 10).
  createdAt: new Date("2026-12-31T20:30:00Z"),
  before: { fullName: "Old Name", limit: "1250000", isActive: true, locale: "uz", same: "x" },
  after: { fullName: "New Name", limit: "2500000", isActive: false, locale: "ru", same: "x" },
};

describe("the change-history list (04-catalogs.md rule 9)", () => {
  it("shows when in Tashkent time, who, what was done, and old then new for each field", () => {
    const text = textOf(render([EDIT], FIELDS));

    expect(text).toContain("01.01.2027 01:30");
    expect(text).toContain("Invented Head");
    expect(text).toContain("Account created");
    expect(text).toContain("Who Before Old Name After New Name");
    expect(text).toContain("What Before 1 250 000 so'm After 2 500 000 so'm");
    expect(text).toContain("When Before Yes After No");
    expect(text).toContain("Change history Before O'zbekcha After Русский");
    // An unchanged field is not listed.
    expect(text).not.toContain("Other field");
  });

  it("strikes the old value through and marks the new one", () => {
    const html = render([EDIT], FIELDS);

    expect(html).toMatch(/<del[^>]*>.*Old Name<\/del>/);
    expect(html).toMatch(/<ins[^>]*>.*New Name<\/ins>/);
  });

  it("shows a create with its new values only", () => {
    const text = textOf(
      render([{ ...EDIT, before: null, after: { fullName: "New Name" } }], FIELDS),
    );

    expect(text).toContain("Who After New Name");
    expect(text).not.toContain("Before");
  });

  it("never shows a raw code: an unknown action, field, enum value or money text", () => {
    const text = textOf(
      render(
        [
          {
            ...EDIT,
            action: "branch.rename",
            before: null,
            after: { mysteryField: "plain", locale: "xx", limit: "12.5", nested: { amount: "5" } },
          },
        ],
        FIELDS,
      ),
    );

    expect(text).toContain("Changed");
    expect(text).toContain("Other field After plain");
    expect(text).not.toContain("mysteryField");
    expect(text).toContain("Change history After (unknown value)");
    expect(text).toContain("What After (unknown value)");
    expect(text).not.toContain("branch.rename");
    expect(text).toContain("Other field After (unknown value)");
    expect(text).not.toContain("amount");
  });

  it("shows a moment and a date by their kind, and an empty value as such", () => {
    const text = textOf(
      render(
        [
          {
            ...EDIT,
            before: { at: "2026-12-31T20:30:00.000Z" },
            after: { at: null, on: "2026-10-08" },
          },
        ],
        { at: { label: "audit.when", kind: "moment" }, on: { label: "audit.what", kind: "date" } },
      ),
    );

    expect(text).toContain("When Before 01.01.2027 01:30 After (empty)");
    expect(text).toContain("What After 08.10.2026");
  });

  it("shows one line when there is nothing yet", () => {
    expect(textOf(render([]))).toBe("No changes yet");
    expect(textOf(render([], {}, "ru"))).toBe("Изменений пока нет");
    expect(textOf(render([], {}, "uz"))).toBe("Hozircha o'zgarish yo'q");
  });

  // 11-screens-and-ux.md rule 14; plan of 0.9: every action that writes an audit row has its label.
  it.each(AUDIT_ACTIONS)("has a label for the action %s in uz, ru and en", (action) => {
    for (const locale of ["uz", "ru", "en"] as const) {
      const [area, verb] = action.split(".") as [string, string];
      const actions = MESSAGES[locale].audit.actions as Record<string, Record<string, string>>;
      expect(actions[area]?.[verb], `${locale}: ${action}`).toBeTruthy();
    }
  });
});
