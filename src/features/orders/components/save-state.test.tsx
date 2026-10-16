import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { type SaveState, SaveStateText } from "./save-state";

// 11-screens-and-ux.md rule 4 (errors say what to do next) and rule 7 (bad internet); review of
// the plan of 2.6, correction 2: after "Not saved" the row offers "Try again".
function render(state: SaveState): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tashkent">
      <SaveStateText state={state} onTryAgain={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("SaveStateText (11 rules 4 and 7)", () => {
  it("while a lost save waits to be sent again: No connection. Trying again…, no button", () => {
    const html = render({ kind: "retrying" });
    expect(html).toContain(en.orders.save.retrying);
    expect(html).not.toContain("<button");
  });

  it("when the tries are used up: Not saved, with a Try again button", () => {
    const html = render({ kind: "notSaved" });
    expect(html).toContain(en.orders.save.failed);
    expect(html).toMatch(new RegExp(`<button[^>]*>.*${en.orders.save.tryAgain}`));
  });

  it("Saved and a refusal show no Try again", () => {
    expect(render({ kind: "saved" })).toContain(en.orders.save.saved);
    const refused = render({ kind: "error", text: "Type the date as 08.10.2026" });
    expect(refused).toContain("Type the date as 08.10.2026");
    expect(refused).not.toContain(en.orders.save.tryAgain);
  });
});
