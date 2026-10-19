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

type CountTranslate = (
  key: "change.countUp" | "change.countDown" | "change.same" | "change.countUpFromNothing",
  values?: Record<string, string>,
) => string;

/** A count's change, in orders (plan of 6.4, decided item 7): the same sentences, no so'm. */
export function countChangeText(change: Change, t: CountTranslate, format: Formatters): string {
  const { difference, percent } = change;
  if (difference === 0n) return t("change.same");
  const count = format.quantity((difference < 0n ? -difference : difference).toString());
  if (percent === null) return t("change.countUpFromNothing", { count });
  const size = percent.replace(/^-/, "");
  return difference < 0n
    ? t("change.countDown", { count, percent: size })
    : t("change.countUp", { count, percent: size });
}

type ShareTranslate = (
  key: "change.shareUp" | "change.shareDown" | "change.shareSame" | "change.shareNone",
  values?: Record<string, string>,
) => string;

/** A share's change in percentage points, from shareChange() (plan of 6.4, decided item 7). */
export function shareChangeText(
  points: string | null,
  t: ShareTranslate,
  format: Formatters,
): string {
  if (points === null) return t("change.shareNone");
  if (/^-?0(\.0)?$/.test(points)) return t("change.shareSame");
  const size = format.quantity(points.replace(/^-/, ""));
  return points.startsWith("-")
    ? t("change.shareDown", { points: size })
    : t("change.shareUp", { points: size });
}

type HoursTranslate = (
  key: "change.hoursUp" | "change.hoursDown" | "change.hoursSame" | "change.hoursNone",
  values?: Record<string, string>,
) => string;

/** An average's change in hours, the difference of two one-decimal averages (plan of 6.4b, decided item 7). */
export function hoursChangeText(
  hours: string | null,
  t: HoursTranslate,
  format: Formatters,
): string {
  if (hours === null) return t("change.hoursNone");
  if (/^-?0(\.0)?$/.test(hours)) return t("change.hoursSame");
  const size = format.quantity(hours.replace(/^-/, ""));
  return hours.startsWith("-")
    ? t("change.hoursDown", { hours: size })
    : t("change.hoursUp", { hours: size });
}

type AmountTranslate = (
  key: "change.amountUp" | "change.amountDown" | "change.same" | "change.amountNone",
  values?: Record<string, string>,
) => string;

/**
 * The change of a signed average in so'm only, no percent: a percent of a negative number reads
 * backwards (plan of 6.4c, decided item 3, Look first; review of the plan, Should fix 1); `null`
 * when either period has no amount.
 */
export function amountChangeText(
  difference: bigint | null,
  t: AmountTranslate,
  format: Formatters,
): string {
  if (difference === null) return t("change.amountNone");
  if (difference === 0n) return t("change.same");
  const amount = format.money(difference < 0n ? -difference : difference);
  return difference < 0n ? t("change.amountDown", { amount }) : t("change.amountUp", { amount });
}

type DaysTranslate = (
  key: "change.daysUp" | "change.daysDown" | "change.daysSame" | "change.daysNone",
  values?: Record<string, string>,
) => string;

/** An average's change in days, the difference of two one-decimal averages (plan of 6.6b, decided item 3). */
export function daysChangeText(days: string | null, t: DaysTranslate, format: Formatters): string {
  if (days === null) return t("change.daysNone");
  if (/^-?0(\.0)?$/.test(days)) return t("change.daysSame");
  const size = format.quantity(days.replace(/^-/, ""));
  return days.startsWith("-")
    ? t("change.daysDown", { days: size })
    : t("change.daysUp", { days: size });
}
