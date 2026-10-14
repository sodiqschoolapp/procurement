import type messages from "./messages/uz.json";
import type { Locale } from "./locale";

// A key that is not in the message files, or a language that is not one of the three, is a
// typecheck error (11-screens-and-ux.md rule 14). uz.json is the reference; the translation
// check (scripts/check-translations.mjs) keeps ru.json and en.json the same shape.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
