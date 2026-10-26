import { getTranslations } from "next-intl/server";

import { Icon, type IconName } from "@/components/icon";
import { ColourLabel, ColourLabels } from "@/components/status-label";
import { cn } from "@/components/utils";
import type { OrderColours, OrderLabel, PlanVsActual } from "@/domain/colours";
import { wireColours } from "@/features/orders/list-wire";
import { getFormatters } from "@/i18n/get-formatters";

// The order page's Plan and actual block (11-screens-and-ux.md, Order page layout 2; plan of 2.9b,
// decided item 5, Look first): before Open the planned total alone; from Open on the three labels
// beside the title (08 The three colours: "Each order shows three labels on its page"), over the
// planned total while nothing counted is bought (grey while buying is open; a finished Not bought
// order shows "Bought fewer" and "Left …"), and over the table once something counted is bought.
// Nothing in it is shown twice: the totals strip it replaces is gone.
//
// The table (redesign of 22.10.2026): quantity, price per unit, extra
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

export async function PlanActualBlock({
  plannedTotal,
  unpriced = false,
  hint,
  colours,
  table,
  unit,
}: {
  /** null on a draft whose plan is not complete, and on an order without a planned price. */
  plannedTotal: bigint | null;
  /** A submitted order without a planned price: "No planned price" (08 Numbers). */
  unpriced?: boolean;
  /** The price hint beside the planned total, already worded; null without one. */
  hint: string | null;
  /** From Open on (orderColours()); null before. */
  colours: OrderColours | null;
  /** planVsActual(): null while nothing counted is bought (cancelled records do not count). */
  table: PlanVsActual | null;
  unit: string;
}) {
  const t = await getTranslations("orders.page");
  const tUnpriced = await getTranslations("orders.unpriced");
  const format = await getFormatters();
  return (
    <section
      aria-labelledby="plan-actual-title"
      data-plan-actual
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h2 id="plan-actual-title" className="text-subheading font-semibold">
          {t("planActual.title")}
        </h2>
        {/* 08 The three colours, from Open on: "Each order shows three labels on its page". */}
        {colours ? <ColourLabels colours={wireColours(colours)!} /> : null}
      </div>
      {table && colours ? (
        <PlanActualTable table={table} colours={colours} unit={unit} />
      ) : (
        <div data-fact="plannedTotal" className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("plannedTotal")}</span>
          {plannedTotal === null ? (
            <span className="text-sm text-muted-foreground">
              {unpriced ? tUnpriced("none") : t("details.notSet")}
            </span>
          ) : (
            <span className="text-figure font-semibold tabular-nums">
              {format.money(plannedTotal)}
            </span>
          )}
          {hint ? <span className="text-xs text-warning">{hint}</span> : null}
        </div>
      )}
    </section>
  );
}

async function PlanActualTable({
  table,
  colours,
  unit,
}: {
  table: PlanVsActual;
  colours: OrderColours;
  unit: string;
}) {
  const t = await getTranslations("orders.page.planActual");
  const tUnpriced = await getTranslations("orders.unpriced");
  const format = await getFormatters();
  // Without a planned price there is no planned money and no effect (08 Numbers; plan of 2.5d-b,
  // decided item 4, Look first).
  const planned = (amount: bigint | null) =>
    amount === null ? tUnpriced("none") : format.money(amount);
  const unpricedLook = <Coloured colour="grey">{tUnpriced("none")}</Coloured>;
  const quantity = (value: string) => `${format.quantity(value)} ${unit}`.trim();
  // An amount without its sign, for its words; every difference itself is planVsActual()'s.
  const magnitude = (amount: bigint) => (amount < 0n ? -amount : amount);
  // An effect is planned − actual (08 Difference): below 0 more was spent, above 0 less.
  const effect = (amount: bigint, shown: boolean) =>
    !shown || amount === 0n
      ? t("none")
      : t(amount < 0n ? "spentMore" : "spentLess", { amount: format.money(magnitude(amount)) });

  const counting = colours.total.colour !== "grey" && colours.total.colour !== "unpriced";
  const effects = table.effects;

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
  const perUnit =
    table.unitPrice.difference === null ? null : magnitude(table.unitPrice.difference);
  const priceDifference =
    colours.price.colour === "unpriced" || perUnit === null ? (
      unpricedLook
    ) : colours.price.colour === "grey" ? (
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
      effect: effects
        ? effect(effects.quantity, colours.number.colour !== "grey")
        : t("none"),
    },
    {
      key: "unitPrice",
      name: t("unitPrice"),
      planned: planned(plannedPrice),
      actual: oneUnitPrice
        ? format.money(actualPrice)
        : t("average", { amount: format.money(actualPrice) }),
      difference: priceDifference,
      effect: effects ? effect(effects.price, colours.price.colour !== "grey") : t("none"),
    },
    ...(hasExtras
      ? [
          {
            key: "extras",
            name: t("extras"),
            planned: format.money(table.extras.planned),
            actual: format.money(table.extras.actual),
            difference: (
              <span className="text-muted-foreground">
                {effects ? effect(effects.extras, true) : t("none")}
              </span>
            ),
            effect: effects ? effect(effects.extras, counting) : t("none"),
          },
        ]
      : []),
  ];

  const cell = "px-3 py-3 align-top";
  return (
    <>
      <p className="-mt-2 text-xs text-muted-foreground">{t("sums")}</p>
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
              {planned(table.total.planned)}
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
                {...(colours.total.colour === "grey" || colours.total.colour === "unpriced"
                  ? ({ label: "total", colour: colours.total.colour } as const)
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
              {table.total.difference === null
                ? t("none")
                : counting && table.total.difference === 0n
                  ? format.money(0n)
                  : effect(table.total.difference, counting)}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
