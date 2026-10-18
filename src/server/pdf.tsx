import path from "node:path";

import { Font, Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import sharp from "sharp";

// The parts every PDF of the app shares (docs/design-system.md, Printouts and PDFs; plan of 2.14;
// plan of 5.4, decided item 11): Golos Text from the committed TTF files, the on-dark logo as a
// PNG, the colours, and the letterhead strip at the top of each page. The order list download
// (src/features/orders/download/pdf.tsx) and the issue note (src/features/warehouse/download/
// issue-note.tsx) draw their own tables under it.
//
// Golos Text comes from the committed TTF files of src/features/orders/download/fonts (decisions
// 2.14, item 9: static 400 and 600, tabular figures frozen as the default digits, U+02BB mapped to
// the glyph of U+2018); the two keep distinct PostScript names, or react-pdf embeds one font copy
// per text run (progress 2.14). The fonts and the logo are made once per server process.

const FONTS = path.join(process.cwd(), "src/features/orders/download/fonts");
const LOGO = path.join(process.cwd(), "public/brand/sodiq-logo-horizontal-on-dark.svg");

export const NAVY = "#06113C";
export const ORANGE = "#FF8A32";
export const MUTED = "#4A5270";
export const BORDER = "#DBDBDB";
export const HEADER_FILL = "#F6F6F6";

let registered = false;
export function registerFonts() {
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
export function logoPng(): Promise<Buffer> {
  logo ??= sharp(LOGO, { density: 300 }).png().toBuffer();
  return logo;
}

/** The letterhead's styles; a page leaves `paddingTop` room for it. */
export const letterhead = StyleSheet.create({
  top: { position: "absolute", top: 0, left: 0, right: 0 },
  strip: { flexDirection: "row", height: 30 },
  tab: {
    width: 190,
    backgroundColor: NAVY,
    borderTopRightRadius: 12,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  logo: { height: 16, width: 100 },
  band: { flexGrow: 1, height: 6, marginTop: 24, backgroundColor: ORANGE },
  heading: { paddingHorizontal: 20, paddingTop: 8, gap: 2 },
  title: { fontSize: 13, fontWeight: 600 },
  caption: { fontSize: 9, color: MUTED },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 20,
    right: 20,
    fontSize: 9,
    color: MUTED,
    textAlign: "right",
  },
});

/** The strip with the logo and the orange band, then the title and its caption lines; on every page. */
export function Letterhead({
  logoSrc,
  title,
  captions,
}: {
  logoSrc: Buffer;
  title: string;
  captions: readonly string[];
}) {
  return (
    <View style={letterhead.top} fixed>
      <View style={letterhead.strip}>
        <View style={letterhead.tab}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt. */}
          <Image src={logoSrc} style={letterhead.logo} />
        </View>
        <View style={letterhead.band} />
      </View>
      <View style={letterhead.heading}>
        <Text style={letterhead.title}>{title}</Text>
        {captions.map((caption, index) => (
          <Text key={index} style={letterhead.caption}>
            {caption}
          </Text>
        ))}
      </View>
    </View>
  );
}
