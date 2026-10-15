import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { NOTIFICATION_PARAMS, type SendableType } from "@/domain/notifications";
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
const SAMPLE: { [Type in SendableType]: Record<string, string | number> } = {
  BRANCH_ROLE_VACANT: { branch: "DEMO", role: "PRINCIPAL" },
  MANAGER_RIGHT_SWITCHED: { right: "RECORD_PURCHASES", state: "on" },
  PRODUCT_SUGGESTED: { name: "Demo glue stick", branch: "DEMO" },
  PRODUCT_SUGGESTION_DECIDED: { name: "Demo glue stick", outcome: "added" },
};

/** The free text of a sample that the text must show as it is; null for a type of codes only. */
const SHOWN: { [Type in SendableType]: string | null } = {
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
