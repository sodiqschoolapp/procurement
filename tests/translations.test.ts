import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readMessageFiles, translationProblems } from "../scripts/check-translations.mjs";

// 15-quality-and-acceptance.md, Done-check: "No translation key is missing in Uzbek, Russian or
// English." 11-screens-and-ux.md rule 14: every label comes from the three translation files.
// The invented files are written under the system temp folder.

const SCRIPT = join(process.cwd(), "scripts/check-translations.mjs");

const whole = () => ({
  start: { title: "Sarlavha", notice: "Xabar" },
  format: { currency: "so'm" },
});

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
    const ru = whole();
    delete (ru.start as Partial<typeof ru.start>).notice;
    const folder = folderWith({ uz: whole(), ru, en: whole() });

    expect(translationProblems(readMessageFiles(folder))).toEqual([
      'ru: "start.notice" is missing',
    ]);
  });

  it("names a key that only en has", () => {
    const en = { ...whole(), extra: { only: "Only here" } };
    const folder = folderWith({ uz: whole(), ru: whole(), en });

    expect(translationProblems(readMessageFiles(folder))).toEqual([
      'uz: "extra.only" is missing',
      'ru: "extra.only" is missing',
    ]);
  });

  it("refuses an empty value and a value that is not a text (decisions 0.5 item 8)", () => {
    const uz = { ...whole(), start: { title: " ", notice: 5 } };
    const folder = folderWith({ uz, ru: whole(), en: whole() });

    expect(translationProblems(readMessageFiles(folder))).toEqual([
      'uz: "start.notice" is not a text that is not empty',
      'uz: "start.title" is not a text that is not empty',
    ]);
  });

  it("ends the script with an error when a key is missing", () => {
    const ru = whole();
    delete (ru.format as Partial<typeof ru.format>).currency;
    const folder = folderWith({ uz: whole(), ru, en: whole() });

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
