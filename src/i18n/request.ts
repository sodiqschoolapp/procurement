import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { LOCALE_COOKIE, chooseLocale } from "./locale";

// next-intl without i18n routing: no language in the address (task 0.5). The language comes
// from the cookie, else Uzbek; task 0.6 passes the signed-in user's `locale` in as well.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = chooseLocale({ cookieLocale: cookieStore.get(LOCALE_COOKIE)?.value });

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
