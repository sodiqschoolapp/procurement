import type { Change } from "@/domain/analytics";
import type { Formatters } from "@/i18n/format";

// A number's change against the period before, written (10-notifications-analytics-reports.md,
// Analytics page per role, point 1; plan of 6.3, decided items 4 and 16). The sign and the percent
// come from changeAgainst() of src/domain/analytics.ts; this only picks the sentence.

type Translate = (
  key: "change.up" | "change.down" | "change.same" | "change.upFromNothing",
  values?: Record<string, string>,
) => string;

export function changeText(change: Change, t: Translate, format: Formatters): string {
  const { difference, percent } = change;
  if (difference === 0n) return t("change.same");
  const amount = format.money(difference < 0n ? -difference : difference);
  if (percent === null) return t("change.upFromNothing", { amount });
  const size = percent.replace(/^-/, "");
  return difference < 0n
    ? t("change.down", { amount, percent: size })
    : t("change.up", { amount, percent: size });
}
