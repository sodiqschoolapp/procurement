"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { toast } from "@/components/toast";
import { Segmented } from "@/components/ui/segmented";
import { useAction } from "@/components/use-action";
import { LOCALES, type Locale } from "@/i18n/locale";

import { chooseOwnLanguageAction } from "./actions";

// The person's language (A2), each language by its own name. Saved at once: the control dims
// while it saves (11 rule 4); success re-renders the page and the menu in the new language, the
// change itself being the message; an error goes to a toast and the old choice comes back.
export function LanguageChoice({ current }: { current: Locale }) {
  const t = useTranslations();
  const router = useRouter();
  const action = useAction(chooseOwnLanguageAction);
  const [value, setValue] = useState<Locale>(current);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{t("profile.language")}</p>
      <Segmented
        label={t("profile.language")}
        value={value}
        options={LOCALES.map((locale) => ({ value: locale, label: t(`languages.${locale}`) }))}
        pending={action.pending}
        className="w-full sm:w-auto sm:self-start"
        onValueChange={async (chosen) => {
          const before = value;
          setValue(chosen);
          const result = await action.run({ locale: chosen });
          if (!result) return;
          if (result.ok) {
            router.refresh();
            return;
          }
          setValue(before);
          toast.error(t(result.error.messageKey));
        }}
      />
    </div>
  );
}
