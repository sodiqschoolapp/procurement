"use client";

import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";

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
// panel sticks to the bottom of the window while drafts are ticked, above the tab bar on a phone
// (white panel with a top border, no shadow: design system "What we never do" 8). On a phone it
// shows the count and the grand total; "Show details" opens goods, extra costs and the split.

export function TickedTotals({ drafts }: { drafts: readonly TickedDraft[] }) {
  const t = useTranslations("orders.totals");
  const tPayment = useTranslations("paymentTypes");
  const format = useFormatters();
  const [details, setDetails] = useState(false);
  if (drafts.length === 0) return null;
  const { count, totals, withoutPrice } = tickedDraftsTotals(drafts);

  const line = (key: string, label: string, amount: bigint, strong = false, folded = false) => (
    <div
      data-total={key}
      className={cn("flex items-baseline justify-between gap-4", folded && "max-sm:hidden")}
    >
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{format.money(amount)}</dd>
    </div>
  );

  return (
    <section
      aria-labelledby="ticked-totals-title"
      aria-live="polite"
      data-ticked-totals
      className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border-t border-border bg-card p-4 max-sm:bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:p-6"
    >
      <h2
        id="ticked-totals-title"
        className="flex flex-wrap items-baseline gap-x-3 text-subheading font-semibold"
      >
        {t("title")}
        <span className="text-sm font-normal text-muted-foreground">
          {t("count", { count })}
        </span>
      </h2>
      <div className="grid gap-x-12 gap-y-4 sm:grid-cols-2">
        <dl className="flex flex-col gap-1 text-sm">
          {line("goods", t("goods"), totals.goods, false, !details)}
          {line("extras", t("extras"), totals.extras, false, !details)}
          {line("grand", t("grand"), totals.grand, true)}
        </dl>
        <dl
          id="ticked-totals-split"
          className={cn(
            "flex flex-col gap-1 text-sm",
            !details && "max-sm:hidden",
          )}
        >
          {PAYMENT_TYPES.map((type) => (
            <Fragment key={type}>{line(type, tPayment(type), totals.byPaymentType[type])}</Fragment>
          ))}
        </dl>
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
      {withoutPrice > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("withoutPrice", { count: withoutPrice })}
        </p>
      )}
    </section>
  );
}
