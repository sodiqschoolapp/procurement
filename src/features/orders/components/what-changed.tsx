import { getTranslations } from "next-intl/server";

import { Icon } from "@/components/icon";
import type { RevisionField } from "@/domain/revision-changes";
import type { OrderPageChange } from "@/features/orders/queries/order-page";
import { getFormatters } from "@/i18n/get-formatters";

// "What changed" on a re-submitted order (06-approval-workflow.md rule 5: "approvers see the
// changed fields highlighted, with old and new values side by side"; 15 S5: the Head sees
// "100 → 80" highlighted; plan of 2.11, decided item 3, Look first). The changes are
// revisionChanges() of src/domain/revision-changes.ts, read by the page's query; this part only
// formats them: the old value muted and struck through, the new one in the warning tint.

const MONEY_FIELDS: ReadonlySet<RevisionField> = new Set(["price"]);

export async function WhatChanged({
  since,
  changes,
  unit,
}: {
  /** The revision compared with: the one before the current. */
  since: number;
  changes: readonly OrderPageChange[];
  /** The measure's short name, beside a quantity. */
  unit: string | null;
}) {
  const t = await getTranslations("orders.page.changes");
  const tDetails = await getTranslations("orders.page.details");
  const tPayment = await getTranslations("paymentTypes");
  const format = await getFormatters();

  function shown(change: OrderPageChange, value: string | null): string {
    if (value === null) return t("none");
    if (change.kind !== "field") return format.money(BigInt(value));
    if (change.field === "quantity") return `${format.quantity(value)} ${unit ?? ""}`.trim();
    if (MONEY_FIELDS.has(change.field)) return format.money(BigInt(value));
    if (change.field === "neededBy") return format.date(value as `${number}-${number}-${number}`);
    if (change.field === "paymentType") return tPayment(value as "CASH");
    if (change.field === "priority") return tDetails(value === "URGENT" ? "urgent" : "normal");
    if (change.field === "referencePhotoFileId") return t("photoChanged");
    return value;
  }

  function label(change: OrderPageChange): string {
    if (change.kind === "extra") return t("extra", { type: change.typeName });
    if (change.kind === "total") return t("total");
    return t(`fields.${change.field}`);
  }

  return (
    <section
      aria-labelledby="what-changed-title"
      data-what-changed
      className="rounded-xl border border-warning bg-card p-4 sm:p-5"
    >
      <h2 id="what-changed-title" className="flex items-center gap-2 text-subheading font-semibold">
        <Icon name="edit" className="size-5 text-warning" aria-hidden />
        {t("title", { revision: since })}
      </h2>
      <dl className="mt-3 flex flex-col gap-3">
        {changes.map((change, index) => (
          <div
            key={index}
            data-change={change.kind === "field" ? change.field : change.kind}
            className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4"
          >
            <dt className="text-small text-muted-foreground sm:w-48 sm:shrink-0">
              {label(change)}
            </dt>
            <dd className="flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
              <span className="sr-only">{t("before")}</span>
              <del data-old className="text-muted-foreground">
                {shown(change, change.from)}
              </del>
              <span aria-hidden>{t("arrow")}</span>
              <span className="sr-only">{t("now")}</span>
              <ins
                data-new
                className="rounded bg-warning-bg px-1 font-semibold text-foreground no-underline"
              >
                {shown(change, change.to)}
              </ins>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
