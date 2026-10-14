"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { applyTheme } from "@/components/theme";
import { Button } from "@/components/ui/button";

// The theme button of the sign-in page (docs/design-system.md, Sign-in; plan of 0.10a, decision
// 3): a toggle between light and dark, kept in the browser. Until the person chooses, the
// device decides; the three-way choice with "Like my device" is on /profile (0.10b).

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isDarkNow(): boolean {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "dark" || chosen === "light") return chosen === "dark";
  return window.matchMedia(DARK_QUERY).matches;
}

export function ThemeButton() {
  const t = useTranslations("theme");
  // Unknown on the server: the kept choice and the device are read in the browser.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const update = () => setDark(isDarkNow());
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      icon={dark ? "light_mode" : "dark_mode"}
      aria-label={t("dark")}
      aria-pressed={dark ?? false}
      onClick={() => {
        const next = !isDarkNow();
        applyTheme(next ? "dark" : "light");
        setDark(next);
      }}
    />
  );
}
