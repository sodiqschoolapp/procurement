// The owner's translation file (build-plan 8.4; D12: the owner corrects Uzbek and Russian).
// `npm run i18n:export [file]` writes every text to one Excel file, `docs/translations.xlsx` by
// default; `npm run i18n:import <file>` reads the corrected file back into uz.json and ru.json.
// en.json is never written. Rules of the import (plan of 8.4, decided item 4): a cell counts as
// corrected only when it differs from the hidden "as exported" text; a corrected text that also
// changed in the files since the export is a conflict; any problem refuses the whole file and
// nothing is written. Uzbek apostrophes become ʻ and ʼ before the check (decided item 3).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import ExcelJS from "exceljs";

import {
  MESSAGES_FOLDER,
  SCRIPT_EXEMPT,
  readMessageFiles,
  translationProblems,
  uzbekApostrophes,
} from "./check-translations.mjs";

export const DEFAULT_FILE = fileURLToPath(new URL("../docs/translations.xlsx", import.meta.url));
export const HEADER = ["Key", "English", "Oʻzbekcha", "Русский"];
const TEXTS = "Texts";
const EXPORTED = "Exported";
const CORRECTED = ["uz", "ru"];
const COLUMN = { uz: 3, ru: 4 };
// A fixed stamp, so the file says nothing about when it was made (CLAUDE.md rule 10).
const STAMP = new Date("2026-01-01T00:00:00Z");

/** Every leaf of a message file as `a.b.c`, with its value, in the file's order. */
function leaves(tree, prefix = "", found = new Map()) {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") leaves(value, path, found);
    else found.set(path, value);
  }
  return found;
}

/** The workbook of the three message files, as the bytes of an .xlsx file. */
export async function exportWorkbook(files) {
  const texts = Object.fromEntries(
    Object.entries(files).map(([language, tree]) => [language, leaves(tree)]),
  );
  const workbook = new ExcelJS.Workbook();
  workbook.created = STAMP;
  workbook.modified = STAMP;
  const sheet = workbook.addWorksheet(TEXTS, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: HEADER[0], width: 44 },
    { header: HEADER[1], width: 60 },
    { header: HEADER[2], width: 60 },
    { header: HEADER[3], width: 60 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADER.length } };
  const exported = workbook.addWorksheet(EXPORTED, { state: "veryHidden" });
  exported.addRow(["Key", "uz", "ru"]);
  for (const [key, uz] of texts.uz) {
    const row = sheet.addRow([key, texts.en.get(key), uz, texts.ru.get(key)]);
    row.alignment = { wrapText: true, vertical: "top" };
    exported.addRow([key, uz, texts.ru.get(key)]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** A cell's text: plain, rich text joined, a number or a formula's result as text. */
function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  if ("text" in value) return cellText(value.text);
  if ("result" in value) return cellText(value.result);
  return String(value);
}

function rowTexts(sheet, rowNumber, count) {
  const row = sheet.getRow(rowNumber);
  return Array.from({ length: count }, (_, index) => cellText(row.getCell(index + 1).value));
}

/** A deep copy of a message file with one leaf replaced; the key order stays. */
function withText(tree, key, text) {
  const copy = structuredClone(tree);
  const path = key.split(".");
  const last = path.pop();
  path.reduce((node, part) => node[part], copy)[last] = text;
  return copy;
}

/**
 * Reads a corrected workbook against the current message files. Returns the new files (all three;
 * en is the same object), the keys changed per language, and the problems; with any problem
 * nothing may be written.
 */
export async function importWorkbook(bytes, files) {
  const problems = [];
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes);
  } catch {
    return { files, changed: [], problems: ["The file is not an Excel workbook."] };
  }
  const sheet = workbook.getWorksheet(TEXTS);
  const exportedSheet = workbook.getWorksheet(EXPORTED);
  if (!sheet || !exportedSheet) {
    return { files, changed: [], problems: ["The file was not made by npm run i18n:export."] };
  }
  const header = rowTexts(sheet, 1, HEADER.length);
  if (header.join("|") !== HEADER.join("|")) {
    problems.push(`The first row must be ${HEADER.join(", ")}; it is ${header.join(", ")}.`);
  }
  const exported = new Map();
  for (let at = 2; at <= exportedSheet.rowCount; at += 1) {
    const [key, uz, ru] = rowTexts(exportedSheet, at, 3);
    if (key) exported.set(key, { uz, ru });
  }

  const current = Object.fromEntries(
    CORRECTED.map((language) => [language, leaves(files[language])]),
  );
  const result = { ...files };
  const changed = [];
  const seen = new Set();
  for (let at = 2; at <= sheet.rowCount; at += 1) {
    const cells = rowTexts(sheet, at, HEADER.length);
    const key = cells[0].trim();
    if (!key) {
      if (cells.some((cell) => cell.trim() !== "")) problems.push(`Row ${at} has no key.`);
      continue;
    }
    if (seen.has(key)) {
      problems.push(`Row ${at}: "${key}" is in the file twice.`);
      continue;
    }
    seen.add(key);
    const before = exported.get(key);
    if (!before) {
      problems.push(`Row ${at}: "${key}" was not exported.`);
      continue;
    }
    for (const language of CORRECTED) {
      const typed = cells[COLUMN[language] - 1];
      if (typed.trim() === "") {
        problems.push(`Row ${at}: the ${language} text of "${key}" is empty.`);
        continue;
      }
      const text = language === "uz" && !SCRIPT_EXEMPT.has(key) ? uzbekApostrophes(typed) : typed;
      if (typed === before[language] || text === before[language]) continue;
      if (!current[language].has(key)) {
        problems.push(
          `Row ${at}: "${key}" is no longer in the files, but its ${language} text was corrected.`,
        );
      } else if (text === current[language].get(key)) {
        continue;
      } else if (current[language].get(key) !== before[language]) {
        problems.push(
          `Row ${at}: the ${language} text of "${key}" changed in the files after the export; export again and correct it there.`,
        );
      } else {
        result[language] = withText(result[language], key, text);
        changed.push(`${language}: ${key}`);
      }
    }
  }
  if (problems.length === 0) problems.push(...translationProblems(result));
  return { files: result, changed, problems };
}

/** A message file as the repository keeps it: two-space JSON and a newline (Prettier's form). */
export function messageFileText(tree) {
  return `${JSON.stringify(tree, null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, file, folder = MESSAGES_FOLDER] = process.argv.slice(2);
  const files = readMessageFiles(folder);
  if (command === "export") {
    const target = file ?? DEFAULT_FILE;
    writeFileSync(target, await exportWorkbook(files));
    console.log(`Wrote ${target}.`);
  } else if (command === "import" && file) {
    const { files: next, changed, problems } = await importWorkbook(readFileSync(file), files);
    if (problems.length > 0) {
      for (const problem of problems) console.error(problem);
      console.error(`Nothing was written: ${problems.length} problem(s).`);
      process.exit(1);
    }
    for (const language of CORRECTED) {
      if (changed.some((line) => line.startsWith(`${language}:`))) {
        writeFileSync(join(folder, `${language}.json`), messageFileText(next[language]));
      }
    }
    for (const line of changed) console.log(`Changed ${line}`);
    console.log(`${changed.length} text(s) changed.`);
  } else {
    console.error("Use: translations-excel.mjs export [file] [folder] | import <file> [folder]");
    process.exit(2);
  }
}
