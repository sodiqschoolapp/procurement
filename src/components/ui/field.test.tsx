import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Field } from "./field";
import { Input } from "./input";
import { Select } from "./select";

// docs/design-system.md, Fields: 40 high (44 at phone width and on sign-in), 1 px --input
// border, an error is a --destructive border and one line under the field; a select draws the
// "expand more" icon, never a text caret (D60, 21.10.2026). 11-screens-and-ux.md
// rule 13 (keyboard and screen readers: the label and the error line are tied to the field).

describe("fields (design system, Fields and switches)", () => {
  it("a field without an error: label tied to the input, not invalid, no error line", () => {
    const html = renderToStaticMarkup(
      <Field id="username" label="Username">
        <Input />
      </Field>,
    );
    expect(html).toContain('for="username"');
    expect(html).toContain('id="username"');
    expect(html).not.toContain("aria-invalid=");
    expect(html).not.toContain("aria-describedby=");
    expect(html).toContain("border-input");
    expect(html).toEqual(expect.stringContaining("h-11 sm:h-10"));
  });

  it("an error sets aria-invalid, the danger border and exactly one error line", () => {
    const html = renderToStaticMarkup(
      <Field id="username" label="Username" error="Fill in this field">
        <Input />
      </Field>,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="username-error"');
    expect(html).toContain("aria-invalid:border-destructive");
    expect(html.match(/id="username-error"/g)).toHaveLength(1);
    expect(html.match(/Fill in this field/g)).toHaveLength(1);
  });

  it("the sign-in size is 48 high at phone width", () => {
    expect(renderToStaticMarkup(<Input fieldSize="lg" />)).toContain("h-12");
  });

  it("the select draws the expand_more icon and hides the browser's caret", () => {
    const html = renderToStaticMarkup(
      <Field id="language" label="Language">
        <Select>
          <option value="uz">{"uz"}</option>
        </Select>
      </Field>,
    );
    expect(html).toContain("appearance-none");
    expect(html).toContain('id="language"');
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });
});
