import { describe, expect, it } from "vitest";

import { linkHref, parseHelpText, parseInline, plainText } from "./text";

// The text format of the help files (plan of 9.7, decided item 5): paragraphs, lists, numbered
// lists, tables, headings, bold, code and links, and nothing else; no HTML is ever read.

describe("the help text format (plan of 9.7, decided item 5)", () => {
  it("reads bold, code and links inside a line", () => {
    expect(parseInline("Press **Submit**, see `CHL-26-0142` and [orders](orders).")).toEqual([
      { kind: "text", text: "Press " },
      { kind: "bold", text: "Submit" },
      { kind: "text", text: ", see " },
      { kind: "code", text: "CHL-26-0142" },
      { kind: "text", text: " and " },
      { kind: "link", text: "orders", href: "#orders" },
      { kind: "text", text: "." },
    ]);
  });

  it("links an id of the page with #, and keeps an app address or an https address", () => {
    expect(linkHref("approval-finance-step")).toBe("#approval-finance-step");
    expect(linkHref("/login")).toBe("/login");
    expect(linkHref("https://ombor.sodiqschool.uz")).toBe("https://ombor.sodiqschool.uz");
  });

  it("parts blocks at an empty line: heading, paragraph, list, numbered list, table", () => {
    const blocks = parseHelpText(
      [
        "### Who",
        "",
        "One line\nand the next.",
        "",
        "- first\n- second",
        "",
        "1. one\n2. two",
        "",
        "| Role | Does |\n| --- | --- |\n| Head | Approves |",
      ].join("\n"),
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "table",
    ]);
    expect(blocks[1]).toEqual({
      kind: "paragraph",
      content: [{ kind: "text", text: "One line and the next." }],
    });
    expect(blocks[2]).toMatchObject({
      ordered: false,
      items: [[{ text: "first" }], [{ text: "second" }]],
    });
    expect(blocks[3]).toMatchObject({
      ordered: true,
      items: [[{ text: "one" }], [{ text: "two" }]],
    });
    expect(blocks[4]).toEqual({
      kind: "table",
      header: [[{ kind: "text", text: "Role" }], [{ kind: "text", text: "Does" }]],
      rows: [[[{ kind: "text", text: "Head" }], [{ kind: "text", text: "Approves" }]]],
    });
  });

  it("keeps HTML as plain words: a tag is never read", () => {
    expect(parseHelpText("<b>not bold</b>")).toEqual([
      { kind: "paragraph", content: [{ kind: "text", text: "<b>not bold</b>" }] },
    ]);
  });

  it("gives the plain words of a text for the search", () => {
    expect(plainText("Press **Close**.\n\n- a `b`\n\n| X |\n| --- |\n| y |")).toBe(
      "Press Close. a b X y",
    );
  });
});
