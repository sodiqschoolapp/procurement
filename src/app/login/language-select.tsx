"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Select } from "@/components/ui/select";
import { LOCALES, type Locale } from "@/i18n/locale";

import { chooseLanguageAction } from "./actions";

// The language of the sign-in page (A2), kept in the `locale` cookie (decisions 0.5 item 1).
// Its label is read by screen readers; the select shows the language's own name.
export function LanguageSelect({ current }: { current: Locale }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <label htmlFor="language" className="sr-only">
        {t("login.language")}
      </label>
      <Select
        id="language"
        value={current}
        disabled={pending}
        onChange={(event) => {
          const chosen = event.target.value;
          startTransition(async () => {
            await chooseLanguageAction(chosen);
            router.refresh();
          });
        }}
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {t(`languages.${locale}`)}
          </option>
        ))}
      </Select>
    </div>
  );
}
