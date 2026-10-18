import { daysOf } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import { today } from "@/server/clock";

// The days an order's cash has been out on the clock's Tashkent day (08 Money with managers, "the
// date since when"; plan of 6.4c, "held for"; plan of 6.6a, decided item 3, Look first): daysOf()
// counts both ends, so the same day is 0 days. One reading for "held for" and the age bands.

export function daysOut(since: BusinessDate): number {
  return daysOf({ first: since, last: today() }) - 1;
}
