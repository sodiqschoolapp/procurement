"use client";

import { useTranslations } from "next-intl";
import { Fragment, type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/utils";

import { PAYMENT_TYPES } from "@/domain/payment-types";
import { type TickedDraft, tickedDraftsTotals } from "@/domain/drafts";
import { useFormatters } from "@/i18n/use-formatters";

// The totals of the ticked drafts, under the grid (05-order-request-form.md, Order: "Under the
// list, the totals of the ticked orders: goods, extra costs, grand total, and the grand total
// split by payment type"; 11 Order list layout 4: the count with the totals; plan of 2.5b, decided
// item 1, Look first; review of the plan, Must fix 2 and correction 4). The numbers are
// tickedDraftsTotals() of src/domain/drafts.ts on the rows as the server last answered them; this
// component only shows them.
//
// Plan of 2.6 (11 rule 2: "The totals of the ticked drafts stay visible"; decided item 6): the
// panel sticks to the bottom of the window while drafts are ticked, above the tab bar on a phone.
// On a phone it shows the count and the grand total; "Show details" opens goods, extra costs and
// the split.
//
// Owner's report of 23.10.2026 ("When I tick them, submit is not appearing"): the actions on the
// ticked drafts (Apply to ticked, Submit, Clear) stood above the grid, out of sight once a card
// further down was ticked. They are in this panel now, so it is the selection bar of 11 Order
// list layout 4 ("fixed at the bottom when something is ticked: the count and totals of the
// ticked orders, and only the actions this user can take on all of them now") and of the design
// system, laid out as the order list's bar: the count, the grand total, Submit and Clear on one
// line; goods, extra costs, the split and the needed-by date under a hairline, behind "Show
// details" on a phone, so the bar stays low and never hides the next card's tick box.

export function TickedTotals({
  drafts,
  onPage = false,
  actions,
  tools,
}: {
  drafts: readonly TickedDraft[];
  /**
   * Nothing is ticked: the totals are of the rows on the page shown, and say so (11 rule 2: "The
   * total of the sheet stays visible"; plan of 2.5c, decided item 7, Look first).
   */
  onPage?: boolean;
  /** Submit and Clear, beside the count: always in sight. */
  actions?: ReactNode;
  /** Apply a needed-by date: with the details, behind "Show details" on a phone. */
  tools?: ReactNode;
}) {
  const t = useTranslations("orders.totals");
  const tPayment = useTranslations("paymentTypes");
  const format = useFormatters();
  const [details, setDetails] = useState(false);
  if (drafts.length === 0) return null;
  const { count, totals, withoutPrice } = tickedDraftsTotals(drafts);

  const line = (key: string, label: string, amount: bigint) => (
    <div key={key} data-total={key} className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{format.money(amount)}</dd>
    </div>
  );

  return (
    <section
      aria-labelledby="ticked-totals-title"
      aria-live="polite"
      data-ticked-totals
      className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-xl border border-border-strong bg-card p-3 shadow-float max-sm:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="ticked-totals-title" className="text-subheading font-semibold">
            <span className="sr-only">{t(onPage ? "pageTitle" : "title")} </span>
            {t(onPage ? "pageCount" : "count", { count })}
          </h2>
          <dl>
            <div data-total="grand" className="flex items-baseline gap-1.5 text-sm">
              <dt className="text-muted-foreground">{t("grand")}</dt>
              <dd className="text-subheading font-semibold tabular-nums">
                {format.money(totals.grand)}
              </dd>
            </div>
          </dl>
        </div>
        {actions && (
          <div data-ticked-actions className="flex flex-wrap items-center gap-2 max-sm:w-full">
            {actions}
          </div>
        )}
      </div>
      <div
        id="ticked-totals-split"
        className={cn(
          "flex flex-col gap-3 border-t border-border pt-3 text-sm lg:flex-row lg:items-start lg:gap-12",
          !details && "max-sm:hidden",
        )}
      >
        <div className="grid gap-x-12 gap-y-1 sm:grid-cols-2 lg:flex-1">
          <dl className="flex flex-col gap-1">
            {line("goods", t("goods"), totals.goods)}
            {line("extras", t("extras"), totals.extras)}
          </dl>
          <dl className="flex flex-col gap-1">
            {PAYMENT_TYPES.map((type) => (
              <Fragment key={type}>
                {line(type, tPayment(type), totals.byPaymentType[type])}
              </Fragment>
            ))}
          </dl>
        </div>
        {withoutPrice > 0 && (
          <p className="text-muted-foreground lg:order-last lg:max-w-48">
            {t("withoutPrice", { count: withoutPrice })}
          </p>
        )}
        {tools}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={details}
        aria-controls="ticked-totals-split"
        onClick={() => setDetails((open) => !open)}
        className="self-start sm:hidden"
      >
        {t(details ? "hideDetails" : "showDetails")}
      </Button>
    </section>
  );
}
