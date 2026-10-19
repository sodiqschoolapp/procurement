import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTranslator } from "next-intl";

import {
  readMessage,
  readMessageFiles,
  translationProblems,
  uzbekApostrophes,
} from "../scripts/check-translations.mjs";

// 15-quality-and-acceptance.md, Done-check: "No translation key is missing in Uzbek, Russian or
// English." 11-screens-and-ux.md rule 14: every label comes from the three translation files.
// The invented files are written under the system temp folder.

const SCRIPT = join(process.cwd(), "scripts/check-translations.mjs");

const TITLES = { uz: "Sarlavha", ru: "Заголовок", en: "Title" };
const NOTICES = { uz: "Xabar", ru: "Сообщение", en: "Notice" };

/** A whole file of one language; Uzbek by default. */
const whole = (language: "uz" | "ru" | "en" = "uz") => ({
  start: { title: TITLES[language], notice: NOTICES[language] },
  format: { currency: "so'm" },
});

/** The three whole files with one value replaced in one language. */
function withValue(
  language: "uz" | "ru" | "en",
  key: "start.title" | "start.notice",
  value: string,
) {
  const files = { uz: whole("uz"), ru: whole("ru"), en: whole("en") };
  files[language].start[key === "start.title" ? "title" : "notice"] = value;
  return files;
}

let folders: string[] = [];

function folderWith(files: Record<string, unknown>): string {
  const folder = mkdtempSync(join(tmpdir(), "translations-"));
  folders.push(folder);
  for (const [language, tree] of Object.entries(files)) {
    writeFileSync(join(folder, `${language}.json`), JSON.stringify(tree));
  }
  return folder;
}

afterEach(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
  folders = [];
});

describe("the translation check (15-quality Done-check; 11-screens-and-ux.md rule 14)", () => {
  it("passes on the repository's three message files", () => {
    expect(translationProblems(readMessageFiles())).toEqual([]);
    expect(() => execFileSync(process.execPath, [SCRIPT], { stdio: "pipe" })).not.toThrow();
  });

  it("names a key that is gone from ru", () => {
    const ru = whole("ru");
    delete (ru.start as Partial<typeof ru.start>).notice;
    const folder = folderWith({ uz: whole(), ru, en: whole("en") });

    expect(translationProblems(readMessageFiles(folder))).toEqual([
      'ru: "start.notice" is missing',
    ]);
  });

  it("names a key that only en has", () => {
    const en = { ...whole("en"), extra: { only: "Only here" } };
    const folder = folderWith({ uz: whole(), ru: whole("ru"), en });

    expect(translationProblems(readMessageFiles(folder))).toEqual([
      'uz: "extra.only" is missing',
      'ru: "extra.only" is missing',
    ]);
  });

  it("refuses an empty value and a value that is not a text (decisions 0.5 item 8)", () => {
    const uz = { ...whole(), start: { title: " ", notice: 5 } };
    const folder = folderWith({ uz, ru: whole("ru"), en: whole("en") });

    expect(translationProblems(readMessageFiles(folder))).toEqual([
      'uz: "start.notice" is not a text that is not empty',
      'uz: "start.title" is not a text that is not empty',
    ]);
  });

  it("ends the script with an error when a key is missing", () => {
    const ru = whole("ru");
    delete (ru.format as Partial<typeof ru.format>).currency;
    const folder = folderWith({ uz: whole(), ru, en: whole("en") });

    let failure: { status?: number; stderr?: Buffer } = {};
    try {
      execFileSync(process.execPath, [SCRIPT, folder], { stdio: "pipe" });
    } catch (error) {
      failure = error as typeof failure;
    }
    expect(failure.status).toBe(1);
    expect(String(failure.stderr)).toContain('ru: "format.currency" is missing');
  });
});

describe("the three languages agree (plan of 8.4, decided items 2 and 3)", () => {
  const problemsOf = (files: Record<string, unknown>) => translationProblems(files);

  it("passes the whole invented files", () => {
    expect(problemsOf({ uz: whole("uz"), ru: whole("ru"), en: whole("en") })).toEqual([]);
  });

  it("names a value that is not a valid message", () => {
    expect(problemsOf(withValue("en", "start.title", "Title {count"))).toEqual([
      'en: "start.title" is not a valid message: {count is not closed',
    ]);
  });

  it("names an argument one language leaves out, but not a plural Uzbek does without", () => {
    const files = withValue("ru", "start.title", "Заголовок {name}");
    files.en.start.title = "{count, plural, one {# title} other {# titles}} of {name}";
    files.ru.start.title =
      "{count, plural, one {# заголовок} few {# заголовка} many {# заголовков} other {# заголовка}}";
    files.uz.start.title = "{count} ta sarlavha: {name}";

    expect(problemsOf(files)).toEqual([
      '"start.title" has different arguments: uz count, name; ru count; en count, name',
    ]);
  });

  it("names a select whose options differ", () => {
    const files = withValue("en", "start.title", "{kind, select, A {First} other {Other}}");
    files.uz.start.title = "{kind, select, B {Birinchi} other {Boshqa}}";
    files.ru.start.title = "{kind, select, A {Первый} other {Другой}}";

    expect(problemsOf(files)).toEqual([
      '"start.title" has different select options: uz kind: B other; ru kind: A other; en kind: A other',
    ]);
  });

  it("names a # outside a plural, which shows as a literal #", () => {
    const files = withValue("uz", "start.title", "{count} ta: # mahsulot");
    files.ru.start.title =
      "{count, plural, one {# товар} few {# товара} many {# товаров} other {# товара}}";
    files.en.start.title = "{count, plural, one {# item} other {# items}}";

    expect(problemsOf(files)).toEqual(['uz: "start.title" has a # outside a plural']);
  });

  it("asks a Russian plural for one, few, many and other, or only exact numbers", () => {
    const files = withValue("en", "start.title", "{count, plural, one {It} other {They}}");
    files.uz.start.title = "{count, plural, other {Ular}}";
    files.ru.start.title = "{count, plural, one {Он} other {Они}}";
    expect(problemsOf(files)).toEqual([
      'ru: "start.title" needs one, few, many and other (or =n and other) in {count}',
    ]);

    files.ru.start.title = "{count, plural, =1 {Он} other {Они}}";
    expect(problemsOf(files)).toEqual([]);

    files.ru.start.title = "{count, plural, one {# товар} few {# товара} other {# товаров}}";
    expect(problemsOf(files)).toEqual([
      'ru: "start.title" needs one, few, many and other (or =n and other) in {count}',
    ]);
  });

  it("names a plural without other", () => {
    const files = withValue("en", "start.title", "{count, plural, one {It}}");
    files.uz.start.title = "{count} ta";
    files.ru.start.title = "{count, plural, =1 {Он} other {Они}}";

    expect(problemsOf(files)).toEqual(['en: "start.title" has no "other" in {count}']);
  });

  it("names a Cyrillic letter in Uzbek or English, and a Russian value with no Cyrillic word", () => {
    const files = withValue("uz", "start.title", "Сарлавҳа");
    files.en.start.notice = "Notice д";
    files.ru.start.notice = "Notice";

    expect(problemsOf(files)).toEqual([
      'ru: "start.notice" has no Cyrillic letter',
      'en: "start.notice" has a Cyrillic letter',
      'uz: "start.title" has a Cyrillic letter',
    ]);
  });

  it("does not count the words inside an argument as Russian text", () => {
    const files = withValue("ru", "start.title", "{code} · {name}");
    files.uz.start.title = "{code} · {name}";
    files.en.start.title = "{code} · {name}";

    expect(problemsOf(files)).toEqual([]);
  });

  it("asks Uzbek for ʻ after o or g and ʼ elsewhere; format.currency keeps the spec's so'm", () => {
    const files = withValue("uz", "start.title", "Bo'lim");
    files.uz.start.notice = "Ta‘sir";
    expect(problemsOf(files)).toEqual([
      'uz: "start.notice" has an apostrophe that is not ʻ after o or g, ʼ elsewhere',
      'uz: "start.title" has an apostrophe that is not ʻ after o or g, ʼ elsewhere',
    ]);

    files.uz.start.title = "Boʻlim";
    files.uz.start.notice = "Taʼsir";
    expect(problemsOf(files)).toEqual([]);
  });

  it("turns typed apostrophes into the Uzbek letters, between letters only", () => {
    expect(uzbekApostrophes("o'g'it, ta'sir, O'zbekiston, bog' 'iqtibos'")).toBe(
      "oʻgʻit, taʼsir, Oʻzbekiston, bog' 'iqtibos'",
    );
    expect(uzbekApostrophes("bo‘lim va ma’lumot")).toBe("boʻlim va maʼlumot");
  });

  it("formats every value of the repository's files through next-intl without an error (plan review, correction 1)", () => {
    const files = readMessageFiles();
    const errors: string[] = [];
    for (const language of ["uz", "ru", "en"] as const) {
      const messages = files[language] as Record<string, unknown>;
      const t = createTranslator({
        locale: language,
        messages,
        onError: (error) => errors.push(`${language}: ${error.message}`),
      });
      for (const [key, value] of leavesOf(messages)) {
        const read = readMessage(value);
        for (const count of [0, 1, 2, 5, 21]) {
          const values: Record<string, string | number | ((chunks: string) => string)> = {};
          for (const [name, kind] of read.args) {
            if (kind === "tag") values[name] = (chunks: string) => chunks;
            else if (["plural", "selectordinal", "number"].includes(kind)) values[name] = count;
            else values[name] = "x";
          }
          const translate = t.markup as unknown as (key: string, values: unknown) => string;
          const text = translate(key, values);
          if (text.includes("#") && !value.includes("'#"))
            errors.push(`${language}: ${key} shows #`);
        }
      }
    }
    expect(errors).toEqual([]);
  });
});

/** Every leaf of a message file as `a.b.c`, with its value. */
function leavesOf(tree: Record<string, unknown>, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string"
      ? [[path, value] as [string, string]]
      : leavesOf(value as Record<string, unknown>, path);
  });
}
