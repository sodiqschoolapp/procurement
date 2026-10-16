import { describe, expect, it } from "vitest";
import * as z from "zod";

import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";

import { fieldErrors } from "./action-input";
import { ERROR_MESSAGE_KEYS, FIELD_ERROR_KINDS, failure, isActionResult } from "./action-result";

// The typed errors of the action wrapper (plan of 0.8): every code has a plain-words text in the
// three languages (11-screens-and-ux.md, smooth feel 4 and rule 14), and a Zod issue becomes the
// key of what the person has to correct (developer-rules.md rule 13).

function textAt(messages: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages,
    );
}

describe("message keys of the typed errors (11-screens-and-ux.md rule 14)", () => {
  const keys = [
    ...Object.values(ERROR_MESSAGE_KEYS),
    ...FIELD_ERROR_KINDS.map((kind) => `errors.field.${kind}`),
  ];

  for (const [locale, messages] of Object.entries({ uz, ru, en })) {
    it(`every code and field kind has a text in ${locale}`, () => {
      for (const key of keys) {
        const text = textAt(messages, key);
        expect(typeof text === "string" && text.length > 0, key).toBe(true);
      }
    });
  }

  it("failure() names the failing orders of an action on ticked orders (plan of 2.4, decision 1)", () => {
    const orders = [{ orderId: "c1", code: "not_ready" as const }];
    expect(failure("not_ready", undefined, orders)).toEqual({
      ok: false,
      error: { code: "not_ready", messageKey: "errors.notReady", orders },
    });
  });

  it("failure() carries the code's key", () => {
    expect(failure("stale_version")).toEqual({
      ok: false,
      error: { code: "stale_version", messageKey: "errors.staleVersion" },
    });
  });
});

describe("isActionResult()", () => {
  it("knows an answer of the wrapper from anything else", () => {
    expect(isActionResult({ ok: true, data: 1 })).toBe(true);
    expect(isActionResult(failure("network"))).toBe(true);
    expect(isActionResult({ ok: false, error: { code: "invented" } })).toBe(false);
    expect(isActionResult(undefined)).toBe(false);
    expect(isActionResult("<html>")).toBe(false);
    expect(isActionResult({ ok: true })).toBe(false);
  });
});

describe("field errors of the input check (developer-rules.md rule 13)", () => {
  const schema = z.object({
    name: z.string().min(2).max(5),
    note: z.string().min(1),
    qty: z.number().min(1).max(10),
    code: z.uuid(),
    kind: z.enum(["A", "B"]),
    lines: z.array(z.object({ qty: z.number() })),
  });

  function kinds(input: Record<string, unknown>) {
    const parsed = schema.safeParse(input);
    expect(parsed.success).toBe(false);
    return fieldErrors((parsed as { error: z.ZodError }).error, input);
  }

  const valid = {
    name: "abc",
    note: "x",
    qty: 2,
    code: "6f1c1f5e-3a8b-4c2d-9e7f-0a1b2c3d4e5f",
    kind: "A",
    lines: [{ qty: 1 }],
  };

  it("a missing or empty value is required", () => {
    expect(kinds({ ...valid, name: undefined, note: "", code: "" })).toEqual({
      name: "errors.field.required",
      note: "errors.field.required",
      code: "errors.field.required",
    });
  });

  it("too long, too short, too small, too large", () => {
    expect(kinds({ ...valid, name: "abcdef" })).toEqual({ name: "errors.field.tooLong" });
    expect(kinds({ ...valid, name: "a" })).toEqual({ name: "errors.field.tooShort" });
    expect(kinds({ ...valid, qty: 0 })).toEqual({ qty: "errors.field.tooSmall" });
    expect(kinds({ ...valid, qty: 11 })).toEqual({ qty: "errors.field.tooLarge" });
  });

  it("a wrong format, a text where a number belongs, a value outside the list", () => {
    expect(kinds({ ...valid, code: "not-a-uuid" })).toEqual({ code: "errors.field.wrongFormat" });
    expect(kinds({ ...valid, qty: "two" })).toEqual({ qty: "errors.field.notANumber" });
    expect(kinds({ ...valid, kind: "C" })).toEqual({ kind: "errors.field.notAllowed" });
  });

  it("a nested field is named by its dotted path", () => {
    expect(kinds({ ...valid, lines: [{ qty: 1 }, { qty: "x" }] })).toEqual({
      "lines.1.qty": "errors.field.notANumber",
    });
  });

  it("a check that names its kind gives that kind; an unknown name stays a wrong format", () => {
    const named = z.string().superRefine((value, context) => {
      context.addIssue({ code: "custom", message: "", params: { fieldError: value } });
    });
    const wrong = (value: string) => {
      const parsed = named.safeParse(value);
      return fieldErrors((parsed as { error: z.ZodError }).error, value)[""];
    };
    // An Excel import's row check (plan of 1.10): "no such category" reads as itself.
    expect(wrong("unknown")).toBe("errors.field.unknown");
    expect(wrong("notAKind")).toBe("errors.field.wrongFormat");
  });
});
