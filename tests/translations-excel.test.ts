import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { MESSAGES_FOLDER, readMessageFiles } from "../scripts/check-translations.mjs";
import {
  DEFAULT_FILE,
  exportWorkbook,
  importWorkbook,
  messageFileText,
} from "../scripts/translations-excel.mjs";

// build-plan 8.4: "a script exports every Uzbek and Russian text to one Excel file for the owner
// to correct, and reads the corrected file back"; Done when: "a corrected file changes the
// message files and nothing else". The import rules are decided item 4 of the plan of 8.4, the
// apostrophes item 3. Every run works on copies of the message files under the system temp folder.

const SCRIPT = join(process.cwd(), "scripts/translations-excel.mjs");
const LANGUAGES = ["uz", "ru", "en"] as const;

let folders: string[] = [];
let files = 0;

afterEach(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
  folders = [];
});

/** A copy of the repository's message files, and the bytes of each file. */
function copyOfMessages() {
  const folder = mkdtempSync(join(tmpdir(), "translations-excel-"));
  folders.push(folder);
  cpSync(MESSAGES_FOLDER, folder, { recursive: true });
  const bytes = () =>
    Object.fromEntries(
      LANGUAGES.map((language) => [
        language,
        readFileSync(join(folder, `${language}.json`), "utf8"),
      ]),
    );
  return { folder, bytes };
}

/** An exported workbook of a folder, with `change` applied to its "Texts" sheet, saved to a file. */
async function workbookFile(
  folder: string,
  change: (sheet: ExcelJS.Worksheet, rowOf: (key: string) => ExcelJS.Row) => void = () => {},
) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await exportWorkbook(readMessageFiles(folder))) as unknown as ArrayBuffer,
  );
  const sheet = workbook.getWorksheet("Texts")!;
  const rowOf = (key: string) => {
    for (let at = 2; at <= sheet.rowCount; at += 1) {
      if (sheet.getRow(at).getCell(1).value === key) return sheet.getRow(at);
    }
    throw new Error(`no row for ${key}`);
  };
  change(sheet, rowOf);
  files += 1;
  const file = join(folder, `corrected-${files}.xlsx`);
  writeFileSync(file, Buffer.from(await workbook.xlsx.writeBuffer()));
  return file;
}

function runImport(file: string, folder: string) {
  try {
    return {
      status: 0,
      out: execFileSync(process.execPath, [SCRIPT, "import", file, folder], {
        stdio: "pipe",
      }).toString(),
    };
  } catch (error) {
    const failure = error as { status: number; stderr: Buffer };
    return { status: failure.status, out: String(failure.stderr) };
  }
}

const textOf = (folder: string, language: string, key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)[part],
      JSON.parse(readFileSync(join(folder, `${language}.json`), "utf8")),
    );

describe("the owner's translation file (build-plan 8.4)", () => {
  it("exports one row per key with Key, English, Uzbek and Russian", async () => {
    const files = readMessageFiles();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportWorkbook(files)) as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Texts")!;

    expect(sheet.getRow(1).values).toEqual([undefined, "Key", "English", "Oʻzbekcha", "Русский"]);
    expect(sheet.getRow(2).values).toEqual([
      undefined,
      "app.title",
      files.en.app.title,
      files.uz.app.title,
      files.ru.app.title,
    ]);
    const keyCount = (tree: object): number =>
      Object.values(tree).reduce<number>(
        (sum, value) => sum + (typeof value === "string" ? 1 : keyCount(value)),
        0,
      );
    expect(sheet.rowCount).toBe(1 + keyCount(files.uz));
    expect(workbook.getWorksheet("Exported")!.state).toBe("veryHidden");
  });

  it("reads an unchanged file back with no change, byte for byte", async () => {
    const { folder, bytes } = copyOfMessages();
    const before = bytes();

    const run = runImport(await workbookFile(folder), folder);

    expect(run).toEqual({ status: 0, out: "0 text(s) changed.\n" });
    expect(bytes()).toEqual(before);
  });

  it("changes exactly the corrected Uzbek and Russian texts and nothing else", async () => {
    const { folder, bytes } = copyOfMessages();
    const before = bytes();
    const file = await workbookFile(folder, (_, rowOf) => {
      rowOf("login.title").getCell(3).value = "Tizimga kirish (tuzatildi)";
      rowOf("login.submit").getCell(4).value = "Войти (исправлено)";
    });

    const run = runImport(file, folder);

    expect(run.status).toBe(0);
    expect(run.out).toContain("2 text(s) changed.");
    const after = bytes();
    expect(after.en).toBe(before.en);
    const expected = readMessageFiles(MESSAGES_FOLDER);
    expected.uz.login.title = "Tizimga kirish (tuzatildi)";
    expected.ru.login.submit = "Войти (исправлено)";
    expect(after.uz).toBe(messageFileText(expected.uz));
    expect(after.ru).toBe(messageFileText(expected.ru));
  });

  it("turns the owner's typed apostrophes into ʻ and ʼ (decided item 3)", async () => {
    const { folder } = copyOfMessages();
    const file = await workbookFile(folder, (_, rowOf) => {
      rowOf("login.title").getCell(3).value = "O'g'it va ta'sir, bo‘lim";
    });

    expect(runImport(file, folder).status).toBe(0);
    expect(textOf(folder, "uz", "login.title")).toBe("Oʻgʻit va taʼsir, boʻlim");
  });

  it("keeps the text of a key the file leaves out", async () => {
    const { folder, bytes } = copyOfMessages();
    const before = bytes();
    const file = await workbookFile(folder, (sheet, rowOf) => {
      sheet.spliceRows(rowOf("login.title").number, 1);
    });

    expect(runImport(file, folder).status).toBe(0);
    expect(bytes()).toEqual(before);
  });

  it("ignores a changed English cell", async () => {
    const { folder, bytes } = copyOfMessages();
    const before = bytes();
    const file = await workbookFile(folder, (_, rowOf) => {
      rowOf("login.title").getCell(2).value = "Changed English";
    });

    expect(runImport(file, folder).status).toBe(0);
    expect(bytes()).toEqual(before);
  });

  it("refuses a text that changed in the files after the export, and writes nothing", async () => {
    const { folder, bytes } = copyOfMessages();
    const file = await workbookFile(folder, (_, rowOf) => {
      rowOf("login.title").getCell(3).value = "Owner's correction";
    });
    const later = readMessageFiles(folder);
    later.uz.login.title = "A later task's text";
    writeFileSync(join(folder, "uz.json"), messageFileText(later.uz));
    const before = bytes();

    const run = runImport(file, folder);

    expect(run.status).toBe(1);
    expect(run.out).toContain('the uz text of "login.title" changed in the files after the export');
    expect(bytes()).toEqual(before);
  });

  it("refuses a correction that breaks the check, and writes nothing", async () => {
    const { folder, bytes } = copyOfMessages();
    const before = bytes();
    const key = "orders.list.orderCount";
    const file = await workbookFile(folder, (_, rowOf) => {
      rowOf(key).getCell(3).value = "{qty} ta buyurtma";
      rowOf("login.title").getCell(3).value = "Вход";
    });

    const run = runImport(file, folder);

    expect(run.status).toBe(1);
    expect(run.out).toContain(`"${key}" has different arguments`);
    expect(run.out).toContain('uz: "login.title" has a Cyrillic letter');
    expect(run.out).toContain("Nothing was written");
    expect(bytes()).toEqual(before);
  });

  it("refuses an empty cell, a key twice and a changed header, and writes nothing", async () => {
    const { folder, bytes } = copyOfMessages();
    const before = bytes();
    const file = await workbookFile(folder, (sheet, rowOf) => {
      rowOf("login.title").getCell(4).value = "";
      sheet.addRow(["login.submit", "Sign in", "Kirish", "Войти"]);
      sheet.getRow(1).getCell(3).value = "Uzbek";
    });

    const run = runImport(file, folder);

    expect(run.status).toBe(1);
    expect(run.out).toContain('the ru text of "login.title" is empty');
    expect(run.out).toContain('"login.submit" is in the file twice');
    expect(run.out).toContain("The first row must be Key, English, Oʻzbekcha, Русский");
    expect(bytes()).toEqual(before);
  });

  it("skips a key no longer in the files when its cells are unchanged, and refuses it when corrected", async () => {
    const { folder, bytes } = copyOfMessages();
    const unchanged = await workbookFile(folder);
    const corrected = await workbookFile(folder, (_, rowOf) => {
      rowOf("login.title").getCell(4).value = "Вход (исправлено)";
    });
    // A later task removes the key from all three files.
    for (const language of LANGUAGES) {
      const tree = readMessageFiles(folder)[language];
      delete tree.login.title;
      writeFileSync(join(folder, `${language}.json`), messageFileText(tree));
    }
    const before = bytes();

    expect(runImport(unchanged, folder).status).toBe(0);
    expect(bytes()).toEqual(before);
    const run = runImport(corrected, folder);
    expect(run.status).toBe(1);
    expect(run.out).toContain(
      '"login.title" is no longer in the files, but its ru text was corrected',
    );
    expect(bytes()).toEqual(before);
  });

  it("reads the committed docs/translations.xlsx back with no change (the owner's file)", async () => {
    const result = await importWorkbook(readFileSync(DEFAULT_FILE), readMessageFiles());

    expect(result.problems).toEqual([]);
    expect(result.changed).toEqual([]);
  });
});
