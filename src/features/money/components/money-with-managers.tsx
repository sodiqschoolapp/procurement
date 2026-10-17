import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { RequestStatusLabel } from "@/components/status-label";
import { getFormatters } from "@/i18n/get-formatters";

import type { MoneyWithManagersBlock } from "../queries/money-with-managers";

// The page Money with managers (08-money-and-settlement.md, Money with managers; 11-screens-and-
// ux.md, Screens; plan of 4.9): one block per owner with what he holds and what he is owed, two
// numbers never netted, and the date since when, oldest first; each block opens (a native
// disclosure, marked with `expand_more`) to the orders behind it, each a link to its page. Every
// number comes from getMoneyWithManagers(), which reads the domain; this screen adds nothing up
// (.claude/rules/ui.md). On a phone a block and its orders are stacked cards; from sm on, rows.

export async function MoneyWithManagers({ blocks }: { blocks: MoneyWithManagersBlock[] }) {
  const t = await getTranslations("money.managers");
  const format = await getFormatters();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-[-0.01em]">{t("title")}</h1>
        <p className="text-[15px] leading-[22px] text-muted-foreground">{t("line")}</p>
      </div>
      {blocks.length === 0 ? (
        <EmptyState title={t("empty.title")} line={t("empty.line")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {blocks.map((block) => (
            <li key={block.ownerId} data-owner={block.ownerId} className="rounded-xl bg-card">
              <details className="group">
                <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 p-4 sm:grid-cols-[minmax(10rem,1fr)_repeat(3,minmax(8rem,auto))_auto] sm:px-6 [&::-webkit-details-marker]:hidden">
                  <span className="flex flex-col">
                    <span className="text-[17px] leading-6 font-bold">{block.ownerName}</span>
                    {block.ownerIsActive ? null : (
                      <span className="text-[13px] leading-[18px] text-muted-foreground">
                        {t("inactive")}
                      </span>
                    )}
                  </span>
                  <Icon
                    name="expand_more"
                    size={24}
                    className="order-last transition-transform group-open:rotate-180 sm:order-none sm:col-start-5 sm:row-start-1"
                  />
                  <Figure label={t("holds")} value={format.money(block.held)} data="held" />
                  <Figure label={t("owed")} value={format.money(block.owed)} data="owed" />
                  <Figure label={t("since")} value={format.date(block.since)} data="since" />
                </summary>
                <ul className="flex flex-col divide-y divide-border border-t border-border px-4 sm:px-6">
                  {block.orders.map((order) => (
                    <li
                      key={order.id}
                      data-order={order.id}
                      className="grid grid-cols-1 gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(9rem,auto)_1fr_auto_auto] sm:items-center"
                    >
                      <Link
                        href={`/orders/${order.id}`}
                        className="inline-flex min-h-11 items-center font-semibold tabular-nums underline underline-offset-2 sm:min-h-0"
                      >
                        {order.number}
                      </Link>
                      <span className="text-[15px] leading-[22px]">
                        {order.branchCode} ·{" "}
                        {order.subtypeName
                          ? t("product", { product: order.productName, subtype: order.subtypeName })
                          : order.productName}
                      </span>
                      <RequestStatusLabel status={order.status} />
                      <span className="flex flex-col sm:items-end">
                        <span className="font-semibold tabular-nums">
                          {order.cashCount > 0n
                            ? t("orderHolds", { amount: format.money(order.cashCount) })
                            : t("orderOwed", { amount: format.money(-order.cashCount) })}
                        </span>
                        <span className="text-[13px] leading-[18px] text-muted-foreground">
                          {t("orderSince", { date: format.date(order.since) })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({ label, value, data }: { label: string; value: string; data: string }) {
  return (
    <span
      data-figure={data}
      className="col-span-2 flex justify-between gap-3 sm:col-span-1 sm:flex-col sm:justify-start"
    >
      <span className="text-[13px] leading-[18px] text-muted-foreground">{label}</span>
      <span className="text-[15px] leading-[22px] font-semibold tabular-nums">{value}</span>
    </span>
  );
}
