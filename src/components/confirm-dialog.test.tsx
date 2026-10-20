import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { ConfirmDialogBody, type ConfirmDialogText } from "./confirm-dialog";

// 11-screens-and-ux.md rule 6: irreversible actions ask for confirmation and state the result;
// docs/design-system.md, Buttons (primary, or danger for a loss; buttons in one row have one
// size). The body is rendered with react-dom/server; the Base UI popup around it needs a browser.

function render(text: ConfirmDialogText, pending = false): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Tashkent">
      <ConfirmDialogBody
        titleId="t"
        resultId="r"
        text={text}
        pending={pending}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

const SUBMIT: ConfirmDialogText = {
  title: "Submit the request?",
  result: "It goes to the Head for approval and can no longer be edited.",
  confirm: "Submit",
};

describe("the confirm dialog (11-screens rule 6)", () => {
  it("shows the title, the sentence stating the result, Cancel and the confirm button", () => {
    const html = render(SUBMIT);
    expect(html).toContain('<h2 id="t"');
    expect(html).toContain(SUBMIT.title);
    expect(html).toContain(`<p id="r"`);
    expect(html).toContain(SUBMIT.result);
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain(`>${en.common.cancel}</button>`);
    expect(html).toContain(">Submit</button>");
  });

  it("the confirm button is primary, Cancel secondary, both the default size", () => {
    const html = render(SUBMIT);
    expect(html.match(/bg-primary /g)).toHaveLength(1);
    expect(html.match(/bg-secondary /g)).toHaveLength(1);
    // The default button of docs/design-system.md, Buttons (D60): 44 at phone width, 36 from sm.
    expect(html.match(/h-11 px-3\.5 text-sm sm:h-9/g)).toHaveLength(2);
  });

  it("an irreversible loss uses the danger kind and no primary fill", () => {
    const html = render({ ...SUBMIT, confirm: "Reject", danger: true });
    expect(html).toContain("text-destructive");
    expect(html).not.toMatch(/bg-primary /);
  });

  it("while the action runs, the confirm button is busy and Cancel is off", () => {
    const html = render(SUBMIT, true);
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});
