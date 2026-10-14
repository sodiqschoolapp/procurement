import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, LOCALES, chooseLocale, isLocale } from "./locale";

// 02-assumptions.md A2: "Uzbek (Latin), Russian and English. Each user picks one; Uzbek is the
// default." 14-data-model.md: users.locale [uz|ru|en].
describe("the language of a request (02-assumptions.md A2)", () => {
  it("knows exactly the three languages of the data model, Uzbek the default", () => {
    expect(LOCALES).toEqual(["uz", "ru", "en"]);
    expect(DEFAULT_LOCALE).toBe("uz");
  });

  it("is Uzbek when nobody chose one", () => {
    expect(chooseLocale({})).toBe("uz");
  });

  it("follows the cookie before sign-in", () => {
    expect(chooseLocale({ cookieLocale: "ru" })).toBe("ru");
    expect(chooseLocale({ cookieLocale: "en" })).toBe("en");
  });

  it("follows the signed-in user's locale before the cookie", () => {
    expect(chooseLocale({ userLocale: "en", cookieLocale: "ru" })).toBe("en");
  });

  it("ignores a cookie that is not one of the three codes", () => {
    expect(chooseLocale({ cookieLocale: "de" })).toBe("uz");
    expect(chooseLocale({ cookieLocale: "RU" })).toBe("uz");
    expect(chooseLocale({ cookieLocale: "" })).toBe("uz");
  });

  it("falls back to the cookie when the user's locale is not one of the three", () => {
    expect(chooseLocale({ userLocale: "de", cookieLocale: "ru" })).toBe("ru");
  });

  it("accepts only the exact codes", () => {
    expect(isLocale("uz")).toBe(true);
    expect(isLocale("uz-Latn")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
