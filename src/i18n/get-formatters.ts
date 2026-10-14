import { getLocale, getTranslations } from "next-intl/server";

import { bindFormatters, type Formatters } from "./format";

// The four formats of 11-screens-and-ux.md rule 10 for async server code: an async page, a PDF,
// an export. Components use ./use-formatters.ts; the rules are in ./format.ts.
export async function getFormatters(): Promise<Formatters> {
  const t = await getTranslations("format");
  return bindFormatters(await getLocale(), t("currency"));
}
