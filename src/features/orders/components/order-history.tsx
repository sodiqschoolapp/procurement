import { getTranslations } from "next-intl/server";

import type { OrderPageEvent } from "@/features/orders/queries/order-page";
import { getFormatters } from "@/i18n/get-formatters";

// The History tab of the order page (06-approval-workflow.md rule 11: "Every move is logged per
// order with the user, the time and the comment … A move made in one action with other orders
// says so"). Newest first. "With N other orders" counts only the orders of the action this user
// may see, and is left out when there are none (plan of 2.9, decided item 1, Look first).

export async function OrderHistory({ events }: { events: readonly OrderPageEvent[] }) {
  const t = await getTranslations("orders.page.history");
  const format = await getFormatters();
  if (events.length === 0) {
    return <p className="text-[15px] leading-[22px] text-muted-foreground">{t("empty")}</p>;
  }
  return (
    <ol className="flex flex-col divide-y divide-border">
      {events.map((event) => {
        const move =
          event.type === "APPROVE" &&
          (event.from === "PENDING_HEAD" ||
            event.from === "PENDING_PRINCIPAL" ||
            event.from === "PENDING_FINANCE")
            ? t(`approved.${event.from}`)
            : t(`moves.${event.type}`);
        return (
          <li key={event.id} data-event={event.type} className="flex flex-col gap-1 py-3">
            <p className="text-[15px] leading-[22px]">
              <span className="font-semibold">{t("by", { move, name: event.actorName })}</span>
              {event.othersSeen > 0 ? (
                <span data-with-others className="ml-1">
                  {t("withOthers", { count: event.othersSeen })}
                </span>
              ) : null}
            </p>
            <p className="flex flex-wrap gap-x-3 text-[13px] leading-[18px] text-muted-foreground">
              <time dateTime={event.at.toISOString()}>
                {t("at", { date: format.date(event.at), time: format.time(event.at) })}
              </time>
              {event.headStepAuto ? <span data-created-by-head>{t("createdByHead")}</span> : null}
            </p>
            {event.comment ? (
              <p className="text-[15px] leading-[22px]">{t("reason", { text: event.comment })}</p>
            ) : null}
            {event.note ? (
              <p className="text-[15px] leading-[22px]">{t("note", { text: event.note })}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
