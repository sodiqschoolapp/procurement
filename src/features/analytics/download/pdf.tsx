import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

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

import type { CellValue } from "./excel";
import type { AnalyticsReport, ReportSection } from "./page-report";

// The Analytics page as a PDF report (10-notifications-analytics-reports.md, Analytics page per
// role, point 4; build-plan 6.7; plan of 6.7, decided item 1, Look first): A4 landscape as the
// order list's plain PDF (05-order-request-form.md, Download 2), the letterhead strip, Golos Text,
// navy text, on every page the title, the period, the filters, who downloaded it and when, and the
// page number; no signature lines. Every text is page-report.ts's; this file only draws.

const styles = StyleSheet.create({
  page: {
    fontFamily: "Golos Text",
    fontSize: 8,
    color: NAVY,
    paddingTop: 110,
    paddingBottom: 36,
    paddingHorizontal: 20,
  },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 600, marginBottom: 4 },
  note: { color: MUTED, marginBottom: 2 },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 6 },
  figure: {
    width: 180,
    padding: 6,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderRadius: 4,
    gap: 1,
  },
  figureLabel: { color: MUTED, fontWeight: 600 },
  figureValue: { fontSize: 12, fontWeight: 600 },
  table: { marginTop: 8 },
  caption: { fontWeight: 600, marginBottom: 2 },
  captionLine: { color: MUTED, marginBottom: 2 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER },
  head: { backgroundColor: HEADER_FILL, fontWeight: 600 },
  cell: { flex: 1, paddingVertical: 2.5, paddingHorizontal: 3 },
  first: { flex: 2.4 },
  number: { textAlign: "right" },
  strong: { fontWeight: 600 },
});

/** A cell as the screen writes it, with the formatters of the downloader's language. */
function cellText(cell: CellValue, format: AnalyticsReport["format"]): string {
  switch (cell.kind) {
    case "text":
      return cell.value;
    case "money":
    case "signedMoney":
      return format.money(cell.value);
    case "count":
      return format.quantity(String(cell.value));
    case "date":
      return format.date(cell.value);
  }
}

const isNumber = (cell: CellValue | undefined) =>
  cell !== undefined && cell.kind !== "text" && cell.kind !== "date";

function Section({ section, report }: { section: ReportSection; report: AnalyticsReport }) {
  const { format } = report;
  return (
    <View style={styles.section}>
      {/* The title stays with its notes, its numbers and the start of its first table. */}
      <View wrap={false} minPresenceAhead={60}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        {section.notes.map((note, index) => (
          <Text key={index} style={styles.note}>
            {note}
          </Text>
        ))}
        {section.figures.length > 0 && (
          <View style={styles.figures}>
            {section.figures.map((figure, index) => (
              <View key={index} style={styles.figure}>
                <Text style={styles.figureLabel}>{figure.label}</Text>
                <Text style={styles.figureValue}>{figure.value}</Text>
                {figure.lines.map((line, at) => (
                  <Text key={at} style={styles.note}>
                    {line}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}
      </View>
      {section.tables.map(({ captions, sheet }, index) => {
        // The total sits in the column it names, else in the last plain money column (excel.ts).
        const totalColumn = sheet.total
          ? (sheet.total.column ??
              Math.max(
                1,
                ...sheet.rows.flatMap((cells) =>
                  cells.flatMap((cell, at) => (cell.kind === "money" ? [at + 1] : [])),
                ),
              )) - 1
          : -1;
        return (
          <View key={index} style={styles.table}>
            <View wrap={false} minPresenceAhead={30}>
              {captions.map((line, at) => (
                <Text key={at} style={at === 0 ? styles.caption : styles.captionLine}>
                  {line}
                </Text>
              ))}
              <View style={[styles.row, styles.head]}>
                {sheet.columns.map((column, at) => (
                  <Text
                    key={at}
                    style={[
                      styles.cell,
                      at === 0 ? styles.first : {},
                      isNumber(sheet.rows[0]?.[at]) ? styles.number : {},
                    ]}
                  >
                    {column}
                  </Text>
                ))}
              </View>
            </View>
            {sheet.rows.length === 0 && <Text style={styles.note}>{report.emptyLine}</Text>}
            {sheet.rows.map((cells, rowAt) => (
              <View key={rowAt} style={styles.row} wrap={false}>
                {cells.map((cell, at) => (
                  <Text
                    key={at}
                    style={[
                      styles.cell,
                      at === 0 ? styles.first : {},
                      isNumber(cell) ? styles.number : {},
                    ]}
                  >
                    {cellText(cell, format)}
                  </Text>
                ))}
              </View>
            ))}
            {sheet.total && (
              <View style={[styles.row, styles.strong]} wrap={false}>
                {sheet.columns.map((_, at) => (
                  <Text
                    key={at}
                    style={[
                      styles.cell,
                      at === 0 ? styles.first : {},
                      at === totalColumn ? styles.number : {},
                    ]}
                  >
                    {at === 0 && totalColumn !== 0
                      ? sheet.total!.label
                      : at === totalColumn
                        ? format.money(sheet.total!.amount)
                        : ""}
                  </Text>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function ReportPdf({ report, logoSrc }: { report: AnalyticsReport; logoSrc: Buffer }) {
  return (
    <Document title={report.title} language={report.locale}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Letterhead logoSrc={logoSrc} title={report.title} captions={report.captions} />
        {report.sections.map((section, index) => (
          <Section key={index} section={section} report={report} />
        ))}
        <Text
          style={letterhead.footer}
          fixed
          render={({ pageNumber, totalPages }) => report.pageLine(pageNumber, totalPages)}
        />
      </Page>
    </Document>
  );
}

/** The PDF of the Analytics page, as bytes. */
export async function writeAnalyticsPdf(report: AnalyticsReport): Promise<Uint8Array<ArrayBuffer>> {
  registerFonts();
  const logoSrc = await logoPng();
  return new Uint8Array(await renderToBuffer(<ReportPdf report={report} logoSrc={logoSrc} />));
}
