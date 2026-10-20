"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { ColourLabels } from "@/components/status-label";
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
// server action (plan of 2.8, decided item 7, Look first): Approve from 2.10, Send back, Reject,
// Cancel and Take back from 2.11, which the list
// passes in as `actions`. The selection bar of docs/design-system.md (Parts): it floats at the
// bottom of the list with the count, the grand total and the actions; the colours, goods, extra
// costs and the split by payment type follow under a hairline, behind "Show details" on a phone.

export function ListActionBar({
  summary,
  tickedCount,
  matching,
  onClear,
  actions,
}: {
  /** The buttons of the moves the server allows on every ticked order. */
  actions?: ReactNode;
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

  const line = (key: string, label: string, amount: string) => (
    <div key={key} data-total={key} className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{format.money(BigInt(amount))}</dd>
    </div>
  );

  return (
    <section
      aria-labelledby="list-bar-title"
      aria-live="polite"
      aria-busy={summary === null}
      data-list-bar
      className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-xl border border-border-strong bg-card p-3 shadow-float max-sm:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 id="list-bar-title" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="sr-only">{t("title")}</span>
          <span className="text-subheading" data-ticked-count>
            {matching !== null && matching > tickedCount
              ? t("countOf", { count: tickedCount, matching })
              : t("count", { count: tickedCount })}
          </span>
          {summary && (
            <span data-total="grand" className="flex items-baseline gap-1.5 text-sm">
              <span className="text-muted-foreground">{tTotals("grand")}</span>
              <span className="text-subheading tabular-nums">
                {format.money(BigInt(summary.totals.grand))}
              </span>
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          {actions}
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            {t("clear")}
          </Button>
        </div>
      </div>
      {summary && (
        <div
          id="list-bar-split"
          className={cn(
            "flex flex-col gap-2 border-t border-border pt-3 text-small",
            !details && "max-sm:hidden",
          )}
        >
          {/* 08 The three colours of the ticked orders, from Open on (plan of 3.8). */}
          {summary.colours && <ColourLabels colours={summary.colours} />}
          {/* 07 Finishing: how many of the ticked finished orders match exactly (plan of 4.4). */}
          {summary.exactCount !== null && (
            <p data-exact-count className="text-muted-foreground">
              {t("exact", { exact: summary.exactCount, count: summary.count })}
            </p>
          )}
          <dl className="flex flex-wrap gap-x-5 gap-y-1">
            {line("goods", tTotals("goods"), summary.totals.goods)}
            {line("extras", tTotals("extras"), summary.totals.extras)}
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
