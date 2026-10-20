import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/icon";

// Finance's entries on its home (11-screens-and-ux.md, Interface per role: Finance, "approvals and
// settlements with the exact amount to give or receive. Each one opens the order list filtered to
// those orders, ready to tick"; plan of 6.2, decided item 3, Look first): one row per owner and
// branch, the whole row a link to the order list of exactly those orders. Every amount is the
// server's, already written as text by the caller.

export type OwnerEntry = {
  key: string;
  ownerName: string;
  branchCode: string;
  href: string;
  /** "3 orders, total 1 200 000". */
  line: string;
  /** "Give 600 000 in cash", "Receive 50 000 from the Manager". */
  amount: ReactNode;
};

export function OwnerEntries({
  entries,
  limit = 5,
}: {
  entries: readonly OwnerEntry[];
  limit?: number;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {entries.slice(0, limit).map((entry) => (
        <li key={entry.key} data-home-entry={entry.key}>
          <Link
            href={entry.href}
            className="flex min-h-11 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold">
                {entry.ownerName}{" "}
                <span className="text-small font-normal text-muted-foreground">
                  {entry.branchCode}
                </span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{entry.line}</span>
              <span className="text-sm font-semibold tabular-nums">{entry.amount}</span>
            </span>
            <Icon name="chevron_right" size={20} className="shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
