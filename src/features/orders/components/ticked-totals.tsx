"use client";

import { useTranslations } from "next-intl";

import { PAYMENT_TYPES } from "@/domain/payment-types";
import { type TickedDraft, tickedDraftsTotals } from "@/domain/drafts";
import { useFormatters } from "@/i18n/use-formatters";

// The totals of the ticked drafts, under the grid (05-order-request-form.md, Order: "Under the
// list, the totals of the ticked orders: goods, extra costs, grand total, and the grand total
// split by payment type"; 11 Order list layout 4: the count with the totals; plan of 2.5b, decided
// item 1, Look first; review of the plan, Must fix 2 and correction 4). The numbers are
// tickedDraftsTotals() of src/domain/drafts.ts on the rows as the server last answered them; this
// component only shows them.

export function TickedTotals({ drafts }: { drafts: readonly TickedDraft[] }) {
  const t = useTranslations("orders.totals");
  const tPayment = useTranslations("paymentTypes");
  const format = useFormatters();
  if (drafts.length === 0) return null;
  const { count, totals, withoutPrice } = tickedDraftsTotals(drafts);

  const line = (key: string, label: string, amount: bigint, strong = false) => (
    <div data-total={key} className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-bold" : "text-muted-foreground"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-bold" : ""}`}>{format.money(amount)}</dd>
    </div>
  );

  return (
    <section
      aria-labelledby="ticked-totals-title"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl bg-card p-4 sm:p-6"
    >
      <h2
        id="ticked-totals-title"
        className="flex flex-wrap items-baseline gap-x-3 text-[17px] leading-6 font-bold"
      >
        {t("title")}
        <span className="text-[15px] font-normal text-muted-foreground">
          {t("count", { count })}
        </span>
      </h2>
      <div className="grid gap-x-12 gap-y-4 sm:grid-cols-2">
        <dl className="flex flex-col gap-1 text-[15px] leading-[22px]">
          {line("goods", t("goods"), totals.goods)}
          {line("extras", t("extras"), totals.extras)}
          {line("grand", t("grand"), totals.grand, true)}
        </dl>
        <dl className="flex flex-col gap-1 text-[15px] leading-[22px]">
          {PAYMENT_TYPES.map((type) => (
            <div key={type}>{line(type, tPayment(type), totals.byPaymentType[type])}</div>
          ))}
        </dl>
      </div>
      {withoutPrice > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("withoutPrice", { count: withoutPrice })}
        </p>
      )}
    </section>
  );
}
