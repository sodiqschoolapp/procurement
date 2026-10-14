"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { LOCALES, type Locale } from "@/i18n/locale";

import { chooseLanguageAction } from "./actions";

// The language of the sign-in page (A2), kept in the `locale` cookie (decisions 0.5 item 1).
export function LanguageSelect({ current }: { current: Locale }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-2">
      <label htmlFor="language" className="text-sm text-muted-foreground">
        {t("login.language")}
      </label>
      <select
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
        className="h-11 rounded-lg border border-input bg-background px-2 text-sm"
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {t(`languages.${locale}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
