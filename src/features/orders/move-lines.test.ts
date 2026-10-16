import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { bindFormatters } from "@/i18n/format";
import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";

import { type MoveTexts, alreadyDecidedLine, moveFailureLines } from "./move-lines";

// 06-approval-workflow.md rule 7 ("the slower user sees 'Already approved by Dilnoza at
// 14:32'") and rule 8 (the refusal names the orders); review of the plan of 2.10, correction 2:
// the time is Tashkent's, `dd.mm.yyyy hh:mm` through the shared formatters, as History shows it
// (CLAUDE.md rule 10). Names are invented.

function textsOf(messages: typeof en, locale: "uz" | "ru" | "en"): MoveTexts {
  const t = createTranslator({ locale, messages, namespace: "orders.approve" });
  const tMoves = createTranslator({ locale, messages, namespace: "orders.moves" });
  return {
    alreadyDecided: (verb, values) => tMoves(`already.${verb}`, values),
    refused: (code) => t(`refused.${code}`),
    failedLine: (values) => t("failedLine", values),
  };
}

const t = textsOf(en, "en");
const format = bindFormatters("en", "so'm");
// 09:32 UTC is 14:32 in Tashkent (UTC+5).
const decided = {
  orderId: "a",
  verb: "APPROVE" as const,
  name: "Aziz Karimov",
  at: "2026-10-16T09:32:00.000Z",
};

describe("Already approved by … at … (06 rule 7)", () => {
  it("names the approver and the Tashkent time", () => {
    expect(alreadyDecidedLine(decided, t, format)).toBe(
      "Already approved by Aziz Karimov at 16.10.2026 14:32.",
    );
  });

  it("is worded in Uzbek and Russian too, with the same time", () => {
    for (const [locale, messages] of [
      ["uz", uz],
      ["ru", ru],
    ] as const) {
      const line = alreadyDecidedLine(
        decided,
        textsOf(messages, locale),
        bindFormatters(locale, "so'm"),
      );
      expect(line).toContain("Aziz Karimov");
      expect(line).toContain("16.10.2026 14:32");
    }
  });
});

describe("Already sent back / rejected / cancelled / taken back by … (06 rule 7; 2.11 decided item 7)", () => {
  it.each([
    ["SEND_BACK", "Already sent back by Aziz Karimov at 16.10.2026 14:32."],
    ["REJECT", "Already rejected by Aziz Karimov at 16.10.2026 14:32."],
    ["CANCEL", "Already cancelled by Aziz Karimov at 16.10.2026 14:32."],
    ["TAKE_BACK", "Already taken back by Aziz Karimov at 16.10.2026 14:32."],
  ] as const)("%s reads its own verb", (verb, line) => {
    expect(alreadyDecidedLine({ ...decided, verb }, t, format)).toBe(line);
    for (const [locale, messages] of [
      ["uz", uz],
      ["ru", ru],
    ] as const) {
      expect(
        alreadyDecidedLine(
          { ...decided, verb },
          textsOf(messages, locale),
          bindFormatters(locale, "so'm"),
        ),
      ).toContain("16.10.2026 14:32");
    }
  });
});

describe("the lines of a refused Approve (06 rule 8)", () => {
  it("names each order: the approver where one is known, else the refusal's words", () => {
    const lines = moveFailureLines(
      {
        code: "stale_version",
        messageKey: "errors.staleVersion",
        orders: [
          { orderId: "a", code: "stale_version" },
          { orderId: "b", code: "forbidden" },
        ],
      },
      [decided],
      (id) => (id === "a" ? "CHL-26-0141" : "CHL-26-0142"),
      t,
      format,
    );
    expect(lines).toEqual([
      {
        orderId: "a",
        line: "CHL-26-0141 — Already approved by Aziz Karimov at 16.10.2026 14:32.",
      },
      { orderId: "b", line: "CHL-26-0142 — You cannot approve this order at its step." },
    ]);
  });
});
