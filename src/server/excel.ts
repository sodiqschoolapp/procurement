import { inflateRawSync } from "node:zlib";

import ExcelJS from "exceljs";

import {
  IMPORT_FILE_MAX_BYTES,
  IMPORT_UNPACKED_MAX_BYTES,
  type ImportCell,
  type ImportRow,
  type ImportSheet,
} from "@/domain/imports";

// Excel files on ExcelJS (13-technology.md, "Excel and PDF": "ExcelJS for import and export";
// build-plan 1.10). No business rule here: readSheet() gives the first worksheet's cells, which
// src/domain/imports.ts reads; writeTemplate() makes the template a Head downloads.
//
// An uploaded file is checked by its content, never its name (developer-rules.md rule 13): it must
// be a zip, at most IMPORT_FILE_MAX_BYTES. Before ExcelJS sees it, every entry is unpacked here
// with a hard limit on the bytes it may produce: the sizes a zip declares are written by whoever
// made it and can lie, so only a real unpacking proves the file stays under the limit (plan of
// 1.10, decision 11; spec review of the plan, Should fix 6). An entry this code cannot unpack
// (another compression, encrypted, Zip64) is refused, as its size cannot be proven (plan review,
// correction 3).

/** Why a file cannot be read: too large, or not a workbook this reader accepts. */
export class ImportFileError extends Error {
  constructor(readonly kind: "fileTooLarge" | "notTemplate") {
    super(`Import file refused: ${kind}.`);
    this.name = "ImportFileError";
  }
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
const STORED = 0;
const DEFLATE = 8;

/** The bytes as a Node buffer over the same memory. */
function bufferOf(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function endOfDirectory(file: Buffer): number {
  // The record is 22 bytes plus a comment of at most 65 535.
  for (let at = file.length - 22; at >= Math.max(0, file.length - 22 - 0xffff); at -= 1) {
    if (file.readUInt32LE(at) === END_OF_DIRECTORY) return at;
  }
  throw new ImportFileError("notTemplate");
}

/**
 * Unpacks every entry of the zip with a limit on what it may produce, declared and real. Throws
 * ImportFileError("notTemplate") for a file that is not a zip this reader can measure, or one that
 * unpacks to more than `limit` bytes.
 */
export function checkZip(bytes: Uint8Array, limit = IMPORT_UNPACKED_MAX_BYTES): void {
  const file = bufferOf(bytes);
  if (file.length < 30 || file.readUInt32LE(0) !== LOCAL_HEADER) {
    throw new ImportFileError("notTemplate");
  }
  try {
    const end = endOfDirectory(file);
    const count = file.readUInt16LE(end + 10);
    let at = file.readUInt32LE(end + 16);
    let declared = 0;
    let unpacked = 0;
    for (let entry = 0; entry < count; entry += 1) {
      if (file.readUInt32LE(at) !== CENTRAL_HEADER) throw new ImportFileError("notTemplate");
      const flags = file.readUInt16LE(at + 8);
      const method = file.readUInt16LE(at + 10);
      const packedSize = file.readUInt32LE(at + 20);
      const size = file.readUInt32LE(at + 24);
      const nameLength = file.readUInt16LE(at + 28);
      const extraLength = file.readUInt16LE(at + 30);
      const commentLength = file.readUInt16LE(at + 32);
      const localAt = file.readUInt32LE(at + 42);
      // Encrypted, or a method or a Zip64 size this reader cannot measure.
      if ((flags & 1) !== 0 || (method !== STORED && method !== DEFLATE)) {
        throw new ImportFileError("notTemplate");
      }
      if (packedSize === 0xffffffff || size === 0xffffffff || localAt === 0xffffffff) {
        throw new ImportFileError("notTemplate");
      }
      declared += size;
      if (declared > limit) throw new ImportFileError("notTemplate");

      if (file.readUInt32LE(localAt) !== LOCAL_HEADER) throw new ImportFileError("notTemplate");
      const start =
        localAt + 30 + file.readUInt16LE(localAt + 26) + file.readUInt16LE(localAt + 28);
      const packed = file.subarray(start, start + packedSize);
      if (packed.length !== packedSize) throw new ImportFileError("notTemplate");
      if (method === STORED) {
        unpacked += packed.length;
      } else {
        // Throws a RangeError as soon as the output would pass what is left of the limit.
        unpacked += inflateRawSync(packed, { maxOutputLength: limit - unpacked + 1 }).length;
      }
      if (unpacked > limit) throw new ImportFileError("notTemplate");
      at += 46 + nameLength + extraLength + commentLength;
    }
  } catch (error) {
    if (error instanceof ImportFileError) throw error;
    // A RangeError of the buffer or of zlib: a damaged file, or one that unpacks too far.
    throw new ImportFileError("notTemplate");
  }
}

/** A cell's value as the domain reads it; a formula by its cached result. */
function cellOf(value: ExcelJS.CellValue): ImportCell {
  if (value === null || value === undefined) return { kind: "empty" };
  if (typeof value === "string")
    return value === "" ? { kind: "empty" } : { kind: "text", text: value };
  if (typeof value === "number") return { kind: "number", value };
  if (typeof value === "boolean" || value instanceof Date) return { kind: "other" };
  if ("richText" in value) {
    return { kind: "text", text: value.richText.map((part) => part.text).join("") };
  }
  if ("formula" in value || "sharedFormula" in value) {
    return cellOf((value as { result?: ExcelJS.CellValue }).result ?? null);
  }
  if ("text" in value && typeof value.text === "string") return { kind: "text", text: value.text };
  return { kind: "other" };
}

/** The most columns read from a row: far more than any template has. */
const COLUMNS_READ = 26;

/**
 * The first worksheet of an uploaded file: its first row as the header, and every row below it
 * with its number. Throws ImportFileError for a file over the size limit, one that is not a zip
 * that unpacks within the limit, or one ExcelJS cannot open.
 */
export async function readSheet(bytes: Uint8Array): Promise<ImportSheet> {
  if (bytes.byteLength > IMPORT_FILE_MAX_BYTES) throw new ImportFileError("fileTooLarge");
  checkZip(bytes);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bufferOf(bytes) as unknown as ArrayBuffer);
  } catch {
    throw new ImportFileError("notTemplate");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ImportFileError("notTemplate");
  let header: ImportCell[] = [];
  const rows: ImportRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    const cells: ImportCell[] = [];
    for (let column = 1; column <= COLUMNS_READ; column += 1) {
      cells.push(cellOf(row.getCell(column).value));
    }
    while (cells.length > 0 && cells[cells.length - 1]!.kind === "empty") cells.pop();
    if (number === 1) header = cells;
    else rows.push({ row: number, cells });
  });
  return { header, rows };
}

/**
 * The template of one import: its column titles in bold on the first row, which stays in view, and
 * no data rows. Returns the `.xlsx` bytes.
 */
export async function writeTemplate(
  sheetName: string,
  titles: readonly string[],
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = titles.map((title) => ({ header: title, width: Math.max(16, title.length + 4) }));
  sheet.getRow(1).font = { bold: true };
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
