import { useTranslations } from "next-intl";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { RowLinks } from "@/components/row-links";
import { RequestStatusLabel } from "@/components/status-label";
import type { WireOrderGroup } from "@/features/orders/list-wire";
import { useFormatters } from "@/i18n/use-formatters";
import { usePlannedSum } from "@/features/orders/components/planned-sum";

// The group rows of a home list (05-order-request-form.md, Group rows 1: product and subtype, the
// total quantity, the total planned amount, how many orders, the earliest needed-by, "Urgent",
// the price hint; plan of 6.1). At most `limit` rows; the block's link opens the rest. Every number
// is the server's (groupSummary(), and the open rows' progress); nothing is added up here. A row
// opens its order, or with several orders the block's list, where the row stands (redesign of
// 22.10.2026: a row with one destination is that destination).

export const HOME_GROUP_LIMIT = 5;

export function GroupLines({
  groups,
  listHref,
  progress,
  limit = HOME_GROUP_LIMIT,
}: {
  groups: readonly WireOrderGroup[];
  /** The order list the block's own link opens: a row of several orders opens it too. */
  listHref: string;
  /** The open rows' received quantity and finished orders, by group key (07 Order progress). */
  progress?: Record<string, { received: string; finished: number }>;
  limit?: number;
}) {
  const t = useTranslations("home");
  const tList = useTranslations("orders.list");
  const tOrders = useTranslations("orders");
  const format = useFormatters();
  const plannedSum = usePlannedSum();

  return (
    <RowLinks>
      <ul className="flex flex-col divide-y divide-border">
        {groups.slice(0, limit).map((group) => {
          const product = group.subtypeName
            ? `${group.productName}, ${group.subtypeName}`
            : group.productName;
          const done = progress?.[group.key];
          return (
            <li
              key={group.key}
              data-home-group={group.key}
              data-row
              className="-mx-2 flex flex-col gap-1 rounded-md px-2 py-3 transition-colors duration-120 ease-out hover:bg-accent/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-semibold">
                  <Link
                    href={group.orders.length === 1 ? `/orders/${group.orders[0]!.id}` : listHref}
                    data-row-link
                    className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {product}
                  </Link>{" "}
                  <span className="text-small font-normal text-muted-foreground">
                    {group.branchCode}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {plannedSum(
                    group.summary.totals.grand,
                    group.summary.totals.unpriced,
                    group.orders.length,
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <RequestStatusLabel status={group.status} />
                <span className="tabular-nums">
                  {format.quantity(group.summary.quantity)} {group.unitShortName}
                </span>
                <span>{t("orders", { count: group.summary.count })}</span>
                <span className="tabular-nums">
                  {/* No order of the group has a needed-by date (05 Fields the Head sets 3). */}
                  {group.summary.earliestNeededBy !== null &&
                    t("principal.card.neededBy", {
                      date: format.date(group.summary.earliestNeededBy),
                    })}
                </span>
                {group.summary.urgent && (
                  <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                    <Icon name="warning" size={16} />
                    {tList("urgent")}
                  </span>
                )}
                {group.summary.overdue && (
                  <span className="inline-flex items-center gap-1 font-semibold text-warning">
                    <Icon name="schedule" size={16} />
                    {tOrders("overdue")}
                  </span>
                )}
              </div>
              {done && (
                <div data-home-progress className="flex flex-wrap gap-x-3 text-xs tabular-nums">
                  <span>
                    {t("manager.open.progress", {
                      received: format.quantity(done.received),
                      planned: format.quantity(group.summary.quantity),
                      unit: group.unitShortName,
                    })}
                  </span>
                  <span className="text-muted-foreground">
                    {t("manager.open.finished", {
                      finished: done.finished,
                      count: group.summary.count,
                    })}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </RowLinks>
  );
}
