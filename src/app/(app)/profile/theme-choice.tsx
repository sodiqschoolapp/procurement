"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import {
  THEME_KEY,
  THEMES,
  type Theme,
  applyTheme,
  readTheme,
  subscribeToRoot,
} from "@/components/theme";
import { Segmented } from "@/components/ui/segmented";

// The theme (11-screens-and-ux.md rule 15: "the theme follows the device until the user chooses
// one"; docs/design-system.md, Colour): Like my device, Light, Dark, kept in the browser.
/** The kept choice; "device" when storage is blocked. */
function storedTheme(): Theme {
  try {
    return readTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "device";
  }
}

export function ThemeChoice() {
  const t = useTranslations();
  const value = useSyncExternalStore(subscribeToRoot, storedTheme, () => "device" as const);

  const words: Record<Theme, string> = {
    device: t("theme.device"),
    light: t("theme.light"),
    dark: t("theme.dark"),
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{t("profile.theme")}</p>
      <Segmented
        label={t("profile.theme")}
        value={value}
        options={THEMES.map((theme) => ({ value: theme, label: words[theme] }))}
        className="w-full sm:w-auto sm:self-start"
        onValueChange={applyTheme}
      />
    </div>
  );
}
