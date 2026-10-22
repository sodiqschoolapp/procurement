import { getTranslations } from "next-intl/server";

import { Icon, type IconName } from "@/components/icon";
import { ColourLabel } from "@/components/status-label";
import { cn } from "@/components/utils";
import type { OrderColours, OrderLabel, PlanVsActual } from "@/domain/colours";
import { getFormatters } from "@/i18n/get-formatters";

// The order page's Plan and actual table (redesign of 22.10.2026): quantity, price per unit, extra
// costs and total, each with its plan, what was bought, the difference and what that difference
// did to the total. The numbers are planVsActual() of src/domain/colours.ts and the colours
// orderColours()'s (08 The three colours); this only draws them. The last column adds up to the
// Total's difference, so the reader sees why a cheaper price can still end over the plan. While
// buying is Open, Quantity and Total stay grey "In progress" (08 bullet 1). A phone shows one
// card per line (design system, Panels and lists).

const ICON = {
  green: "check_circle",
  amber: "warning",
  red: "error",
  grey: "schedule",
} as const satisfies Record<string, IconName>;

const TEXT = {
  green: "text-success",
  amber: "text-warning",
  red: "text-destructive",
  grey: "text-muted-foreground",
} as const;

type Look = OrderLabel<unknown>["colour"];

function Coloured({ colour, children }: { colour: Look; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", TEXT[colour])}>
      <Icon name={ICON[colour]} size={16} />
      <span>{children}</span>
    </span>
  );
}

export async function PlanActualTable({
  table,
  colours,
  unit,
}: {
  table: PlanVsActual;
  colours: OrderColours;
  unit: string;
}) {
  const t = await getTranslations("orders.page.planActual");
  const format = await getFormatters();
  const quantity = (value: string) => `${format.quantity(value)} ${unit}`.trim();
  const magnitude = (amount: bigint) => (amount < 0n ? -amount : amount);
  // An effect is planned − actual (08 Difference): below 0 more was spent, above 0 less.
  const effect = (amount: bigint, shown: boolean) =>
    !shown || amount === 0n
      ? t("none")
      : t(amount < 0n ? "spentMore" : "spentLess", { amount: format.money(magnitude(amount)) });

  const counting = colours.total.colour !== "grey";

  const quantityDifference =
    colours.number.colour === "grey" ? (
      <Coloured colour="grey">{t("inProgress")}</Coloured>
    ) : colours.number.colour === "green" ? (
      <Coloured colour="green">{t("asPlanned")}</Coloured>
    ) : (
      <Coloured colour={colours.number.colour}>
        {t(colours.number.colour === "red" ? "more" : "fewer", {
          amount: quantity(colours.number.difference.replace(/^-/, "")),
        })}
      </Coloured>
    );

  const { planned: plannedPrice, actual: actualPrice, oneUnitPrice } = table.unitPrice;
  const perUnit = magnitude(actualPrice - plannedPrice);
  const priceDifference =
    colours.price.colour === "grey" ? (
      <Coloured colour="grey">{t("inProgress")}</Coloured>
    ) : colours.price.colour === "green" ? (
      <Coloured colour="green">{t("asPlanned")}</Coloured>
    ) : (
      <Coloured colour={colours.price.colour}>
        {perUnit === 0n
          ? t("sameOnAverage")
          : t(colours.price.colour === "red" ? "dearerEach" : "cheaperEach", {
              amount: format.money(perUnit),
            })}
      </Coloured>
    );

  const extrasDifference = table.extras.planned - table.extras.actual;

  // Extra costs neither planned nor bought are not shown (a field with nothing in it, 21.10.2026).
  const hasExtras = table.extras.planned !== 0n || table.extras.actual !== 0n;
  const rows: {
    key: string;
    name: string;
    planned: string;
    actual: string;
    difference: React.ReactNode;
    effect: string;
  }[] = [
    {
      key: "quantity",
      name: t("quantity"),
      planned: quantity(table.quantity.planned),
      actual: quantity(table.quantity.actual),
      difference: quantityDifference,
      effect: effect(table.effects.quantity, colours.number.colour !== "grey"),
    },
    {
      key: "unitPrice",
      name: t("unitPrice"),
      planned: format.money(plannedPrice),
      actual: oneUnitPrice
        ? format.money(actualPrice)
        : t("average", { amount: format.money(actualPrice) }),
      difference: priceDifference,
      effect: effect(table.effects.price, colours.price.colour !== "grey"),
    },
    ...(hasExtras
      ? [
          {
            key: "extras",
            name: t("extras"),
            planned: format.money(table.extras.planned),
            actual: format.money(table.extras.actual),
            difference: (
              <span className="text-muted-foreground">{effect(extrasDifference, true)}</span>
            ),
            effect: effect(table.effects.extras, counting),
          },
        ]
      : []),
  ];

  const cell = "px-3 py-3 align-top";
  return (
    <section
      aria-labelledby="plan-actual-title"
      data-plan-actual
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="plan-actual-title" className="text-subheading font-semibold">
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("sums")}</p>
      </div>
      <table className="table-cards table-cards-flat w-full border-collapse text-sm">
        <thead className="border-b border-border text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className={cn(cell, "pl-0 font-medium")}>
              <span className="sr-only">{t("line")}</span>
            </th>
            <th scope="col" className={cn(cell, "text-right font-medium")}>
              {t("planned")}
            </th>
            <th scope="col" className={cn(cell, "text-right font-medium")}>
              {t("actual")}
            </th>
            <th scope="col" className={cn(cell, "font-medium")}>
              {t("difference")}
            </th>
            <th scope="col" className={cn(cell, "pr-0 text-right font-medium")}>
              {t("effect")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-plan-line={row.key} className="border-b border-border">
              <th scope="row" data-card="head" className={cn(cell, "pl-0 text-left font-medium")}>
                {row.name}
              </th>
              <td
                data-label={t("planned")}
                className={cn(cell, "text-right whitespace-nowrap tabular-nums")}
              >
                {row.planned}
              </td>
              <td
                data-label={t("actual")}
                className={cn(cell, "text-right whitespace-nowrap tabular-nums")}
              >
                {row.actual}
              </td>
              <td data-label={t("difference")} className={cn(cell, "tabular-nums")}>
                {row.difference}
              </td>
              <td
                data-label={t("effect")}
                data-plan-effect
                className={cn(cell, "pr-0 text-right whitespace-nowrap tabular-nums")}
              >
                {row.effect}
              </td>
            </tr>
          ))}
          <tr data-plan-line="total">
            <th scope="row" data-card="head" className={cn(cell, "pl-0 text-left font-semibold")}>
              {t("total")}
            </th>
            <td
              data-label={t("planned")}
              className={cn(cell, "text-right font-semibold whitespace-nowrap tabular-nums")}
            >
              {format.money(table.total.planned)}
            </td>
            <td
              data-label={t("actual")}
              className={cn(cell, "text-right font-semibold whitespace-nowrap tabular-nums")}
            >
              {format.money(table.total.actual)}
            </td>
            <td data-label={t("difference")} className={cell}>
              <ColourLabel
                plain
                {...(colours.total.colour === "grey"
                  ? ({ label: "total", colour: "grey" } as const)
                  : ({
                      label: "total",
                      colour: colours.total.colour,
                      difference: colours.total.difference,
                    } as const))}
              />
            </td>
            <td
              data-label={t("effect")}
              data-plan-effect
              className={cn(cell, "pr-0 text-right font-semibold whitespace-nowrap tabular-nums")}
            >
              {counting && table.total.planned === table.total.actual
                ? format.money(0n)
                : effect(table.total.planned - table.total.actual, counting)}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
