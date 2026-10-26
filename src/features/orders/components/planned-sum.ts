"use client";

import { useTranslations } from "next-intl";

import { useFormatters } from "@/i18n/use-formatters";

// A planned sum as a screen shows it (08-money-and-settlement.md, Numbers the system calculates:
// an order without a planned price is "left out of planned sums, and a sum that leaves orders out
// says how many"; plan of 2.5d-b). The sum and the count come from `ordersTotals()` on the server;
// this only words them: "45 000 so'm · 1 without a price", or "No planned price" when no order of
// the set has one.

export type PlannedSum = (grand: bigint | string, unpriced: number, count?: number) => string;

/**
 * The words of a planned sum. `count` is how many orders the sum covers; when every one of them
 * is without a planned price the sum reads "No planned price".
 */
export function usePlannedSum(): PlannedSum {
  const t = useTranslations("orders.unpriced");
  const format = useFormatters();
  return (grand, unpriced, count) => {
    if (count !== undefined && count > 0 && unpriced >= count) return t("none");
    const total = format.money(typeof grand === "string" ? BigInt(grand) : grand);
    if (unpriced === 0) return total;
    return t("sum", { total, unpriced: t("count", { count: unpriced }) });
  };
}

/** One order's planned money: the amount, or "No planned price" (08 Numbers). */
export function usePlannedMoney(): (amount: bigint | string | null) => string {
  const t = useTranslations("orders.unpriced");
  const format = useFormatters();
  return (amount) =>
    amount === null ? t("none") : format.money(typeof amount === "string" ? BigInt(amount) : amount);
}
