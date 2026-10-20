import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { NOTIFICATION_PARAMS, PARAM_DEFAULTS, type SendableType } from "@/domain/notifications";
import { MANAGER_RIGHTS, ROLES } from "@/domain/permissions";
import { LOCALES } from "@/i18n/locale";

import en from "../src/i18n/messages/en.json";
import ru from "../src/i18n/messages/ru.json";
import uz from "../src/i18n/messages/uz.json";

// "Texts come from the translation files by type" (build-plan 0.11); 11-screens-and-ux.md rule 14
// (no text in a screen, so no raw code either). Plan of 0.11, decision 10: every type notify()
// accepts has `notifications.types.<TYPE>` in uz, ru and en, and every argument of the text is
// one of its params; the role of BRANCH_ROLE_VACANT shows as a word (review of the plan, Should
// fix 3).

const MESSAGES = { uz, ru, en } as const;

/** Invented values for the params of each sendable type. */
const ORDER_ACTION = { actor: "Demo Manager", count: 15, branch: "DEMO" };
const ORDERS_WAITING = { count: 9, hours: 24 };

const SAMPLE: { [Type in SendableType]: Record<string, string | number> } = {
  REQUEST_SUBMITTED: ORDER_ACTION,
  REQUEST_HEAD_APPROVED: ORDER_ACTION,
  REQUEST_PRINCIPAL_APPROVED: ORDER_ACTION,
  REQUEST_FINANCE_APPROVED: ORDER_ACTION,
  CASH_GIVEN: { ...ORDER_ACTION, amount: "650 000 so'm", via: "money" },
  CASH_RETURNED: { ...ORDER_ACTION, amount: "50 000 so'm" },
  CASH_PAID_BACK: { ...ORDER_ACTION, amount: "30 000 so'm" },
  CASH_SETTLED: { ...ORDER_ACTION, amount: "20 000 so'm", direction: "TO_FINANCE" },
  REQUEST_SENT_BACK: ORDER_ACTION,
  REQUEST_SENT_BACK_FOR_CORRECTION: ORDER_ACTION,
  REQUEST_REJECTED: ORDER_ACTION,
  REQUEST_SENT_TO_SETTLEMENT: ORDER_ACTION,
  OVERSPEND_ABOVE_GUARD: ORDER_ACTION,
  OVERSPEND_ACKNOWLEDGED: ORDER_ACTION,
  REQUEST_CLOSED: ORDER_ACTION,
  REQUEST_REOPENED: ORDER_ACTION,
  PURCHASE_CANCELLED: ORDER_ACTION,
  PRICE_DIFFERS: { count: 2, branch: "DEMO" },
  MINIMUM_STOCK_REACHED: { item: "Demo notebook — A4", branch: "DEMO" },
  STOCK_CHANGE_ASKED: {
    actor: "Demo Manager",
    number: "WOF-DEMO-26-0004",
    branch: "DEMO",
    kind: "WRITE_OFF",
  },
  STOCK_CHANGE_DECIDED: {
    number: "WOF-DEMO-26-0004",
    branch: "DEMO",
    kind: "WRITE_OFF",
    outcome: "approved",
  },
  TRANSFER_SENT: { actor: "Demo Manager", number: "TRF-DEMO-26-0007", branch: "DEMO" },
  TRANSFER_CANCELLED: { actor: "Demo Manager", number: "TRF-DEMO-26-0007", branch: "DEMO" },
  REQUEST_CANCELLED: ORDER_ACTION,
  REQUEST_MOVED_IN: ORDER_ACTION,
  REQUEST_MOVED_OUT: { ...ORDER_ACTION, manager: "Demo Second Manager" },
  REQUEST_WAITING_24H: ORDERS_WAITING,
  REQUEST_WAITING_48H: ORDERS_WAITING,
  NEEDED_BY_NEAR: { count: 3, branch: "DEMO" },
  STOCK_CHECK_MISMATCH: { count: 2 },
  BRANCH_ROLE_VACANT: { branch: "DEMO", role: "PRINCIPAL" },
  MANAGER_RIGHT_SWITCHED: { right: "RECORD_PURCHASES", state: "on" },
  PRODUCT_SUGGESTED: { name: "Demo glue stick", branch: "DEMO" },
  PRODUCT_SUGGESTION_DECIDED: { name: "Demo glue stick", outcome: "added" },
};

/** The free text of a sample that the text must show as it is; null for a type of codes only. */
const SHOWN: { [Type in SendableType]: string | null } = {
  REQUEST_SUBMITTED: "Demo Manager",
  REQUEST_HEAD_APPROVED: "Demo Manager",
  REQUEST_PRINCIPAL_APPROVED: "Demo Manager",
  REQUEST_FINANCE_APPROVED: "Demo Manager",
  CASH_GIVEN: "650 000 so'm",
  CASH_RETURNED: "50 000 so'm",
  CASH_PAID_BACK: "30 000 so'm",
  CASH_SETTLED: "20 000 so'm",
  REQUEST_SENT_BACK: "Demo Manager",
  REQUEST_SENT_BACK_FOR_CORRECTION: "Demo Manager",
  REQUEST_REJECTED: "Demo Manager",
  REQUEST_SENT_TO_SETTLEMENT: "Demo Manager",
  OVERSPEND_ABOVE_GUARD: "Demo Manager",
  OVERSPEND_ACKNOWLEDGED: "Demo Manager",
  REQUEST_CLOSED: "Demo Manager",
  REQUEST_REOPENED: "Demo Manager",
  PURCHASE_CANCELLED: "Demo Manager",
  PRICE_DIFFERS: "DEMO",
  MINIMUM_STOCK_REACHED: "Demo notebook — A4",
  STOCK_CHANGE_ASKED: "WOF-DEMO-26-0004",
  STOCK_CHANGE_DECIDED: "WOF-DEMO-26-0004",
  TRANSFER_SENT: "TRF-DEMO-26-0007",
  TRANSFER_CANCELLED: "TRF-DEMO-26-0007",
  REQUEST_CANCELLED: "Demo Manager",
  REQUEST_MOVED_IN: "Demo Manager",
  REQUEST_MOVED_OUT: "Demo Second Manager",
  REQUEST_WAITING_24H: null,
  REQUEST_WAITING_48H: null,
  NEEDED_BY_NEAR: "DEMO",
  STOCK_CHECK_MISMATCH: null,
  BRANCH_ROLE_VACANT: "DEMO",
  MANAGER_RIGHT_SWITCHED: null,
  PRODUCT_SUGGESTED: "Demo glue stick",
  PRODUCT_SUGGESTION_DECIDED: "Demo glue stick",
};

describe("notification texts by type (build-plan 0.11; rule 14)", () => {
  for (const locale of LOCALES) {
    for (const type of Object.keys(NOTIFICATION_PARAMS) as SendableType[]) {
      it(`${locale}: ${type} has a text whose arguments are its params`, () => {
        const errors: unknown[] = [];
        const t = createTranslator({
          locale,
          messages: MESSAGES[locale],
          onError: (error) => errors.push(error),
        });
        expect(Object.keys(SAMPLE[type]).sort()).toEqual([...NOTIFICATION_PARAMS[type]].sort());

        const text = t(`notifications.types.${type}`, SAMPLE[type]);

        expect(errors).toEqual([]);
        expect(text).not.toMatch(/[{}]/);
        const shown = SHOWN[type];
        if (shown !== null) expect(text).toContain(shown);
        // A text that ignores a param would pass without it: each one changes the text.
        for (const param of NOTIFICATION_PARAMS[type]) {
          const without = { ...SAMPLE[type], [param]: "ZZZ" };
          expect(t(`notifications.types.${type}`, without)).not.toBe(text);
        }
      });
    }

    it(`${locale}: Cash given of the approval and of the Money tab differ; a stored one without \`via\` reads as the approval's (plan of 4.3, decided item 7)`, () => {
      const t = createTranslator({ locale, messages: MESSAGES[locale] });
      const stored = Object.fromEntries(
        Object.entries(SAMPLE.CASH_GIVEN).filter(([key]) => key !== "via"),
      );
      const approval = t("notifications.types.CASH_GIVEN", {
        ...SAMPLE.CASH_GIVEN,
        via: "approval",
      });
      const money = t("notifications.types.CASH_GIVEN", { ...SAMPLE.CASH_GIVEN, via: "money" });
      expect(money).not.toBe(approval);
      expect(t("notifications.types.CASH_GIVEN", { ...PARAM_DEFAULTS.CASH_GIVEN, ...stored })).toBe(
        approval,
      );
    });

    it(`${locale}: a submit of 15 orders says 15 (build-plan 2.1, Done when; 10, Notifications)`, () => {
      const t = createTranslator({ locale, messages: MESSAGES[locale] });
      const text = t("notifications.types.REQUEST_SUBMITTED", ORDER_ACTION);
      expect(text).toMatch(/\b15\b/);
      expect(text).toContain("DEMO");
    });

    it(`${locale}: the waiting texts take the hours from the setting, not a fixed 24 (decision 3)`, () => {
      const t = createTranslator({ locale, messages: MESSAGES[locale] });
      for (const type of ["REQUEST_WAITING_24H", "REQUEST_WAITING_48H"] as const) {
        const text = t(`notifications.types.${type}`, { count: 9, hours: 36 });
        expect(text).toMatch(/\b36\b/);
        expect(text).toMatch(/\b9\b/);
      }
    });

    it(`${locale}: BRANCH_ROLE_VACANT names each role by a word, never its code (Should fix 3)`, () => {
      const t = createTranslator({ locale, messages: MESSAGES[locale] });
      const texts = ROLES.map((role) =>
        t("notifications.types.BRANCH_ROLE_VACANT", { branch: "DEMO", role }),
      );
      expect(new Set(texts).size).toBe(ROLES.length);
      for (const [index, role] of ROLES.entries()) expect(texts[index]).not.toContain(role);
    });

    it(`${locale}: MANAGER_RIGHT_SWITCHED names each right by a word and says on or off (03, Manager rights; plan of 1.4)`, () => {
      const t = createTranslator({ locale, messages: MESSAGES[locale] });
      const texts = MANAGER_RIGHTS.flatMap((right) =>
        (["on", "off"] as const).map((state) =>
          t("notifications.types.MANAGER_RIGHT_SWITCHED", { right, state }),
        ),
      );
      expect(new Set(texts).size).toBe(MANAGER_RIGHTS.length * 2);
      for (const text of texts) {
        for (const right of MANAGER_RIGHTS) expect(text).not.toContain(right);
        expect(text).not.toContain("?");
      }
    });

    it(`${locale}: PRODUCT_SUGGESTION_DECIDED says added or declined (04-catalogs.md rule 8: "notified either way")`, () => {
      const t = createTranslator({ locale, messages: MESSAGES[locale] });
      const [added, declined] = (["added", "declined"] as const).map((outcome) =>
        t("notifications.types.PRODUCT_SUGGESTION_DECIDED", { name: "Demo glue stick", outcome }),
      );
      expect(added).not.toBe(declined);
      for (const text of [added, declined]) expect(text).toContain("Demo glue stick");
    });
  }
});

describe('plural forms of the order count (10, Notifications: "submitted 15 orders")', () => {
  function submitted(locale: keyof typeof MESSAGES, count: number) {
    const t = createTranslator({ locale, messages: MESSAGES[locale] });
    return t("notifications.types.REQUEST_SUBMITTED", { ...ORDER_ACTION, count });
  }

  it("ru: 1, 2 and 5 give the three forms заказ, заказа, заказов", () => {
    expect(submitted("ru", 1)).toContain("1 заказ,");
    expect(submitted("ru", 2)).toContain("2 заказа,");
    expect(submitted("ru", 5)).toContain("5 заказов,");
    expect(submitted("ru", 15)).toContain("15 заказов,");
    expect(submitted("ru", 21)).toContain("21 заказ,");
  });

  it("en: 1 order, 2 orders", () => {
    expect(submitted("en", 1)).toContain("1 order ");
    expect(submitted("en", 2)).toContain("2 orders ");
  });

  it("uz: one form, the number before it", () => {
    expect(submitted("uz", 1)).toContain("1 ta buyurtma");
    expect(submitted("uz", 15)).toContain("15 ta buyurtma");
  });
});

/**
 * The text a reader sees in an ICU message: the literal parts and the bodies of `select` and
 * `plural` branches, without argument names and branch keys. The keys `CREATE_REQUESTS` and
 * `CLOSE_ALONE` are internal codes that keep their names (D43; review of 2.1, correction 1).
 */
function visibleText(message: string): string {
  let index = 0;
  function body(stopAtClose: boolean): string {
    let text = "";
    while (index < message.length) {
      const char = message[index]!;
      if (char === "}" && stopAtClose) {
        index += 1;
        return text;
      }
      if (char !== "{") {
        text += char;
        index += 1;
        continue;
      }
      index += 1;
      const head = /^\s*(\w+)\s*(?:,\s*(\w+)\s*)?([,}])/.exec(message.slice(index));
      if (!head) throw new Error(`Not an ICU argument at ${index}: ${message}`);
      index += head[0].length;
      if (head[3] === "}") continue;
      if (!["select", "plural", "selectordinal"].includes(head[2] ?? "")) {
        index = message.indexOf("}", index) + 1;
        continue;
      }
      for (;;) {
        const key = /^\s*(?:offset:\d+\s*)?(=?[\w-]+)?\s*([{}])/.exec(message.slice(index));
        if (!key) throw new Error(`Not an ICU branch at ${index}: ${message}`);
        index += key[0].length;
        if (key[2] === "}") break;
        text += ` ${body(true)} `;
      }
    }
    return text;
  }
  return body(false);
}

/** Every text of a message file with its path. */
function textsOf(node: unknown, path = ""): [string, string][] {
  if (typeof node === "string") return [[path, node]];
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) =>
    textsOf(value, path ? `${path}.${key}` : key),
  );
}

/**
 * "Request" and its words in the three languages. "ariza" only at a word's start, so
 * "inventarizatsiya" (stock count) is not it; "soʻrash" (to ask) is another word.
 */
const REQUEST_WORD = /request|заявк|\bariza|so[ʻ'‘]rov/i;

describe('no built text says request for this flow (build-plan 2.1: "every other built text … follows")', () => {
  it("reads past argument names and branch keys, and still sees a visible word in a branch", () => {
    const message = "Switched {right, select, CREATE_REQUESTS {Add orders} other {?}} for {name}.";
    expect(visibleText(message)).not.toMatch(REQUEST_WORD);
    expect(visibleText(message)).toContain("Add orders");
    const visible = "Switched {right, select, CREATE_REQUESTS {Create requests} other {?}}.";
    expect(visibleText(visible)).toMatch(REQUEST_WORD);
  });

  for (const locale of LOCALES) {
    it(`${locale}: every text`, () => {
      const found = textsOf(MESSAGES[locale])
        .filter(([, text]) => REQUEST_WORD.test(visibleText(text)))
        .map(([path]) => path);
      expect(found).toEqual([]);
    });
  }
});
