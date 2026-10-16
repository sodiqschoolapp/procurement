import path from "node:path";

import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import sharp from "sharp";

import { APPROVAL_STEPS } from "@/domain/order-download";

import {
  DOWNLOAD_COLUMNS,
  type DownloadColumn,
  type DownloadLine,
  type DownloadSheet,
} from "./columns";

// The order list as a plain PDF (05-order-request-form.md, Download 2: "A4 landscape, fonts for
// Uzbek and Russian built in, the filters used and who downloaded it and when on every page, no
// signature lines"; 13 "Excel and PDF": @react-pdf/renderer; plan of 2.14). The look is
// docs/design-system.md, Printouts and PDFs: the letterhead strip at the top of each page, Golos
// Text, navy text, no other colour but the grey word of a Rejected or Cancelled status (plan
// review, correction 3). Every value is a text of the shared table (columns.ts): nothing is
// computed here.
//
// Golos Text comes from the committed TTF files of ./fonts (decided item 9; the commands that made
// them are in docs/decisions.md, 2.14): static 400 and 600, tabular figures frozen as the default
// digits, U+02BB mapped to the glyph of U+2018. The fonts and the logo are made once per server
// process.

const FONTS = path.join(process.cwd(), "src/features/orders/download/fonts");
const LOGO = path.join(process.cwd(), "public/brand/sodiq-logo-horizontal-on-dark.svg");

const NAVY = "#06113C";
const ORANGE = "#FF8A32";
const MUTED = "#4A5270";
const BORDER = "#DBDBDB";
const HEADER_FILL = "#F6F6F6";

let registered = false;
function registerFonts() {
  if (registered) return;
  Font.register({
    family: "Golos Text",
    fonts: [
      { src: path.join(FONTS, "GolosText-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONTS, "GolosText-SemiBold.ttf"), fontWeight: 600 },
    ],
  });
  // A long name or word breaks where it must, never with a hyphen added in another language.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

let logo: Promise<Buffer> | null = null;
/** The on-dark one-line logo as a PNG: react-pdf draws PNG and JPEG, not SVG files. */
function logoPng(): Promise<Buffer> {
  logo ??= sharp(LOGO, { density: 300 }).png().toBuffer();
  return logo;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Golos Text",
    fontSize: 7.5,
    color: NAVY,
    paddingTop: 92,
    paddingBottom: 36,
    paddingHorizontal: 28,
  },
  top: { position: "absolute", top: 0, left: 0, right: 0 },
  strip: { flexDirection: "row", height: 30 },
  tab: {
    width: 190,
    backgroundColor: NAVY,
    borderTopRightRadius: 12,
    paddingHorizontal: 28,
    justifyContent: "center",
  },
  logo: { height: 16, width: 100 },
  band: { flexGrow: 1, height: 6, marginTop: 24, backgroundColor: ORANGE },
  heading: { paddingHorizontal: 28, paddingTop: 8, gap: 2 },
  title: { fontSize: 13, fontWeight: 600 },
  caption: { fontSize: 9, color: MUTED },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 9,
    color: MUTED,
    textAlign: "right",
  },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER },
  head: { backgroundColor: HEADER_FILL, fontWeight: 600 },
  cell: { paddingVertical: 3, paddingHorizontal: 3 },
  number: { textAlign: "right" },
  muted: { color: MUTED },
  totals: { marginTop: 10, marginLeft: "auto", width: 240, gap: 2 },
  totalLine: { flexDirection: "row", justifyContent: "space-between" },
  strong: { fontWeight: 600 },
});

/** The width of each column, in parts of the page's width. */
const WIDTHS: Record<DownloadColumn, number> = {
  number: 7.5,
  status: 7,
  branch: 3.5,
  owner: 7,
  department: 7,
  product: 9,
  subtype: 6,
  quantity: 4.5,
  measure: 3.5,
  price: 6,
  extras: 5.5,
  paymentType: 6,
  plannedTotal: 6.5,
};
const STEP_WIDTH = 7;
const NUMBER_COLUMNS = new Set<DownloadColumn>(["quantity", "price", "extras", "plannedTotal"]);
/** The statuses printed in grey (design-system.md, This app, Printouts). */
const GREY_STATUSES = new Set(["REJECTED", "CANCELLED"]);

const width = (parts: number) => `${parts}%`;

function cellText(sheet: DownloadSheet, line: DownloadLine, column: DownloadColumn): string {
  switch (column) {
    case "number":
      return line.number;
    case "status":
      return line.statusWord;
    case "quantity":
      return sheet.formatQuantity(line.quantity);
    case "price":
    case "extras":
    case "plannedTotal":
      return sheet.formatMoney(line[column]);
    default:
      return line[column];
  }
}

function OrdersPdf({ sheet, logoSrc }: { sheet: DownloadSheet; logoSrc: Buffer }) {
  return (
    <Document title={sheet.title} language={sheet.locale}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.top} fixed>
          <View style={styles.strip}>
            <View style={styles.tab}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt. */}
              <Image src={logoSrc} style={styles.logo} />
            </View>
            <View style={styles.band} />
          </View>
          <View style={styles.heading}>
            <Text style={styles.title}>
              {sheet.schoolName ? `${sheet.schoolName} · ${sheet.title}` : sheet.title}
            </Text>
            <Text style={styles.caption}>{sheet.filtersLine}</Text>
            <Text style={styles.caption}>{sheet.downloadedLine}</Text>
          </View>
        </View>

        <View style={[styles.row, styles.head]} fixed>
          {DOWNLOAD_COLUMNS.map((column) => (
            <Text
              key={column}
              style={[
                styles.cell,
                { width: width(WIDTHS[column]) },
                NUMBER_COLUMNS.has(column) ? styles.number : {},
              ]}
            >
              {sheet.titles[column]}
            </Text>
          ))}
          {APPROVAL_STEPS.map((step) => (
            <Text key={step} style={[styles.cell, { width: width(STEP_WIDTH) }]}>
              {sheet.stepTitles[step].name}
            </Text>
          ))}
        </View>

        {sheet.lines.map((line, index) => (
          <View key={index} style={styles.row} wrap={false}>
            {DOWNLOAD_COLUMNS.map((column) => (
              <Text
                key={column}
                style={[
                  styles.cell,
                  { width: width(WIDTHS[column]) },
                  NUMBER_COLUMNS.has(column) ? styles.number : {},
                  column === "status" && GREY_STATUSES.has(line.status) ? styles.muted : {},
                ]}
              >
                {cellText(sheet, line, column)}
              </Text>
            ))}
            {APPROVAL_STEPS.map((step) => (
              <View key={step} style={[styles.cell, { width: width(STEP_WIDTH) }]}>
                <Text>{line.steps[step].name}</Text>
                <Text style={styles.muted}>{line.steps[step].at}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.totals} wrap={false}>
          <Text style={styles.strong}>{sheet.totalsTitle}</Text>
          {sheet.totals.map((total) => (
            <View
              key={total.key}
              style={[styles.totalLine, total.key === "grand" ? styles.strong : {}]}
            >
              <Text>{total.label}</Text>
              <Text>{sheet.formatMoney(total.amount)}</Text>
            </View>
          ))}
        </View>

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => sheet.pageLine(pageNumber, totalPages)}
        />
      </Page>
    </Document>
  );
}

/** The PDF of a download, as bytes. */
export async function writeOrdersPdf(sheet: DownloadSheet): Promise<Uint8Array<ArrayBuffer>> {
  registerFonts();
  const logoSrc = await logoPng();
  return new Uint8Array(await renderToBuffer(<OrdersPdf sheet={sheet} logoSrc={logoSrc} />));
}
