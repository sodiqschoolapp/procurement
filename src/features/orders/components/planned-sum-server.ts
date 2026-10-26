import { getTranslations } from "next-intl/server";

import { getFormatters } from "@/i18n/get-formatters";

import { type PlannedSum, type Words, plannedSumOf } from "./planned-sum";

/** `usePlannedSum()` of ./planned-sum.ts for an async page (08 Numbers; plan of 2.5d-b). */
export async function getPlannedSum(): Promise<PlannedSum> {
  const t = await getTranslations("orders.unpriced");
  return plannedSumOf(t as Words, (await getFormatters()).money);
}
