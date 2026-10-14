import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { getCurrentUser } from "@/server/auth/session";

import { LOCALE_COOKIE, chooseLocale } from "./locale";

// next-intl without i18n routing: no language in the address (task 0.5). The signed-in user's
// `locale` comes first, read from the server session only (progress, "For 0.6"); then the
// cookie the sign-in page writes; else Uzbek.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const user = await getCurrentUser();
  const locale = chooseLocale({
    userLocale: user?.locale,
    cookieLocale: cookieStore.get(LOCALE_COOKIE)?.value,
  });

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
