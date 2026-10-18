import { type Change, changeAgainst } from "@/domain/analytics";

// An Analytics amount with its change against the period before (10-notifications-analytics-
// reports.md, Analytics page per role, point 1; plan of 6.3, decided item 4), from the two sums a
// query read as text: never a JavaScript number (CLAUDE.md rule 6).

export type Counted = { amount: bigint; change: Change };

export function counted(now: string, before: string): Counted {
  const amount = BigInt(now);
  return { amount, change: changeAgainst(amount, BigInt(before)) };
}
