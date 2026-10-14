// The language of the interface (02-assumptions.md A2): "Each user picks one; Uzbek is the
// default." No language is written in the address; the choice is read on the server.

export const LOCALES = ["uz", "ru", "en"] as const;

/** One of the three languages, as the `locale` enum of `14-data-model.md` writes them. */
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "uz";

/** The cookie that keeps the language chosen before sign-in (decisions 0.5 item 1). */
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The language of a request: the signed-in user's `locale` first, then the cookie, then Uzbek.
 * Anything that is not exactly one of the three codes is ignored. The browser's
 * `Accept-Language` is not a choice the user made, so it is never read (decisions 0.5 item 1).
 */
export function chooseLocale(choice: { userLocale?: unknown; cookieLocale?: unknown }): Locale {
  if (isLocale(choice.userLocale)) return choice.userLocale;
  if (isLocale(choice.cookieLocale)) return choice.cookieLocale;
  return DEFAULT_LOCALE;
}
