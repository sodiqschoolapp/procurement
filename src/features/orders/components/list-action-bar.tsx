"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";
import { PAYMENT_TYPES } from "@/domain/payment-types";
import type { WireTickedSummary } from "@/features/orders/list-wire";
import { useFormatters } from "@/i18n/use-formatters";

// The action bar of the order list (11-screens-and-ux.md, Order list layout 4: "fixed at the
// bottom when something is ticked: the count and totals of the ticked orders, and only the
// actions this user can take on all of them now"; 05, the totals under the list). The numbers
// are tickedSummary() of the server: ordersTotals() of src/domain/order-totals.ts. The actions
// come from allowedActions() of the state machine; a button is shown only for a move that has a
// server action, and no move of the list has one before 2.10 (plan of 2.8, decided item 7, Look
// first). White panel with a top border, no shadow (design system "What we never do" 8); on a
// phone the count and the grand total, "Show details" opens the rest (as the drafts' totals).

export function ListActionBar({
  summary,
  tickedCount,
  matching,
  onClear,
}: {
  /** The server's answer for the ticks shown; null while it is read. */
  summary: WireTickedSummary | null;
  tickedCount: number;
  /** After "Select all on this filter": how many orders matched (decided item 6). */
  matching: number | null;
  onClear: () => void;
}) {
  const t = useTranslations("orders.list.bar");
  const tTotals = useTranslations("orders.totals");
  const tPayment = useTranslations("paymentTypes");
  const format = useFormatters();
  const [details, setDetails] = useState(false);

  const line = (key: string, label: string, amount: string, strong = false, folded = false) => (
    <div
      key={key}
      data-total={key}
      className={cn("flex items-baseline justify-between gap-4", folded && "max-sm:hidden")}
    >
      <dt className={strong ? "font-bold" : "text-muted-foreground"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-bold" : ""}`}>
        {format.money(BigInt(amount))}
      </dd>
    </div>
  );

  return (
    <section
      aria-labelledby="list-bar-title"
      aria-live="polite"
      aria-busy={summary === null}
      data-list-bar
      className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border-t border-border bg-card p-4 max-sm:bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="list-bar-title"
          className="flex flex-wrap items-baseline gap-x-3 text-[17px] leading-6 font-bold"
        >
          {t("title")}
          <span className="text-[15px] font-normal text-muted-foreground" data-ticked-count>
            {matching !== null && matching > tickedCount
              ? t("countOf", { count: tickedCount, matching })
              : t("count", { count: tickedCount })}
          </span>
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          {t("clear")}
        </Button>
      </div>
      {summary && (
        <div className="grid gap-x-12 gap-y-4 sm:grid-cols-2">
          <dl className="flex flex-col gap-1 text-[15px] leading-[22px]">
            {line("goods", tTotals("goods"), summary.totals.goods, false, !details)}
            {line("extras", tTotals("extras"), summary.totals.extras, false, !details)}
            {line("grand", tTotals("grand"), summary.totals.grand, true)}
          </dl>
          <dl
            id="list-bar-split"
            className={cn(
              "flex flex-col gap-1 text-[15px] leading-[22px]",
              !details && "max-sm:hidden",
            )}
          >
            {PAYMENT_TYPES.map((type) =>
              line(type, tPayment(type), summary.totals.byPaymentType[type]),
            )}
          </dl>
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={details}
        aria-controls="list-bar-split"
        onClick={() => setDetails((shown) => !shown)}
        className="self-start sm:hidden"
      >
        {tTotals(details ? "hideDetails" : "showDetails")}
      </Button>
    </section>
  );
}
