import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { REQUEST_STATUSES } from "@/domain/request-status";
import { NBSP } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";

import {
  ColourLabel,
  type ColourLabelProps,
  ColourLabels,
  DocumentStatusLabel,
  RequestStatusLabel,
  SubstitutedLabel,
} from "./status-label";

// 11-screens-and-ux.md rule 11 (status labels look the same everywhere) and rule 15 (colour only
// for meaning); docs/design-system.md, Parts, "Status and outcome" (D60, 21.10.2026: a status is a
// dot and its word; a green label of one order is its plain word without "0");
// 06-approval-workflow.md, Statuses; 08-money-and-settlement.md, The three colours ("A label is
// never colour alone. It carries an icon, a word and the amount"); review of 0.10a corrections
// 2 and 3. Rendered with react-dom/server.

const MESSAGES = { uz, ru, en } as const;

function render(element: ReactElement, locale: Locale = "en"): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Tashkent">
      {element}
    </NextIntlClientProvider>,
  );
}

/** The visible text, with the screen-reader name removed and spaces made plain. */
function visibleText(html: string): string {
  return html
    .replace(/<span class="sr-only">[^<]*<\/span>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replaceAll(NBSP, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ")
    .trim();
}

const COLOUR_TOKENS = /\b(bg|text)-(primary|success|warning|destructive)/;

describe("request status labels (06 Statuses; 11-screens rule 11)", () => {
  for (const locale of ["uz", "ru", "en"] as const) {
    it(`each of the ten statuses shows its ${locale} word beside its dot`, () => {
      for (const status of REQUEST_STATUSES) {
        const html = render(<RequestStatusLabel status={status} />, locale);
        expect(visibleText(html), status).toBe(MESSAGES[locale].requestStatus[status]);
        expect(html, status).toMatch(/<span aria-hidden="true" class="[^"]*rounded-full/);
      }
    });
  }

  it("the dot's colour means something: blue in the flow, red sent back or rejected, green closed, grey otherwise", () => {
    const dotOf = (status: (typeof REQUEST_STATUSES)[number]) =>
      /data-status-dot="(\w+)"/.exec(render(<RequestStatusLabel status={status} />))?.[1];
    expect(dotOf("PENDING_HEAD")).toBe("info");
    expect(dotOf("PURCHASING")).toBe("info");
    expect(dotOf("SETTLEMENT")).toBe("info");
    expect(dotOf("RETURNED")).toBe("red");
    expect(dotOf("REJECTED")).toBe("red");
    expect(dotOf("CLOSED")).toBe("green");
    expect(dotOf("DRAFT")).toBe("grey");
    expect(dotOf("CANCELLED")).toBe("grey");
  });

  it("never uses the brand orange (11 rule 11: orange is never a status colour)", () => {
    for (const status of REQUEST_STATUSES) {
      expect(render(<RequestStatusLabel status={status} />), status).not.toMatch(
        /\b(bg|text)-(brand|primary)\b/,
      );
    }
  });
});

describe("the Substituted label (07 Substitution; plan of 3.6, decided item 8)", () => {
  for (const locale of ["uz", "ru", "en"] as const) {
    it(`shows its ${locale} word with an icon, in the info token`, () => {
      const html = render(<SubstitutedLabel />, locale);
      expect(visibleText(html)).toBe(MESSAGES[locale].orders.substituted);
      expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
      expect(html).toContain("bg-info-bg");
      expect(html).not.toMatch(COLOUR_TOKENS);
    });
  }
});

describe("colour labels (08 The three colours; review correction 2)", () => {
  const cases: { props: ColourLabelProps; text: string; tokens: string }[] = [
    // 08 worked through by the review: Cheaper → Total +50 000 → amber "Left 50 000 so'm".
    {
      props: { label: "total", colour: "amber", difference: 50_000n },
      text: "Left 50 000 so'm",
      tokens: "bg-warning-bg text-warning",
    },
    // Dearer → −30 000 → red "Over 30 000 so'm", shown without its sign.
    {
      props: { label: "total", colour: "red", difference: -30_000n },
      text: "Over by 30 000 so'm",
      tokens: "bg-destructive-bg text-destructive",
    },
    // Green says its plain word, without "0" (D60, 21.10.2026).
    {
      props: { label: "total", colour: "green", difference: 0n },
      text: "Even",
      tokens: "bg-success-bg text-success",
    },
    // Fewer: 90 of 100 → amber "Less 10"; the quantity format drops trailing zeros.
    {
      props: { label: "number", colour: "amber", difference: "10.000" },
      text: "Less 10",
      tokens: "bg-warning-bg",
    },
    {
      props: { label: "number", colour: "red", difference: "-2.500" },
      text: "More 2.5",
      tokens: "bg-destructive-bg",
    },
    {
      props: { label: "number", colour: "green", difference: "0.000" },
      text: "Quantity as planned",
      tokens: "bg-success-bg",
    },
    {
      props: { label: "price", colour: "amber", difference: 1_250_000n },
      text: "Cheaper 1 250 000 so'm",
      tokens: "bg-warning-bg",
    },
    {
      props: { label: "price", colour: "red", difference: -5n },
      text: "Dearer 5 so'm",
      tokens: "bg-destructive-bg",
    },
    // Two prices that cancel out: orange with 0 (08 Price row "at or below"; plan of 3.8, item 3).
    {
      props: { label: "price", colour: "amber", difference: 0n },
      text: "Cheaper 0 so'm",
      tokens: "bg-warning-bg",
    },
    // A set's Number and Price: the worst colour and how many orders carry it (3.8, item 2).
    {
      props: { label: "number", colour: "red", orders: 2 },
      text: "More 2 orders",
      tokens: "bg-destructive-bg",
    },
    {
      props: { label: "price", colour: "green", orders: 1 },
      text: "Price as planned 1 order",
      tokens: "bg-success-bg",
    },
    // Grey: "In progress" for Number and Total, "Not bought yet" for Price; no amount yet.
    {
      props: { label: "number", colour: "grey" },
      text: "In progress",
      tokens: "bg-muted text-muted-foreground",
    },
    { props: { label: "total", colour: "grey" }, text: "In progress", tokens: "bg-muted" },
    { props: { label: "price", colour: "grey" }, text: "Not bought yet", tokens: "bg-muted" },
  ];

  for (const { props, text, tokens } of cases) {
    it(`${props.label} ${props.colour}: "${text}" with its icon and tokens`, () => {
      const html = render(<ColourLabel {...props} />);
      expect(visibleText(html)).toBe(text);
      expect(html).toContain(tokens);
      expect(html).toMatch(/<svg/);
      expect(visibleText(html)).not.toContain("-");
    });
  }

  it("names the label for screen readers", () => {
    expect(render(<ColourLabel label="price" colour="grey" />)).toContain(
      '<span class="sr-only">Price</span>',
    );
  });

  it("amounts use tabular figures (design system, Type; review correction 3)", () => {
    const html = render(<ColourLabel label="total" colour="amber" difference={50_000n} />);
    expect(html).toMatch(/<span class="tabular-nums">50.000.so&#x27;m<\/span>/);
  });

  it("shows the words of all three languages", () => {
    const html = render(<ColourLabel label="total" colour="amber" difference={1n} />, "ru");
    expect(visibleText(html)).toBe("Остаток 1 so'm");
    expect(
      visibleText(render(<ColourLabel label="number" colour="red" difference="-1" />, "uz")),
    ).toBe("Koʻp 1");
  });

  it("a set's count in all three languages (plan of 3.8, decided item 2)", () => {
    const set = <ColourLabel label="number" colour="amber" orders={5} />;
    expect(visibleText(render(set, "ru"))).toBe("Меньше 5 заказов");
    expect(visibleText(render(set, "uz"))).toBe(`${uz.colourLabel.number.less} 5 ta buyurtma`);
  });

  it("refuses a set's count below 1", () => {
    expect(() => render(<ColourLabel label="price" colour="green" orders={0} />)).toThrow(
      /at least one order/,
    );
  });

  it("ColourLabels shows the three labels of the server's text (plan of 3.8)", () => {
    const html = render(
      <ColourLabels
        colours={{
          number: { colour: "green", difference: "0" },
          price: { colour: "amber", difference: "50000" },
          total: { colour: "amber", difference: "50000" },
        }}
      />,
    );
    expect(visibleText(html)).toBe("Quantity as planned Cheaper 50 000 so'm Left 50 000 so'm");
  });

  const refusals: { props: ColourLabelProps; needs: RegExp }[] = [
    { props: { label: "total", colour: "amber", difference: -1n }, needs: /above 0/ },
    { props: { label: "total", colour: "amber", difference: 0n }, needs: /above 0/ },
    { props: { label: "total", colour: "red", difference: 1n }, needs: /below 0/ },
    { props: { label: "total", colour: "red", difference: 0n }, needs: /below 0/ },
    { props: { label: "total", colour: "green", difference: 1n }, needs: /exactly 0/ },
    { props: { label: "total", colour: "green", difference: -1n }, needs: /exactly 0/ },
    { props: { label: "number", colour: "amber", difference: "-0.001" }, needs: /above 0/ },
    { props: { label: "number", colour: "amber", difference: "0.000" }, needs: /above 0/ },
    { props: { label: "number", colour: "red", difference: "0.001" }, needs: /below 0/ },
    { props: { label: "number", colour: "green", difference: "0.001" }, needs: /exactly 0/ },
    { props: { label: "price", colour: "amber", difference: -1n }, needs: /0 or more/ },
    { props: { label: "price", colour: "red", difference: 1n }, needs: /below 0/ },
    { props: { label: "price", colour: "green", difference: 1n }, needs: /exactly 0/ },
  ];

  for (const { props, needs } of refusals) {
    const shown = "difference" in props ? String(props.difference) : "";
    it(`refuses ${props.label} ${props.colour} with a difference of ${shown}`, () => {
      expect(() => render(<ColourLabel {...props} />)).toThrow(needs);
    });
  }

  it("refuses money that is not a bigint and a quantity that is not a decimal text", () => {
    const money = { label: "total", colour: "amber", difference: 5 } as unknown as ColourLabelProps;
    expect(() => render(<ColourLabel {...money} />)).toThrow(/bigint/);
    expect(() => render(<ColourLabel label="number" colour="amber" difference="1e3" />)).toThrow(
      /not a quantity/,
    );
  });
});

describe("DocumentStatusLabel (plan of 7.4c: a cancelled transfer)", () => {
  it("shows Cancelled beside its dot in every language", () => {
    for (const [locale, word] of [
      ["en", "Cancelled"],
      ["ru", "Отменено"],
      ["uz", "Bekor qilindi"],
    ] as const) {
      const html = render(<DocumentStatusLabel type="TRANSFER" status="CANCELLED" />, locale);
      expect(html).toContain('data-document-status="CANCELLED"');
      expect(visibleText(html)).toBe(word);
      expect(html).toContain('data-status-dot="grey"');
    }
  });
});
