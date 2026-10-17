import { getTranslations } from "next-intl/server";

import { Icon } from "@/components/icon";
import { cn } from "@/components/utils";
import { getFormatters } from "@/i18n/get-formatters";

import type { OrderMoney } from "../queries/order-money";
import { CancelMoneyButton } from "./cancel-money-button";

// The Money tab of the order page (11-screens-and-ux.md, Order page layout 3; 08-money-and-
// settlement.md, Money ledger; plan of 4.3): the order's cash count with what it means, and every
// money row of the order, newest first, a cancelled action's row crossed out with who, when and
// the reason. Every number comes from getOrderMoney(), which reads the domain functions; this
// screen adds nothing up (.claude/rules/ui.md). Cancel where the server offers it, full width on a
// phone; Record money is on the order page's action bar. On a phone each row is a card; from sm on a row of three columns.

export async function MoneyTab({ money }: { money: OrderMoney }) {
  const t = await getTranslations("money.tab");
  const tKinds = await getTranslations("money.kinds");
  const format = await getFormatters();
  const count = money.count;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <dl data-cash-count={count.toString()} className="flex flex-col gap-0.5">
          <dt className="text-[13px] leading-[18px] text-muted-foreground">{t("count")}</dt>
          <dd className="text-[22px] leading-7 font-bold tabular-nums">{format.money(count)}</dd>
          <dd className="text-[15px] leading-[22px]">
            {count > 0n
              ? t("holds", { amount: format.money(count) })
              : count < 0n
                ? t("owed", { amount: format.money(-count) })
                : t("settled")}
          </dd>
        </dl>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="money-rows">
        <h3 id="money-rows" className="text-[17px] leading-6 font-bold">
          {t("rows")}
        </h3>
        {money.rows.length === 0 ? (
          <p className="text-[15px] leading-[22px] text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {money.rows.map((row) => (
              <li
                key={row.actionId}
                data-money-action={row.actionId}
                data-cancelled={row.isCancelled ? "" : undefined}
                className="grid grid-cols-1 gap-x-6 gap-y-2 py-3 sm:grid-cols-[minmax(7rem,auto)_1fr_auto]"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {t("date")}
                  </span>
                  <span className="text-[15px] leading-[22px]">{format.date(row.occurredOn)}</span>
                  {row.isCancelled ? (
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted-foreground">
                      <Icon name="cancel" size={16} />
                      {t("cancelled")}
                    </span>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "flex flex-col gap-1 text-[15px] leading-[22px]",
                    row.isCancelled && "text-muted-foreground line-through",
                  )}
                >
                  <span data-money-kind={row.kind} className="font-semibold">
                    {tKinds(row.kind)}
                  </span>
                  {row.documentNo ? (
                    <span className="text-[13px] leading-[18px]">
                      {t("documentNo", { text: row.documentNo })}
                    </span>
                  ) : null}
                  {row.comment ? (
                    <span className="text-[13px] leading-[18px]">{row.comment}</span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1 sm:items-end">
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      row.isCancelled && "text-muted-foreground line-through",
                    )}
                  >
                    {format.money(row.amount)}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {t("byLine", {
                      name: row.recordedBy,
                      date: format.date(row.recordedAt),
                      time: format.time(row.recordedAt),
                    })}
                  </span>
                  {row.file ? (
                    <a
                      href={`/files/${row.file.id}/${row.file.isImage ? "large" : "original"}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center text-[13px] leading-[18px] font-semibold underline underline-offset-2 sm:min-h-0"
                    >
                      {t("file")}
                    </a>
                  ) : null}
                  {row.isCancelled && row.cancelledAt ? (
                    <span className="text-[13px] leading-[18px]">
                      {t("cancelLine", {
                        name: row.cancelledBy ?? "",
                        date: format.date(row.cancelledAt),
                        time: format.time(row.cancelledAt),
                        text: row.cancelReason ?? "",
                      })}
                    </span>
                  ) : null}
                  {row.cancel ? (
                    <span className="mt-1 flex w-full sm:w-auto sm:justify-end">
                      <CancelMoneyButton
                        moneyActionId={row.actionId}
                        orders={row.cancel.orders}
                        total={row.cancel.total.toString()}
                      />
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
