import { useLocale, useTranslations } from "next-intl";

import { bindFormatters, type Formatters } from "./format";

// The four formats of 11-screens-and-ux.md rule 10, bound to the language of the request and
// the unit word of its message file, for a component that renders on the server or in the
// browser. A screen calls `money(amount)`, `date(d)`, `time(t)`, `quantity(q)`; the rules are
// in ./format.ts. Async server code uses ./get-formatters.ts (next-intl/server is server-only).
export function useFormatters(): Formatters {
  const t = useTranslations("format");
  return bindFormatters(useLocale(), t("currency"));
}
