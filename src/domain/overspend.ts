// The overspend guard (08-money-and-settlement.md, Overspend guard; 02-assumptions.md A10; plan
// of 4.1, decided item 5, Look first). The guard's test is made in whole numbers, never on a
// rounded percent; the percent shown is decimal text from the `Exact` clone of ./order-totals.ts,
// one decimal, half up (developer-rules.md rule 6).

import { Exact } from "./order-totals";
import { difference } from "./purchases";
import { GUARD_OFF, type SettingValues } from "./settings";

/** The two settings as they are stored (./settings.ts). */
export type GuardSettings = Pick<
  SettingValues,
  "overspend_guard_percent" | "overspend_guard_min_amount"
>;

export type Overspend = {
  /** Actual total − planned total when above 0, else 0. */
  over: bigint;
  /** over ÷ planned × 100 with one decimal ("5.8"), or null when nothing is over or planned is 0. */
  percent: string | null;
  /** The Head must click "Acknowledge overspend" before Finance can close. */
  needsHead: boolean;
};

/**
 * 08 Overspend guard: the Head is needed when the actual total is above the planned total by more
 * than the percent **and** by more than the amount. With the percent at 0 only the amount counts,
 * with the amount at 0 only the percent, with both at 0 every overspend; "off" never. Both totals
 * come from `orderTotal()` and `actualTotal()`; over is −`difference()`.
 */
export function overspend(planned: bigint, actual: bigint, guard: GuardSettings): Overspend {
  const left = difference(planned, actual);
  const over = left < 0n ? -left : 0n;
  if (over === 0n) return { over, percent: null, needsHead: false };
  const percent =
    planned > 0n
      ? new Exact(over.toString())
          .times(100)
          .dividedBy(planned.toString())
          .toDecimalPlaces(1, Exact.ROUND_HALF_UP)
          .toFixed(1)
      : null;
  const setting = guard.overspend_guard_percent;
  if (setting === GUARD_OFF) return { over, percent, needsHead: false };
  const abovePercent = over * 100n > BigInt(setting) * planned;
  const aboveAmount = over > guard.overspend_guard_min_amount;
  return { over, percent, needsHead: abovePercent && aboveAmount };
}
