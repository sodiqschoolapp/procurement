import { describe, expect, it } from "vitest";

import {
  IMPORT_ROWS_MAX,
  type ImportCell,
  type ImportSheet,
  cellCost,
  cellPrice,
  cellQuantity,
  cellText,
  headerMatches,
  importErrorKey,
  productTypeOf,
  readDepartmentRows,
  readPriceRows,
  readProductRows,
  readStockRows,
} from "./imports";
import { MONEY_MAX } from "./money";

// The rows of a catalog import (04-catalogs.md rule 7: "a preview with errors per row"; build-plan
// 1.10; plan of 1.10 and its reviews). Names, phones and codes are invented.

const t = (text: string): ImportCell => ({ kind: "text", text });
const n = (value: number): ImportCell => ({ kind: "number", value });
const empty: ImportCell = { kind: "empty" };

const WORDS = { GOODS: ["Product", "Mahsulot", "Товар"], SERVICE: ["Service", "Xizmat", "Услуга"] };

function sheetOf(rows: (ImportCell | string | number | null)[][]): ImportSheet {
  return {
    header: [],
    rows: rows.map((cells, at) => ({
      row: at + 2,
      cells: cells.map((cell) =>
        cell === null
          ? empty
          : typeof cell === "string"
            ? t(cell)
            : typeof cell === "number"
              ? n(cell)
              : cell,
      ),
    })),
  };
}

// name, type, category, measure, company, description, subtype, price
const product = (name: string, subtype = "", price: ImportCell | string | number | null = null) => [
  name,
  "",
  "Kanselyariya",
  "dona",
  "",
  "",
  subtype,
  price,
];

describe("cellPrice (developer-rules.md rule 6; plan of 1.10, decision 1, Look first)", () => {
  it("reads a typed amount through parseSom, spaces between groups allowed", () => {
    expect(cellPrice(t("1 250 000"))).toBe(1250000n);
    expect(cellPrice(t("12,5"))).toBe("wrong");
  });

  it("reads a whole number cell by its digits", () => {
    expect(cellPrice(n(1250000))).toBe(1250000n);
    expect(cellPrice(n(MONEY_MAX_NUMBER()))).toBe(MONEY_MAX);
  });

  it("refuses a fraction, 0, a negative, a date: never rounded", () => {
    expect(cellPrice(n(0.5))).toBe("wrong");
    expect(cellPrice(n(1250000.0000001))).toBe("wrong");
    expect(cellPrice(n(0))).toBe("wrong");
    expect(cellPrice(n(-5))).toBe("wrong");
    expect(cellPrice({ kind: "other" })).toBe("wrong");
  });

  it("refuses MONEY_MAX + 1 given as a number cell (spec review of the plan, Must fix 1)", () => {
    expect(cellPrice(n(Number(MONEY_MAX) + 1))).toBe("wrong");
  });

  it("an empty cell is no price", () => {
    expect(cellPrice(empty)).toBeNull();
    expect(cellPrice(t("  "))).toBeNull();
  });
});

function MONEY_MAX_NUMBER(): number {
  // 999 999 999 999 999 is below 2^53, so the number is exact.
  return Number(MONEY_MAX);
}

describe("cellText (plan of 1.10, decision 15)", () => {
  it("a whole number in a text column is read as its digits; a fraction or a date is wrong", () => {
    expect(cellText(n(998901234567))).toBe("998901234567");
    expect(cellText(n(1.5))).toBeNull();
    expect(cellText({ kind: "other" })).toBeNull();
    expect(cellText(t("  Oshxona "))).toBe("Oshxona");
  });
});

describe("headerMatches (plan of 1.10, decision 10)", () => {
  const titles = [
    ["Nomi", "Turi"],
    ["Name", "Type"],
  ];
  it("the template's titles in any language pass, ignoring case and spaces", () => {
    expect(headerMatches([t(" name "), t("TYPE"), empty], titles)).toBe(true);
    expect(headerMatches([t("Nomi"), t("Turi")], titles)).toBe(true);
  });
  it("other titles, another order or a missing column are not the template", () => {
    expect(headerMatches([t("Type"), t("Name")], titles)).toBe(false);
    expect(headerMatches([t("Name")], titles)).toBe(false);
    expect(headerMatches([t("Name"), t("Nomi")], titles)).toBe(false);
  });
});

describe("productTypeOf (04 Catalogs table; A7; plan of 1.10, decision 8)", () => {
  it("empty is a product; the words of any language and the codes are read", () => {
    expect(productTypeOf("", WORDS)).toBe("GOODS");
    expect(productTypeOf("xizmat", WORDS)).toBe("SERVICE");
    expect(productTypeOf("Товар", WORDS)).toBe("GOODS");
    expect(productTypeOf("SERVICE", WORDS)).toBe("SERVICE");
    expect(productTypeOf("Mebel", WORDS)).toBeNull();
  });
});

describe("readProductRows (04 rules 1, 3, 7; plan of 1.10, decisions 6 to 9)", () => {
  it("a row with no subtype is a product without subtypes, its price on the product", () => {
    const { products, errors } = readProductRows(sheetOf([product("Qog'oz A4", "", 45000)]), WORDS);
    expect(errors).toEqual([]);
    expect(products).toEqual([
      {
        row: 2,
        name: "Qog'oz A4",
        type: "GOODS",
        category: "Kanselyariya",
        measure: "dona",
        company: null,
        description: null,
        price: 45000n,
        subtypes: [],
      },
    ]);
  });

  it("rows of one product, matched ignoring case and spaces, are its subtypes with their prices", () => {
    const { products, errors } = readProductRows(
      sheetOf([
        product("Ruchka", "Koʻk", "2 500"),
        ["  ruchka ", "", "", "", "", "", "Qora", null],
        product("RUCHKA", "Qizil", 3000),
      ]),
      WORDS,
    );
    expect(errors).toEqual([]);
    expect(products).toHaveLength(1);
    expect(products[0]!.price).toBeNull();
    expect(products[0]!.subtypes).toEqual([
      { row: 2, name: "Koʻk", price: 2500n },
      { row: 3, name: "Qora", price: null },
      { row: 4, name: "Qizil", price: 3000n },
    ]);
  });

  it("a later row that fills a product column with another value names the first row", () => {
    const { errors } = readProductRows(
      sheetOf([product("Ruchka", "Koʻk"), ["Ruchka", "", "Xoʻjalik", "", "", "", "Qora", null]]),
      WORDS,
    );
    expect(errors).toEqual([{ row: 3, column: "category", kind: "differsInFile", firstRow: 2 }]);
  });

  it("several rows of one product each need a subtype; two subtypes of one name are refused (04 rule 3)", () => {
    const { errors } = readProductRows(
      sheetOf([product("Ruchka", "Koʻk"), product("Ruchka"), product("Ruchka", " koʻk ")]),
      WORDS,
    );
    expect(errors).toEqual([
      { row: 3, column: "subtype", kind: "required" },
      { row: 4, column: "subtype", kind: "duplicateInFile", firstRow: 2 },
    ]);
  });

  it("the name, category and measure are required; a type that is no type is refused", () => {
    const { errors } = readProductRows(
      sheetOf([
        ["", "", "Kanselyariya", "dona"],
        ["Stol", "Mebel", "", ""],
      ]),
      WORDS,
    );
    expect(errors).toEqual([
      { row: 2, column: "name", kind: "required" },
      { row: 3, column: "type", kind: "notAllowed" },
      { row: 3, column: "category", kind: "required" },
      { row: 3, column: "measure", kind: "required" },
    ]);
  });

  it("a wrong price and a long description are named with their row", () => {
    const long = "x".repeat(1001);
    const { errors } = readProductRows(
      sheetOf([["Stol", "", "Mebel", "dona", "", long, "", "12.5"]]),
      WORDS,
    );
    expect(errors).toEqual([
      { row: 2, column: "description", kind: "tooLong" },
      { row: 2, column: "price", kind: "wrongFormat" },
    ]);
  });

  it("empty rows are skipped; a sheet with none left has no rows", () => {
    expect(readProductRows(sheetOf([[null, ""], []]), WORDS).errors).toEqual([
      { row: 0, column: "file", kind: "noRows" },
    ]);
  });

  it(`more than ${IMPORT_ROWS_MAX} rows are refused (plan of 1.10, decision 11)`, () => {
    const rows = Array.from({ length: IMPORT_ROWS_MAX + 1 }, (_, at) => product(`Mahsulot ${at}`));
    expect(readProductRows(sheetOf(rows), WORDS).errors).toEqual([
      { row: 0, column: "file", kind: "tooManyRows" },
    ]);
    expect(readProductRows(sheetOf(rows.slice(1)), WORDS).errors).toEqual([]);
  });
});

describe("readDepartmentRows (04 Catalogs table and rule 3; decisions 1.6 item 4)", () => {
  it("reads branch code, name and the optional person; a phone given as a number is its digits", () => {
    const { departments, errors } = readDepartmentRows(
      sheetOf([
        ["tsh", "Oshxona", "Aliyeva  Dilnoza", 998901234567],
        ["TSH", "Kutubxona"],
      ]),
    );
    expect(errors).toEqual([]);
    expect(departments).toEqual([
      {
        row: 2,
        branch: "TSH",
        name: "Oshxona",
        responsibleName: "Aliyeva Dilnoza",
        responsiblePhone: "998901234567",
      },
      { row: 3, branch: "TSH", name: "Kutubxona", responsibleName: null, responsiblePhone: null },
    ]);
  });

  it("the same name twice in one branch is refused; in two branches it passes", () => {
    const { departments, errors } = readDepartmentRows(
      sheetOf([
        ["TSH", "Oshxona"],
        ["SMQ", "Oshxona"],
        ["tsh", " oshxona"],
      ]),
    );
    expect(errors).toEqual([{ row: 4, column: "name", kind: "duplicateInFile", firstRow: 2 }]);
    expect(departments.map((row) => row.branch)).toEqual(["TSH", "SMQ"]);
  });

  it("a branch and a name are required; a wrong phone and a fractional cell are named", () => {
    const { errors } = readDepartmentRows(
      sheetOf([
        ["", "", "", "12ab"],
        ["TSH", n(1.5)],
      ]),
    );
    expect(errors).toEqual([
      { row: 2, column: "branch", kind: "required" },
      { row: 2, column: "name", kind: "required" },
      { row: 2, column: "responsiblePhone", kind: "wrongFormat" },
      { row: 3, column: "name", kind: "wrongFormat" },
    ]);
  });
});

describe("readPriceRows (04 rules 4 and 7; plan of 1.11, decisions 2, 6 and 7)", () => {
  const other: ImportCell = { kind: "other" };

  it("reads product, subtype, new price and note; an empty subtype is the hidden default", () => {
    const { prices, errors } = readPriceRows(
      sheetOf([
        ["  Daftar   A4 ", "Katta", 12000, " Sentabr narxi "],
        ["Ruchka", null, "1 500", "Yangi yetkazuvchi"],
        ["Qog'oz", "", 30000, 2026],
      ]),
    );
    expect(errors).toEqual([]);
    expect(prices).toEqual([
      { row: 2, product: "Daftar A4", subtype: "Katta", price: 12000n, note: "Sentabr narxi" },
      { row: 3, product: "Ruchka", subtype: null, price: 1500n, note: "Yangi yetkazuvchi" },
      // A whole number in the note is its digits (plan of 1.10, decision 14).
      { row: 4, product: "Qog'oz", subtype: null, price: 30000n, note: "2026" },
    ]);
  });

  it("a price that is missing, 0, negative, a fraction or not a sum is that row's error (rule 6)", () => {
    const { prices, errors } = readPriceRows(
      sheetOf([
        ["A", null, null, "x"],
        ["B", null, 0, "x"],
        ["C", null, -5, "x"],
        ["D", null, 10.5, "x"],
        ["E", null, "ko'p", "x"],
        ["F", null, other, "x"],
        ["G", null, 100, "x"],
        ["H", null, (MONEY_MAX + 1n).toString(), "x"],
      ]),
    );
    expect(errors).toEqual([
      { row: 2, column: "price", kind: "required" },
      { row: 3, column: "price", kind: "wrongFormat" },
      { row: 4, column: "price", kind: "wrongFormat" },
      { row: 5, column: "price", kind: "wrongFormat" },
      { row: 6, column: "price", kind: "wrongFormat" },
      { row: 7, column: "price", kind: "wrongFormat" },
      { row: 9, column: "price", kind: "wrongFormat" },
    ]);
    expect(prices.map((price) => price.product)).toEqual(["G"]);
  });

  it("a note is required, 1 to 200 code points; a date is wrong (04 rule 4; 1.9 decision 8)", () => {
    const { errors } = readPriceRows(
      sheetOf([
        ["A", null, 100, null],
        ["B", null, 100, "   "],
        ["C", null, 100, "ж".repeat(201)],
        ["D", null, 100, other],
        ["E", null, 100, "ж".repeat(200)],
      ]),
    );
    expect(errors).toEqual([
      { row: 2, column: "note", kind: "required" },
      { row: 3, column: "note", kind: "required" },
      { row: 4, column: "note", kind: "tooLong" },
      { row: 5, column: "note", kind: "wrongFormat" },
    ]);
  });

  it("an empty or long product name and a long subtype name are errors (04 rule 3)", () => {
    const { errors } = readPriceRows(
      sheetOf([
        [null, "Katta", 100, "x"],
        ["a".repeat(121), null, 100, "x"],
        ["A", "b".repeat(121), 100, "x"],
      ]),
    );
    expect(errors).toEqual([
      { row: 2, column: "name", kind: "required" },
      { row: 3, column: "name", kind: "tooLong" },
      { row: 4, column: "subtype", kind: "tooLong" },
    ]);
  });

  it("the same product and subtype twice names the first row; the same product without subtype too", () => {
    const { prices, errors } = readPriceRows(
      sheetOf([
        ["Daftar", "Katta", 100, "x"],
        ["Ruchka", null, 100, "x"],
        ["daftar ", " KATTA", 200, "x"],
        ["RUCHKA", "", 200, "x"],
        // A product named with and without a subtype: both read, the database decides (decision 6).
        ["Daftar", null, 300, "x"],
      ]),
    );
    expect(errors).toEqual([
      { row: 4, column: "subtype", kind: "duplicateInFile", firstRow: 2 },
      { row: 5, column: "name", kind: "duplicateInFile", firstRow: 3 },
    ]);
    expect(prices.map((price) => price.row)).toEqual([2, 3, 6]);
  });

  it("names every row whose product and subtype were read, a wrong price or note too, for the preview", () => {
    const { named } = readPriceRows(
      sheetOf([
        ["Daftar", "Katta", 0, null],
        [null, null, 100, "x"],
        ["Ruchka", null, 100, "x"],
      ]),
    );
    expect(named).toEqual([
      { row: 2, product: "Daftar", subtype: "Katta" },
      { row: 4, product: "Ruchka", subtype: null },
    ]);
  });

  it("an empty file and a file over the row limit are one file error", () => {
    expect(readPriceRows(sheetOf([[null, null, null, null]])).errors).toEqual([
      { row: 0, column: "file", kind: "noRows" },
    ]);
    const many = Array.from({ length: IMPORT_ROWS_MAX + 1 }, (_, at) => [`P${at}`, null, 100, "x"]);
    expect(readPriceRows(sheetOf(many)).errors).toEqual([
      { row: 0, column: "file", kind: "tooManyRows" },
    ]);
  });
});

describe("importErrorKey", () => {
  it("a row's error is <row>:<column>; the file's is file", () => {
    expect(importErrorKey({ row: 7, column: "category" })).toBe("7:category");
    expect(importErrorKey({ row: 0, column: "file" })).toBe("file");
  });
});

describe('cellQuantity: a quantity cell, never rounded (edge case "Half a piece"; plan of 5.9, review should fix 3)', () => {
  it("a text trimmed, a number as written, empty as nothing; a date or an error cell is no quantity", () => {
    expect(cellQuantity(t(" 12,5 "))).toBe("12,5");
    expect(cellQuantity(n(2.5))).toBe("2.5");
    expect(cellQuantity(n(2.5555))).toBe("2.5555");
    expect(cellQuantity(n(1e21))).toBe("1e+21");
    expect(cellQuantity(empty)).toBe("");
    expect(cellQuantity(undefined)).toBe("");
    expect(cellQuantity(n(Number.NaN))).toBeNull();
    expect(cellQuantity({ kind: "other" })).toBeNull();
  });
});

describe("cellCost: whole so'm, 0 or more, no float (09 Direct entry, Lines; plan of 5.9, decided item 1, Look first)", () => {
  it("empty is no cost; 0 is allowed; a text by parseSomOrZero(); a fraction, a negative, a word or a date is wrong", () => {
    expect(cellCost(empty)).toBeNull();
    expect(cellCost(t("  "))).toBeNull();
    expect(cellCost(n(0))).toBe(0n);
    expect(cellCost(t("0"))).toBe(0n);
    expect(cellCost(n(150000))).toBe(150000n);
    expect(cellCost(t("12 000"))).toBe(12000n);
    expect(cellCost(n(1500.5))).toBe("wrong");
    expect(cellCost(n(-1))).toBe("wrong");
    expect(cellCost(t("-1"))).toBe("wrong");
    expect(cellCost(t("bir ming"))).toBe("wrong");
    expect(cellCost({ kind: "other" })).toBe("wrong");
    expect(cellCost(t(String(MONEY_MAX)))).toBe(MONEY_MAX);
    expect(cellCost(t(String(MONEY_MAX + 1n)))).toBe("wrong");
  });
});

describe("readStockRows (09 Direct entry by the Head 1; 04 rule 7; plan of 5.9)", () => {
  it("reads product, subtype, quantity and cost; an empty subtype is the default, an empty cost is left to the reference price", () => {
    const { stock, errors } = readStockRows(
      sheetOf([
        ["Stul", "", 200, 150000],
        ["Qog'oz", "A4", "2.5", ""],
        ["Qog'oz", "A3", n(3), n(0)],
      ]),
    );
    expect(errors).toEqual([]);
    expect(stock).toEqual([
      { row: 2, product: "Stul", subtype: null, qty: "200", cost: 150000n },
      { row: 3, product: "Qog'oz", subtype: "A4", qty: "2.5", cost: null },
      { row: 4, product: "Qog'oz", subtype: "A3", qty: "3", cost: 0n },
    ]);
  });

  it("the quantity rules: empty is required, 0 too small, 4 decimals too many, an exponent wrong; whole units are left to the measure", () => {
    const { stock, errors } = readStockRows(
      sheetOf([
        ["Stul", "", null, 1],
        ["Stol", "", 0, 1],
        ["Ruchka", "", 2.5555, 1],
        ["Daftar", "", 1e21, 1],
        ["Un", "", 2.5, 1],
      ]),
    );
    expect(errors).toEqual([
      { row: 2, column: "qty", kind: "required" },
      { row: 3, column: "qty", kind: "tooSmall" },
      { row: 4, column: "qty", kind: "tooManyDecimals" },
      { row: 5, column: "qty", kind: "wrongFormat" },
    ]);
    expect(stock.map((entry) => entry.row)).toEqual([6]);
  });

  it("a wrong cost, a missing product name and a too long subtype are each their row's error", () => {
    const { stock, errors } = readStockRows(
      sheetOf([
        ["Stul", "", 1, 10.5],
        ["", "A4", 1, 1],
        ["Qog'oz", "x".repeat(121), 1, 1],
      ]),
    );
    expect(errors).toEqual([
      { row: 2, column: "cost", kind: "wrongFormat" },
      { row: 3, column: "name", kind: "required" },
      { row: 4, column: "subtype", kind: "tooLong" },
    ]);
    expect(stock).toEqual([]);
  });

  it("the same product and subtype twice, in any case and spacing, names the first row (decided item 6)", () => {
    const { stock, errors } = readStockRows(
      sheetOf([
        ["Qog'oz", "A4", 1, 1],
        ["qog'oz ", " a4", 2, 1],
        ["Stul", "", 1, 1],
        ["STUL", "", 1, 1],
      ]),
    );
    expect(errors).toEqual([
      { row: 3, column: "subtype", kind: "duplicateInFile", firstRow: 2 },
      { row: 5, column: "name", kind: "duplicateInFile", firstRow: 4 },
    ]);
    expect(stock.map((entry) => entry.row)).toEqual([2, 4]);
  });

  it("no rows, or more than the limit, is the file's error", () => {
    expect(readStockRows(sheetOf([])).errors).toEqual([{ row: 0, column: "file", kind: "noRows" }]);
    const many = Array.from({ length: IMPORT_ROWS_MAX + 1 }, (_, at) => [`Stul ${at}`, "", 1, 1]);
    expect(readStockRows(sheetOf(many)).errors).toEqual([
      { row: 0, column: "file", kind: "tooManyRows" },
    ]);
  });

  it("named keeps a row with a wrong quantity or cost for the preview's database check", () => {
    const { stock, named } = readStockRows(sheetOf([["Stul", "", 0, "x"]]));
    expect(stock).toEqual([]);
    expect(named).toEqual([{ row: 2, product: "Stul", subtype: null, qty: "0", cost: null }]);
  });
});
