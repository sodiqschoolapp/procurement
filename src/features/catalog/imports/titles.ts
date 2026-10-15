import { IMPORT_COLUMNS, type ImportKind } from "@/domain/imports";
import type { ProductType } from "@/domain/products";
import { LOCALES, type Locale } from "@/i18n/locale";
import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";

// The words of an import's template, from the message files (CLAUDE.md rule 13; spec review of the
// plan of 1.10, Should fix 8): the column titles and the sheet's name in one language for the
// template, and in every language for reading a file back (plan of 1.10, decision 10), and the
// product type words of every language (decision 8).

const MESSAGES = { uz, ru, en } satisfies Record<Locale, unknown>;

/** The template's column titles in one language. */
export function importTitles(kind: ImportKind, locale: Locale): string[] {
  const columns = MESSAGES[locale].imports.columns[kind] as Record<string, string>;
  return IMPORT_COLUMNS[kind].map((column) => columns[column]!);
}

/** The column titles in every language: a file filled in any of them is read. */
export function everyImportTitles(kind: ImportKind): string[][] {
  return LOCALES.map((locale) => importTitles(kind, locale));
}

/** The name of the template's sheet. */
export function importSheetName(kind: ImportKind, locale: Locale): string {
  return MESSAGES[locale].imports.sheet[kind];
}

/** "Product" and "Service" in every language. */
export const PRODUCT_TYPE_WORDS: Record<ProductType, string[]> = {
  GOODS: LOCALES.map((locale) => MESSAGES[locale].catalog.productType.GOODS),
  SERVICE: LOCALES.map((locale) => MESSAGES[locale].catalog.productType.SERVICE),
};
