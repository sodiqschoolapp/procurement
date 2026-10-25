import { getTranslations } from "next-intl/server";

import { skippedFinanceBy } from "@/domain/order-steps";
import type { OrderPageEvent } from "@/features/orders/queries/order-page";
import { getFormatters } from "@/i18n/get-formatters";

// The History tab of the order page (06-approval-workflow.md rule 11: "Every move is logged per
// order with the user, the time and the comment … A move made in one action with other orders
// says so"). Newest first. "With N other orders" counts only the orders of the action this user
// may see, and is left out when there are none (plan of 2.9, decided item 1, Look first).

export async function OrderHistory({ events }: { events: readonly OrderPageEvent[] }) {
  const t = await getTranslations("orders.page.history");
  const tPayment = await getTranslations("paymentTypes");
  const tProgress = await getTranslations("orders.progress");
  const format = await getFormatters();
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
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
            <p className="text-sm">
              <span className="font-semibold">{t("by", { move, name: event.actorName })}</span>
              {event.othersSeen > 0 ? (
                <span data-with-others className="ml-1">
                  {t("withOthers", { count: event.othersSeen })}
                </span>
              ) : null}
            </p>
            <p className="flex flex-wrap gap-x-3 text-small text-muted-foreground">
              <time dateTime={event.at.toISOString()}>
                {t("at", { date: format.date(event.at), time: format.time(event.at) })}
              </time>
              {event.headStepAuto ? <span data-created-by-head>{t("createdByHead")}</span> : null}
              {skippedFinanceBy(event) ? (
                // 06 Finance step switched off 1 and rule 11 (plan of 4.10c).
                <span data-skipped-finance>{t("financeSkipped")}</span>
              ) : null}
            </p>
            {event.paymentType ? (
              // Finance's change of the payment type while approving (06 rules 1 and 11).
              <p data-payment-change className="text-sm">
                {t("paymentType", {
                  from: tPayment(event.paymentType.from),
                  to: tPayment(event.paymentType.to),
                })}
              </p>
            ) : null}
            {event.purchase ? (
              // The record a Record purchase saved (07 What saving a record does 6; plan of 3.3).
              <p data-purchase className="text-sm tabular-nums">
                {t("purchase", {
                  qty: format.quantity(event.purchase.qty),
                  price: format.money(BigInt(event.purchase.unitPrice)),
                })}
              </p>
            ) : null}
            {event.issue ? (
              // The issue a ticked "Give straight to requester" made (07; plan of 5.4).
              <p data-issue className="text-sm">
                {t.rich("issue", {
                  number: event.issue.number,
                  note: (chunks) => (
                    <a
                      href={`/warehouse/documents/${event.issue!.documentId}/note`}
                      download
                      className="font-semibold text-link underline underline-offset-2"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            ) : null}
            {event.progress ? (
              // The progress a buying action set (07 Order progress; plan of 3.5).
              <p data-progress-change className="text-sm">
                {t("progress", {
                  from: tProgress(event.progress.from),
                  to: tProgress(event.progress.to),
                })}
              </p>
            ) : null}
            {event.owner ? (
              // A move to another Manager (03 rule 7; plan of 4.10).
              <p data-owner-change className="text-sm">
                {t("owner", { from: event.owner.from, to: event.owner.to })}
              </p>
            ) : null}
            {event.comment ? (
              <p className="text-sm">{t("reason", { text: event.comment })}</p>
            ) : null}
            {event.note ? <p className="text-sm">{t("note", { text: event.note })}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
