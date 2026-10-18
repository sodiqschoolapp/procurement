import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import { bindFormatters } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";
import uz from "@/i18n/messages/uz.json";
import {
  BORDER,
  HEADER_FILL,
  Letterhead,
  MUTED,
  NAVY,
  letterhead,
  logoPng,
  registerFonts,
} from "@/server/pdf";

import type { IssueNote } from "../queries/issue-note";

// The issue note as a PDF (09-warehouse.md, Issue to a department 2: "a PDF issue note naming who
// gave the items and who received them, as typed. There are no signature lines"; build plan 5.4,
// from the former 5.5: "in the style of the order list download: number, date, department, items,
// who gave them and who received them as typed"; plan of 5.4, decided items 11 and 14). A4
// portrait with the letterhead, Golos Text and navy text of the order list download
// (src/features/orders/download/pdf.tsx), who downloaded it and when on every page, in the
// downloader's language (05 Download 2 and 3). Every word comes from the message files (CLAUDE.md
// rule 13); dates and quantities from the shared formatters (11 rule 10). No signature line, and
// no place for one.

const MESSAGES = { uz, ru, en } satisfies Record<Locale, unknown>;

/** The texts of one note, in one language. */
export type IssueNoteSheet = {
  locale: Locale;
  title: string;
  downloadedLine: string;
  fields: { label: string; value: string }[];
  titles: { product: string; subtype: string; quantity: string };
  lines: { product: string; subtype: string; quantity: string }[];
  pageLine: (page: number, pages: number) => string;
};

/** The note's texts: every value as the screen would show it. */
export function issueNoteSheet(note: IssueNote, locale: Locale, at: Date): IssueNoteSheet {
  const messages = MESSAGES[locale];
  const t = createTranslator({ locale, messages, namespace: "warehouse.issueNote" });
  const tRoot = createTranslator({ locale, messages });
  const format = bindFormatters(locale, tRoot("format.currency"));
  const title = t("title", { number: note.number });
  const fields = [
    { label: t("number"), value: note.number },
    { label: t("date"), value: format.date(note.docDate) },
    { label: t("branch"), value: `${note.branchCode} · ${note.branchName}` },
    { label: t("department"), value: note.departmentName },
    { label: t("givenBy"), value: note.givenBy },
    { label: t("receivedBy"), value: note.receivedBy ?? "—" },
  ];
  if (note.status === "REVERSED") fields.push({ label: t("status"), value: t("reversed") });
  if (note.comment) fields.push({ label: t("comment"), value: note.comment });
  return {
    locale,
    title: note.schoolName ? `${note.schoolName} · ${title}` : title,
    downloadedLine: t("downloadedBy", {
      name: note.downloadedBy,
      at: `${format.date(at)} ${format.time(at)}`,
    }),
    fields,
    titles: { product: t("product"), subtype: t("subtype"), quantity: t("quantity") },
    lines: note.lines.map((line) => ({
      product: line.productName,
      subtype: line.subtypeName ?? "—",
      quantity: `${format.quantity(line.qty)} ${line.unitShortName}`,
    })),
    pageLine: (page, pages) => t("page", { page, pages }),
  };
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Golos Text",
    fontSize: 10,
    color: NAVY,
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  fields: { marginBottom: 14, gap: 3 },
  field: { flexDirection: "row" },
  label: { width: 130, color: MUTED },
  value: { flex: 1, fontWeight: 600 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER },
  head: { backgroundColor: HEADER_FILL, fontWeight: 600 },
  cell: { paddingVertical: 4, paddingHorizontal: 3 },
  product: { width: "50%" },
  subtype: { width: "28%" },
  quantity: { width: "22%", textAlign: "right" },
});

function IssueNotePdf({ sheet, logoSrc }: { sheet: IssueNoteSheet; logoSrc: Buffer }) {
  return (
    <Document title={sheet.title} language={sheet.locale}>
      <Page size="A4" style={styles.page}>
        <Letterhead logoSrc={logoSrc} title={sheet.title} captions={[sheet.downloadedLine]} />

        <View style={styles.fields}>
          {sheet.fields.map((field) => (
            <View key={field.label} style={styles.field}>
              <Text style={styles.label}>{field.label}</Text>
              <Text style={styles.value}>{field.value}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.row, styles.head]} fixed>
          <Text style={[styles.cell, styles.product]}>{sheet.titles.product}</Text>
          <Text style={[styles.cell, styles.subtype]}>{sheet.titles.subtype}</Text>
          <Text style={[styles.cell, styles.quantity]}>{sheet.titles.quantity}</Text>
        </View>
        {sheet.lines.map((line, index) => (
          <View key={index} style={styles.row} wrap={false}>
            <Text style={[styles.cell, styles.product]}>{line.product}</Text>
            <Text style={[styles.cell, styles.subtype]}>{line.subtype}</Text>
            <Text style={[styles.cell, styles.quantity]}>{line.quantity}</Text>
          </View>
        ))}

        <Text
          style={letterhead.footer}
          fixed
          render={({ pageNumber, totalPages }) => sheet.pageLine(pageNumber, totalPages)}
        />
      </Page>
    </Document>
  );
}

/** The PDF of one issue note, as bytes. */
export async function writeIssueNotePdf(sheet: IssueNoteSheet): Promise<Uint8Array<ArrayBuffer>> {
  registerFonts();
  const logoSrc = await logoPng();
  return new Uint8Array(await renderToBuffer(<IssueNotePdf sheet={sheet} logoSrc={logoSrc} />));
}
