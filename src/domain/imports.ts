import { catalogName, isCatalogName } from "./catalogs";
import { parseSom } from "./money";
import type { Permission } from "./permissions";
import { isPriceNote, priceNote } from "./prices";
import { DEFAULT_PRODUCT_TYPE, PRODUCT_TYPES, type ProductType, isDescription } from "./products";
import { fullName, isFullName, isPhone, phone } from "./users";

// The Excel import of catalogs (04-catalogs.md rule 7: "Products, subtypes, prices, departments and
// existing stock can be imported from an Excel template. The import shows a preview with errors per
// row and saves nothing unless every row is valid"; build-plan 1.10). Pure: the rows of the first
// worksheet, as src/server/excel.ts reads them, become the entries to create or a list of errors,
// each naming its row and column. The same functions serve the preview and the save, which checks
// every row again (plan of 1.10, decision 5). What only the database knows (a category that exists,
// a name already taken) is checked in src/features/catalog/imports/check.ts.
//
// - A price is read by the one parser, parseSom(): a number cell only when it is a safe whole
//   number more than 0, then by its digits, so MONEY_MAX holds and no float touches the amount
//   (plan of 1.10, decision 1, Look first; developer-rules.md rule 6).
// - A text column takes a whole-number cell as its digits (a phone typed in Excel), and refuses a
//   fraction, a date or an error cell (decision 15).
// - The column titles and the type words come from the message files, passed in by the server;
//   none is written here (CLAUDE.md rule 13).

/** What can be imported (phase 5 adds existing stock). */
export const IMPORT_KINDS = ["products", "departments", "prices"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export function isImportKind(value: unknown): value is ImportKind {
  return typeof value === "string" && (IMPORT_KINDS as readonly string[]).includes(value);
}

/**
 * The permission of each kind, checked by its page, template, preview and save alike: a new price
 * is "Add a new price for a product" (03 Permission matrix; plan of 1.11, decision 4, Look first).
 */
export const IMPORT_PERMISSIONS = {
  products: "catalog.manage",
  departments: "catalog.manage",
  prices: "price.add",
} as const satisfies Record<ImportKind, Permission>;

/** The columns of each template, in order (plans of 1.10 and 1.11, "What will exist"). */
export const IMPORT_COLUMNS = {
  products: ["name", "type", "category", "measure", "company", "description", "subtype", "price"],
  departments: ["branch", "name", "responsibleName", "responsiblePhone"],
  prices: ["name", "subtype", "price", "note"],
} as const satisfies Record<ImportKind, readonly string[]>;

export type ImportColumn = (typeof IMPORT_COLUMNS)[ImportKind][number];

/** The most data rows one file may hold (decision 11). */
export const IMPORT_ROWS_MAX = 500;

/** The largest file, below the 1 MB body limit of a server action (decision 11). */
export const IMPORT_FILE_MAX_BYTES = 900 * 1024;

/** The most bytes the file may unpack to, declared or real (decision 11; plan review, correction 3). */
export const IMPORT_UNPACKED_MAX_BYTES = 20 * 1024 * 1024;

/** One cell as the reader gives it: its text, a number, nothing, or another kind (a date, an error). */
export type ImportCell =
  | { kind: "empty" }
  | { kind: "text"; text: string }
  | { kind: "number"; value: number }
  | { kind: "other" };

/** A row of the sheet: its number as Excel shows it, and its cells from column A on. */
export type ImportRow = { row: number; cells: ImportCell[] };

/** The first worksheet: the header row and the rows below it. */
export type ImportSheet = { header: ImportCell[]; rows: ImportRow[] };

/**
 * What is wrong, as a kind of `errors.field` (src/server/action-result.ts lists the same names, and
 * the compiler checks they agree where the server turns one into the other).
 */
export type ImportErrorKind =
  | "required"
  | "tooLong"
  | "wrongFormat"
  | "notAllowed"
  | "taken"
  | "inactive"
  | "branchInactive"
  | "unknown"
  | "ambiguous"
  | "duplicateInFile"
  | "differsInFile"
  | "notTemplate"
  | "fileTooLarge"
  | "tooManyRows"
  | "noRows";

/**
 * One error. `row` 0 and column `file` is the file as a whole. `firstRow`: the row the value
 * differs from, or the row that already holds it in the file.
 */
export type ImportError = {
  row: number;
  column: ImportColumn | "file";
  kind: ImportErrorKind;
  firstRow?: number;
};

/** The key of an error in an action's field errors: `<row>:<column>`, or `file`. */
export function importErrorKey(error: Pick<ImportError, "row" | "column">): string {
  return error.column === "file" ? "file" : `${error.row}:${error.column}`;
}

/** A cell as text, trimmed; a whole number as its digits; `null` for a cell that cannot be text. */
export function cellText(cell: ImportCell | undefined): string | null {
  if (!cell || cell.kind === "empty") return "";
  if (cell.kind === "text") return cell.text.trim();
  if (cell.kind === "number") return Number.isSafeInteger(cell.value) ? String(cell.value) : null;
  return null;
}

/**
 * A price cell (decision 1, Look first): empty is no price; a text goes through parseSom(); a
 * number only when a safe whole number more than 0, then parseSom() of its digits, so MONEY_MAX
 * holds. Anything else is "wrong": never rounded.
 */
export function cellPrice(cell: ImportCell | undefined): bigint | null | "wrong" {
  if (!cell || cell.kind === "empty") return null;
  if (cell.kind === "text") {
    if (cell.text.trim() === "") return null;
    return parseSom(cell.text) ?? "wrong";
  }
  if (cell.kind === "number") {
    if (!Number.isSafeInteger(cell.value) || cell.value <= 0) return "wrong";
    return parseSom(String(cell.value)) ?? "wrong";
  }
  return "wrong";
}

/** A text as the titles and words are compared: lower case, spaces collapsed. */
function folded(value: string): string {
  return catalogName(value).toLowerCase();
}

function isEmptyRow(row: ImportRow): boolean {
  return row.cells.every((cell) => cellText(cell) === "");
}

/**
 * Whether the header row is the template's, in one of the languages (decision 10): the same titles
 * in the same order, ignoring capital letters and extra spaces; empty cells after them are allowed.
 */
export function headerMatches(header: readonly ImportCell[], titles: readonly string[][]): boolean {
  const read = header.map((cell) => cellText(cell));
  while (read.length > 0 && read[read.length - 1] === "") read.pop();
  return titles.some(
    (set) =>
      set.length === read.length &&
      set.every((title, at) => folded(title) === folded(read[at] ?? "")),
  );
}

/**
 * The type a cell names (04 Catalogs table; A7; decision 8): empty is a product; the words of any
 * language, or GOODS and SERVICE themselves. `null` when it names neither.
 */
export function productTypeOf(
  text: string,
  words: Readonly<Record<ProductType, readonly string[]>>,
): ProductType | null {
  if (text === "") return DEFAULT_PRODUCT_TYPE;
  const wanted = folded(text);
  for (const type of PRODUCT_TYPES) {
    if (folded(type) === wanted) return type;
    if (words[type].some((word) => folded(word) === wanted)) return type;
  }
  return null;
}

/** The data rows, empty ones left out, or the file's own error. */
function dataRows(sheet: ImportSheet): { rows: ImportRow[]; error: ImportError | null } {
  const rows = sheet.rows.filter((row) => !isEmptyRow(row));
  if (rows.length === 0) return { rows, error: { row: 0, column: "file", kind: "noRows" } };
  if (rows.length > IMPORT_ROWS_MAX) {
    return { rows: [], error: { row: 0, column: "file", kind: "tooManyRows" } };
  }
  return { rows, error: null };
}

type Reader = {
  errors: ImportError[];
  /** A text column, as text; an error and `null` when the cell cannot be text. */
  text(row: ImportRow, at: number, column: ImportColumn): string | null;
};

function reader(): Reader {
  const errors: ImportError[] = [];
  return {
    errors,
    text(row, at, column) {
      const text = cellText(row.cells[at]);
      if (text === null) errors.push({ row: row.row, column, kind: "wrongFormat" });
      return text;
    },
  };
}

/** A catalog name: required, 1 to 120 code points once spaces are collapsed (04 rule 3). */
function readName(read: Reader, row: ImportRow, at: number, column: ImportColumn): string | null {
  const raw = read.text(row, at, column);
  if (raw === null) return null;
  const name = catalogName(raw);
  if (name === "") {
    read.errors.push({ row: row.row, column, kind: "required" });
    return null;
  }
  if (!isCatalogName(name)) {
    read.errors.push({ row: row.row, column, kind: "tooLong" });
    return null;
  }
  return name;
}

/** A subtype of an imported product, with its own row and price. */
export type ImportedSubtype = { row: number; name: string; price: bigint | null };

/**
 * A product to create (decision 9): the columns of its first row; its price when it has no
 * subtypes; its subtypes, each with its price, when it has. Category, measure and company are the
 * names as typed, matched in the database.
 */
export type ImportedProduct = {
  row: number;
  name: string;
  type: ProductType;
  category: string;
  measure: string;
  company: string | null;
  description: string | null;
  price: bigint | null;
  subtypes: ImportedSubtype[];
};

type ProductLine = {
  row: number;
  name: string;
  type: ProductType | null;
  typeText: string;
  category: string;
  measure: string;
  company: string;
  description: string;
  subtype: string;
  price: bigint | null | "wrong";
};

const PRODUCT_AT = Object.fromEntries(
  IMPORT_COLUMNS.products.map((column, at) => [column, at]),
) as Record<(typeof IMPORT_COLUMNS.products)[number], number>;

/**
 * The products of a sheet (04 rule 7; plan of 1.10, decisions 6 to 9). Rows of one product share
 * its name, compared ignoring capital letters and extra spaces (04 rule 3); its columns are filled
 * on its first row, and a later row may leave them empty or repeat them. One row with no subtype
 * is a product without subtypes; several rows each name a subtype.
 */
export function readProductRows(
  sheet: ImportSheet,
  words: Readonly<Record<ProductType, readonly string[]>>,
): { products: ImportedProduct[]; errors: ImportError[] } {
  const { rows, error } = dataRows(sheet);
  if (error) return { products: [], errors: [error] };
  const read = reader();
  const lines: ProductLine[] = [];
  for (const row of rows) {
    const name = readName(read, row, PRODUCT_AT.name, "name");
    const typeText = read.text(row, PRODUCT_AT.type, "type") ?? "";
    const category = read.text(row, PRODUCT_AT.category, "category");
    const measure = read.text(row, PRODUCT_AT.measure, "measure");
    const company = read.text(row, PRODUCT_AT.company, "company");
    const description = read.text(row, PRODUCT_AT.description, "description");
    const subtype = read.text(row, PRODUCT_AT.subtype, "subtype");
    const price = cellPrice(row.cells[PRODUCT_AT.price]);
    if (price === "wrong") read.errors.push({ row: row.row, column: "price", kind: "wrongFormat" });
    if (name === null) continue;
    lines.push({
      row: row.row,
      name,
      type: productTypeOf(typeText, words),
      typeText,
      category: category === null ? "" : catalogName(category),
      measure: measure === null ? "" : catalogName(measure),
      company: company === null ? "" : catalogName(company),
      description: description ?? "",
      subtype: subtype === null ? "" : catalogName(subtype),
      price,
    });
  }

  const groups = new Map<string, ProductLine[]>();
  for (const line of lines) {
    const key = folded(line.name);
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }

  const products: ImportedProduct[] = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    if (first.type === null) {
      read.errors.push({ row: first.row, column: "type", kind: "notAllowed" });
    }
    if (first.category === "")
      read.errors.push({ row: first.row, column: "category", kind: "required" });
    if (first.measure === "")
      read.errors.push({ row: first.row, column: "measure", kind: "required" });
    if (first.description !== "" && !isDescription(first.description)) {
      read.errors.push({ row: first.row, column: "description", kind: "tooLong" });
    }
    // A later row repeats the product's columns or leaves them empty (decision 9).
    for (const line of group.slice(1)) {
      const differs = (column: ImportColumn, mine: string, same: boolean) => {
        if (mine !== "" && !same) {
          read.errors.push({ row: line.row, column, kind: "differsInFile", firstRow: first.row });
        }
      };
      differs("type", line.typeText, line.type === first.type);
      differs("category", line.category, folded(line.category) === folded(first.category));
      differs("measure", line.measure, folded(line.measure) === folded(first.measure));
      differs("company", line.company, folded(line.company) === folded(first.company));
      differs("description", line.description, line.description === first.description);
    }

    const subtypes: ImportedSubtype[] = [];
    const withSubtypes = group.length > 1 || first.subtype !== "";
    if (withSubtypes) {
      const seen = new Map<string, number>();
      for (const line of group) {
        if (line.subtype === "") {
          read.errors.push({ row: line.row, column: "subtype", kind: "required" });
          continue;
        }
        if (!isCatalogName(line.subtype)) {
          read.errors.push({ row: line.row, column: "subtype", kind: "tooLong" });
          continue;
        }
        const key = folded(line.subtype);
        const earlier = seen.get(key);
        if (earlier !== undefined) {
          read.errors.push({
            row: line.row,
            column: "subtype",
            kind: "duplicateInFile",
            firstRow: earlier,
          });
          continue;
        }
        seen.set(key, line.row);
        subtypes.push({
          row: line.row,
          name: line.subtype,
          price: line.price === "wrong" ? null : line.price,
        });
      }
    }

    products.push({
      row: first.row,
      name: first.name,
      type: first.type ?? DEFAULT_PRODUCT_TYPE,
      category: first.category,
      measure: first.measure,
      company: first.company === "" ? null : first.company,
      description: first.description === "" ? null : first.description,
      price: withSubtypes || first.price === "wrong" ? null : first.price,
      subtypes,
    });
  }
  return { products, errors: sorted(read.errors, IMPORT_COLUMNS.products) };
}

/** A department to create: its branch by code, its name, its responsible person (04; 1.6). */
export type ImportedDepartment = {
  row: number;
  branch: string;
  name: string;
  responsibleName: string | null;
  responsiblePhone: string | null;
};

const DEPARTMENT_AT = Object.fromEntries(
  IMPORT_COLUMNS.departments.map((column, at) => [column, at]),
) as Record<(typeof IMPORT_COLUMNS.departments)[number], number>;

/**
 * The departments of a sheet (04 rule 7; Catalogs table: "Branch, name, responsible person (name
 * and phone)"; rule 3: names unique inside a branch; decisions 1.6 item 4: the person's name and
 * phone are optional, with the users' rules when filled).
 */
export function readDepartmentRows(sheet: ImportSheet): {
  departments: ImportedDepartment[];
  errors: ImportError[];
} {
  const { rows, error } = dataRows(sheet);
  if (error) return { departments: [], errors: [error] };
  const read = reader();
  const departments: ImportedDepartment[] = [];
  const seen = new Map<string, number>();
  for (const row of rows) {
    const before = read.errors.length;
    const branch = read.text(row, DEPARTMENT_AT.branch, "branch");
    if (branch === "") read.errors.push({ row: row.row, column: "branch", kind: "required" });
    const name = readName(read, row, DEPARTMENT_AT.name, "name");
    const personText = read.text(row, DEPARTMENT_AT.responsibleName, "responsibleName");
    const person = personText === null ? null : fullName(personText);
    if (person !== null && person !== "" && !isFullName(person)) {
      read.errors.push({ row: row.row, column: "responsibleName", kind: "tooLong" });
    }
    const phoneText = read.text(row, DEPARTMENT_AT.responsiblePhone, "responsiblePhone");
    const phoneValue = phoneText === null ? null : phone(phoneText);
    if (phoneValue !== null && phoneValue !== "" && !isPhone(phoneValue)) {
      read.errors.push({ row: row.row, column: "responsiblePhone", kind: "wrongFormat" });
    }
    if (branch && name) {
      const key = `${folded(branch)}\u0000${folded(name)}`;
      const earlier = seen.get(key);
      if (earlier !== undefined) {
        read.errors.push({
          row: row.row,
          column: "name",
          kind: "duplicateInFile",
          firstRow: earlier,
        });
      } else {
        seen.set(key, row.row);
      }
    }
    if (read.errors.length > before || !branch || !name) continue;
    departments.push({
      row: row.row,
      branch: branch.toUpperCase(),
      name,
      responsibleName: person || null,
      responsiblePhone: phoneValue || null,
    });
  }
  return { departments, errors: sorted(read.errors, IMPORT_COLUMNS.departments) };
}

/**
 * A new price of one subtype (04 rule 4; plan of 1.11): the product and subtype as typed, matched
 * in the database (src/features/catalog/imports/check.ts); `subtype` null is the hidden default of
 * a product without subtypes (decision 6).
 */
export type ImportedPrice = {
  row: number;
  product: string;
  subtype: string | null;
  price: bigint;
  note: string;
};

const PRICE_AT = Object.fromEntries(
  IMPORT_COLUMNS.prices.map((column, at) => [column, at]),
) as Record<(typeof IMPORT_COLUMNS.prices)[number], number>;

/** The subtype a row names, as typed: what the database check needs of a price row. */
export type PriceRowName = Pick<ImportedPrice, "row" | "product" | "subtype">;

/**
 * The new prices of a sheet (04 rules 4 and 7; plan of 1.11, decisions 1, 2 and 6). Each row: the
 * product's name, the subtype's name or nothing, the new price (required, read by parseSom() as in
 * 1.10 decision 1), and the note the Head gives a new price by hand (required, 1 to 200 code
 * points; 1.9 decision 8). The same product and subtype twice is an error naming the first row; the
 * database refuses two rows that land on one subtype as well, whatever this fold says (plan review
 * of 1.11, Should fix 1). `named`: every row whose product and subtype could be read, also one
 * with a wrong price or note, so the preview checks its names in the database as well.
 */
export function readPriceRows(sheet: ImportSheet): {
  prices: ImportedPrice[];
  named: PriceRowName[];
  errors: ImportError[];
} {
  const { rows, error } = dataRows(sheet);
  if (error) return { prices: [], named: [], errors: [error] };
  const read = reader();
  const prices: ImportedPrice[] = [];
  const named: PriceRowName[] = [];
  const seen = new Map<string, number>();
  for (const row of rows) {
    const before = read.errors.length;
    const product = readName(read, row, PRICE_AT.name, "name");
    const subtypeText = read.text(row, PRICE_AT.subtype, "subtype");
    const subtype = subtypeText === null ? null : catalogName(subtypeText);
    if (subtype !== null && subtype !== "" && !isCatalogName(subtype)) {
      read.errors.push({ row: row.row, column: "subtype", kind: "tooLong" });
    }
    const price = cellPrice(row.cells[PRICE_AT.price]);
    if (price === null) read.errors.push({ row: row.row, column: "price", kind: "required" });
    if (price === "wrong") read.errors.push({ row: row.row, column: "price", kind: "wrongFormat" });
    const noteText = read.text(row, PRICE_AT.note, "note");
    const note = noteText === null ? null : priceNote(noteText);
    if (note === "") read.errors.push({ row: row.row, column: "note", kind: "required" });
    else if (note !== null && !isPriceNote(note)) {
      read.errors.push({ row: row.row, column: "note", kind: "tooLong" });
    }
    if (product !== null && subtype !== null) {
      const key = `${folded(product)}\u0000${folded(subtype)}`;
      const earlier = seen.get(key);
      if (earlier !== undefined) {
        read.errors.push({
          row: row.row,
          column: subtype === "" ? "name" : "subtype",
          kind: "duplicateInFile",
          firstRow: earlier,
        });
      } else {
        seen.set(key, row.row);
        named.push({ row: row.row, product, subtype: subtype === "" ? null : subtype });
      }
    }
    if (read.errors.length > before || product === null || subtype === null) continue;
    if (price === null || price === "wrong" || note === null) continue;
    prices.push({ row: row.row, product, subtype: subtype === "" ? null : subtype, price, note });
  }
  return { prices, named, errors: sorted(read.errors, IMPORT_COLUMNS.prices) };
}

/** Errors in the order of the sheet: by row, then by column. */
function sorted(errors: ImportError[], columns: readonly string[]): ImportError[] {
  const order = (column: ImportError["column"]) => columns.indexOf(column);
  return [...errors].sort((a, b) => a.row - b.row || order(a.column) - order(b.column));
}
