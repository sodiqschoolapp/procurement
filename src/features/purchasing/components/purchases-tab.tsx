import { getTranslations } from "next-intl/server";

import { Icon } from "@/components/icon";
import { ProgressLabel } from "@/components/status-label";
import { cn } from "@/components/utils";
import type { OrderPage } from "@/features/orders/queries/order-page";
import { getFormatters } from "@/i18n/get-formatters";

// The Purchases tab of the order page (11-screens-and-ux.md, Order page layout 3; 07-purchasing.md,
// Purchase record and Order progress; plan of 3.5): the progress with its reason, received of
// planned (red with an icon and a word when more than planned was bought), the actual numbers and
// every record, newest first, a cancelled one crossed out. Every number comes from getOrderPage(),
// which reads the domain functions; this screen adds nothing up (.claude/rules/ui.md). On a phone
// each record is a card; from sm on a table.

export async function PurchasesTab({ order }: { order: OrderPage }) {
  const t = await getTranslations("orders.page.purchases");
  const tPayment = await getTranslations("paymentTypes");
  const format = await getFormatters();
  const unit = order.unitShortName ?? "";
  const actual = order.actual;

  const fact = (key: string, label: string, value: React.ReactNode) => (
    <div key={key} data-fact={key} className="flex flex-col gap-0.5">
      <dt className="text-[13px] leading-[18px] text-muted-foreground">{label}</dt>
      <dd className="text-[15px] leading-[22px] break-words">{value}</dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {fact(
          "progress",
          t("progress"),
          <span className="flex flex-col items-start gap-1">
            <ProgressLabel progress={order.progress} />
            {order.finishReason ? (
              <span data-finish-reason className="text-[13px] leading-[18px]">
                {t("finishReason", { text: order.finishReason })}
              </span>
            ) : null}
          </span>,
        )}
        {fact(
          "received",
          t(order.isService ? "used" : "received"),
          <span
            data-over-plan={order.overPlan ? "" : undefined}
            className={cn(
              "inline-flex items-center gap-1 tabular-nums",
              order.overPlan && "font-semibold text-destructive",
            )}
          >
            {order.overPlan ? <Icon name="warning" size={16} /> : null}
            {t("receivedOf", {
              received: format.quantity(order.received ?? "0"),
              planned: format.quantity(order.quantity ?? "0"),
              unit,
            })}
            {order.overPlan ? <span>{t("overPlan")}</span> : null}
          </span>,
        )}
        {actual
          ? [
              fact(
                "goods",
                t("goods"),
                <span className="tabular-nums">{format.money(actual.goods)}</span>,
              ),
              fact(
                "actualExtras",
                t("extras"),
                <span className="tabular-nums">{format.money(actual.extras)}</span>,
              ),
              fact(
                "total",
                t("total"),
                <span className="font-semibold tabular-nums">{format.money(actual.total)}</span>,
              ),
              fact(
                "difference",
                t("difference"),
                <span data-difference={actual.difference.toString()} className="tabular-nums">
                  {format.money(actual.difference)}
                </span>,
              ),
            ]
          : null}
      </dl>

      <section className="flex flex-col gap-3" aria-labelledby="purchase-records">
        <h3 id="purchase-records" className="text-[17px] leading-6 font-bold">
          {t("records")}
        </h3>
        {order.purchases.length === 0 ? (
          <p className="text-[15px] leading-[22px] text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {order.purchases.map((record) => (
              <li
                key={record.id}
                data-purchase-record={record.id}
                data-cancelled={record.isCancelled ? "" : undefined}
                className="grid grid-cols-1 gap-x-6 gap-y-2 py-3 sm:grid-cols-[minmax(7rem,auto)_1fr_auto]"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {t("date")}
                  </span>
                  <span className="text-[15px] leading-[22px]">
                    {format.date(record.purchasedOn)}
                  </span>
                  {record.isCancelled ? (
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground">
                      <Icon name="cancel" size={16} />
                      {t("cancelled")}
                    </span>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "flex flex-col gap-1 text-[15px] leading-[22px]",
                    record.isCancelled && "text-muted-foreground line-through",
                  )}
                >
                  <span className="tabular-nums">
                    {t("line", {
                      qty: `${format.quantity(record.qty)} ${unit}`.trim(),
                      price: format.money(record.unitPrice),
                    })}
                  </span>
                  {record.boughtSubtypeName ? (
                    <span data-bought-subtype className="text-[13px] leading-[18px]">
                      {t("bought", { subtype: record.boughtSubtypeName })}
                    </span>
                  ) : null}
                  {record.extras.map((extra, index) => (
                    <span key={index} className="text-[13px] leading-[18px] tabular-nums">
                      {t("extraLine", {
                        type: extra.typeName,
                        amount: format.money(extra.amount),
                        payment: tPayment(extra.paymentType),
                      })}
                    </span>
                  ))}
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {t("tripLine", {
                      payment: tPayment(record.paymentType),
                      supplier: record.supplierName ?? t("none"),
                    })}
                  </span>
                  {record.comment ? (
                    <span className="text-[13px] leading-[18px]">{record.comment}</span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1 sm:items-end">
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      record.isCancelled && "text-muted-foreground line-through",
                    )}
                  >
                    {format.money(record.goods)}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {t("byLine", {
                      name: record.recordedBy,
                      date: format.date(record.recordedAt),
                      time: format.time(record.recordedAt),
                    })}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-[13px] leading-[18px]">
                    {record.receipts.length === 0
                      ? t("noReceipt")
                      : record.receipts.map((file, index) => (
                          <a
                            key={file.fileId}
                            href={`/files/${file.fileId}/${file.isImage ? "large" : "original"}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2 sm:min-h-0"
                          >
                            {t("receipt", { n: index + 1 })}
                          </a>
                        ))}
                  </span>
                  {record.cancelReason ? (
                    <span className="text-[13px] leading-[18px]">
                      {t("cancelReason", { text: record.cancelReason })}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
