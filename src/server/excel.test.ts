import { deflateRawSync } from "node:zlib";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { IMPORT_FILE_MAX_BYTES } from "@/domain/imports";

import { ImportFileError, checkZip, readSheet, writeTemplate } from "./excel";

// The Excel reader of the catalog import (04-catalogs.md rule 7; 13-technology.md, "Excel and
// PDF"; build-plan 1.10). An upload is checked by its content, not its name (developer-rules.md
// rule 13), and its real unpacked size is limited before ExcelJS sees it (plan of 1.10, decision
// 11; spec review of the plan, Should fix 6; plan review, correction 3).

async function workbookBytes(rows: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Varaq");
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** A zip of one entry, written by hand: `method` 0 stored or 8 deflate, `declared` its size. */
function zipOf(
  content: Buffer,
  options: { method?: number; declared?: number; flags?: number } = {},
): Uint8Array {
  const method = options.method ?? 8;
  const packed = method === 8 ? deflateRawSync(content) : content;
  const name = Buffer.from("xl/workbook.xml");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(options.flags ?? 0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(options.declared ?? content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(options.flags ?? 0, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(options.declared ?? content.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const directoryAt = local.length + name.length + packed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(directoryAt, 16);
  return new Uint8Array(Buffer.concat([local, name, packed, central, name, end]));
}

describe("readSheet (04 rule 7; developer-rules.md rule 13)", () => {
  it("reads back a workbook ExcelJS wrote: the header, then each row with its number", async () => {
    const bytes = await workbookBytes([
      ["Nomi", "Narxi"],
      ["Qog'oz A4", 1250000],
      [],
      ["Ruchka", "2 500"],
    ]);
    const sheet = await readSheet(bytes);
    expect(sheet.header).toEqual([
      { kind: "text", text: "Nomi" },
      { kind: "text", text: "Narxi" },
    ]);
    expect(sheet.rows).toEqual([
      {
        row: 2,
        cells: [
          { kind: "text", text: "Qog'oz A4" },
          { kind: "number", value: 1250000 },
        ],
      },
      {
        row: 4,
        cells: [
          { kind: "text", text: "Ruchka" },
          { kind: "text", text: "2 500" },
        ],
      },
    ]);
  });

  it("a formula is read by its result; a date is another kind", async () => {
    const bytes = await workbookBytes([
      ["A", "B"],
      [{ formula: "1+1", result: 2 }, new Date(Date.UTC(2026, 9, 15))],
    ]);
    const sheet = await readSheet(bytes);
    expect(sheet.rows[0]!.cells).toEqual([{ kind: "number", value: 2 }, { kind: "other" }]);
  });

  it("a file that is not a zip is refused by its content, whatever its name", async () => {
    const text = new TextEncoder().encode("Nomi;Narxi\nQog'oz;100\n");
    await expect(readSheet(text)).rejects.toEqual(new ImportFileError("notTemplate"));
  });

  it("a file over the size limit is refused before it is opened", async () => {
    await expect(readSheet(new Uint8Array(IMPORT_FILE_MAX_BYTES + 1))).rejects.toEqual(
      new ImportFileError("fileTooLarge"),
    );
  });

  it("a zip that is not a workbook is refused", async () => {
    await expect(readSheet(zipOf(Buffer.from("<x/>")))).rejects.toEqual(
      new ImportFileError("notTemplate"),
    );
  });
});

describe("checkZip: the real unpacked size (plan of 1.10, decision 11)", () => {
  const limit = 64 * 1024;
  const big = Buffer.alloc(limit + 1, 0x41);

  it("passes a zip within the limit, stored or deflated", () => {
    expect(() => checkZip(zipOf(Buffer.alloc(limit, 0x41)), limit)).not.toThrow();
    expect(() => checkZip(zipOf(Buffer.alloc(1000, 0x41), { method: 0 }), limit)).not.toThrow();
  });

  it("refuses a zip that declares more than the limit, though it really unpacks within it", () => {
    // Only the declared-size check can stop this file: its real content is 10 bytes.
    expect(() => checkZip(zipOf(Buffer.alloc(10, 0x41), { declared: limit + 1 }), limit)).toThrow(
      ImportFileError,
    );
  });

  it("refuses a zip whose declared size lies: the real unpacking stops it", () => {
    expect(() => checkZip(zipOf(big, { declared: 10 }), limit)).toThrow(ImportFileError);
  });

  it("refuses an entry it cannot measure: another method, or encrypted (plan review, correction 3)", () => {
    expect(() => checkZip(zipOf(Buffer.from("x"), { method: 12 }), limit)).toThrow(ImportFileError);
    expect(() => checkZip(zipOf(Buffer.from("x"), { method: 0, flags: 1 }), limit)).toThrow(
      ImportFileError,
    );
  });
});

describe("writeTemplate", () => {
  it("writes the titles on the first row and no data rows", async () => {
    const bytes = await writeTemplate("Mahsulotlar", ["Nomi", "Turi"]);
    const sheet = await readSheet(bytes);
    expect(sheet.header).toEqual([
      { kind: "text", text: "Nomi" },
      { kind: "text", text: "Turi" },
    ]);
    expect(sheet.rows).toEqual([]);
  });
});
