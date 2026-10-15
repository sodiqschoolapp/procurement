import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { priceHintPercent } from "@/domain/order-totals";

import en from "./messages/en.json";
import ru from "./messages/ru.json";
import uz from "./messages/uz.json";

// 05-order-request-form.md, Ticking and filters: Price hint ('a label such as "+35% vs catalog
// price"'); 11-screens-and-ux.md rule 14 (every label from the message files).

function label(messages: typeof en, locale: string, percent: bigint): string {
  const t = createTranslator({ locale, messages, namespace: "orders" });
  return t("priceHint", { percent: Number(percent) });
}

describe("the price hint label (05 Price hint)", () => {
  const percent = priceHintPercent(6_750n, 5_000n, 20);

  it('reads "+35% vs catalog price" in English', () => {
    expect(percent).toBe(35n);
    expect(label(en, "en", 35n)).toBe("+35% vs catalog price");
  });

  it("carries +35 in Uzbek and Russian, and −35 below the price", () => {
    expect(label(uz, "uz", 35n)).toContain("+35%");
    expect(label(ru, "ru", 35n)).toContain("+35%");
    expect(label(en, "en", -35n)).toBe("-35% vs catalog price");
  });
});
