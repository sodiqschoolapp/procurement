import { getTranslations } from "next-intl/server";
import Link from "next/link";

import type { ChartPoint } from "@/components/charts/chart-point";
import { LineChartBlock } from "@/components/charts/line-chart";
import { getFormatters } from "@/i18n/get-formatters";

import type { PricePair, Prices, SubtypeName } from "../queries/prices";
import {
  type AnalyticsFilters,
  type DrillKey,
  type ExportBlock,
  type PeriodInput,
  TOP_PRICES,
  analyticsSearch,
} from "../period-params";
import { changeText } from "./change-text";

// The Prices block of the Head's Analytics page (10-notifications-analytics-reports.md, Analytics
// page per role, Head: "Price trend of any product; biggest price rises in the last 90 days; the
// same product bought at different prices by different branches or suppliers"; build-plan 6.4b).
// The trend of one subtype, picked in the block (`variant=`, plan of 6.4b, decided item 3), as a
// line chart with its table under it; the 10 largest rises and spreads, the export holding all
// (decided items 4 and 5). Every price opens the records behind it (point 3, decided item 12);
// each table exports to Excel (point 4). The page computes nothing: the prices are the query's.

export function subtypeLabel(name: SubtypeName): string {
  return name.subtypeName ? `${name.productName}, ${name.subtypeName}` : name.productName;
}

export async function PricesView({
  block,
  choices,
  variant,
  period,
  filters,
}: {
  block: Prices;
  choices: SubtypeName[];
  /** The subtype in the address, kept by the picker. */
  variant: string | null;
  period: PeriodInput;
  filters: AnalyticsFilters;
}) {
  const t = await getTranslations("analytics");
  const tShort = await getTranslations("analytics.short");
  const tMonths = await getTranslations("months");
  const format = await getFormatters();
  const records = (key: DrillKey, scope: AnalyticsFilters = filters, at: PeriodInput = period) =>
    `/analytics/records?${analyticsSearch(at, scope, { key })}`;
  const download = (exportBlock: ExportBlock) =>
    `/analytics/download?${analyticsSearch(period, filters, { variant, block: exportBlock })}`;
  const monthLabel = (month: string) =>
    t("monthLabel", {
      month: tMonths(String(Number(month.slice(5))) as "1"),
      year: month.slice(0, 4),
    });
  const { trend } = block;
  const points: ChartPoint[] = (trend?.points ?? []).flatMap((point) =>
    point.price === null
      ? []
      : [
          {
            key: point.month,
            label: monthLabel(point.month),
            // The drawing's height only (src/components/charts/chart-point.ts).
            value: Number(point.price),
            shown: format.money(point.price),
            change: point.change ? changeText(point.change, tShort, format) : "",
            href: records({
              kind: "price",
              variant: trend!.variantId,
              month: point.month,
              noSupplier: false,
            }),
          },
        ],
  );
  // The fields of the address the picker keeps (10 point 1: the page's period and filters).
  const kept = Object.entries(
    Object.fromEntries(new URLSearchParams(analyticsSearch(period, filters))),
  );
  const pairLink = (variantId: string, pair: PricePair) =>
    records(
      { kind: "price", variant: variantId, month: null, noSupplier: pair.supplierId === null },
      { ...filters, branch: pair.branchId, supplier: pair.supplierId },
    );
  const pairText = (pair: PricePair) =>
    t("joined", { first: pair.branchName, second: pair.supplierName ?? t("records.noSupplier") });

  return (
    <section
      aria-labelledby="prices-title"
      className="flex flex-col gap-4"
      data-analytics-block="prices"
    >
      <div className="flex flex-col gap-1">
        <h2 id="prices-title" className="text-heading font-semibold">
          {t("prices.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("prices.note")}</p>
      </div>

      <Card id="prices-trend" title={t("prices.trend")} excel={download("priceTrend")}>
        <form action="/analytics" className="flex flex-wrap items-end gap-3" data-price-picker>
          {kept.map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm leading-5 font-semibold">
            {t("prices.product")}
            <select
              name="variant"
              defaultValue={trend?.variantId ?? ""}
              className="min-h-11 rounded-md border bg-background px-3 text-sm font-normal sm:min-h-9"
            >
              {!trend && <option value="">{t("prices.choose")}</option>}
              {choices.map((choice) => (
                <option key={choice.variantId} value={choice.variantId}>
                  {subtypeLabel(choice)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="min-h-11 rounded-md border px-4 text-sm font-semibold sm:min-h-9"
          >
            {t("prices.show")}
          </button>
        </form>
        {!trend || points.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-trend-empty>
            {trend ? t("prices.trendEmpty", { name: subtypeLabel(trend) }) : t("prices.noRecords")}
          </p>
        ) : (
          <>
            <LineChartBlock points={points} label={t("prices.trend")} />
            <Table
              headings={[
                t("prices.columns.month"),
                t("prices.columns.price"),
                t("prices.columns.change"),
              ]}
              rows={trend.points.map((point) => ({
                key: point.month,
                cells: [
                  <Link
                    key="month"
                    href={records({
                      kind: "price",
                      variant: trend.variantId,
                      month: point.month,
                      noSupplier: false,
                    })}
                    className="font-semibold text-link underline-offset-2 hover:underline"
                  >
                    {monthLabel(point.month)}
                  </Link>,
                  point.price === null ? t("prices.noPrice") : format.money(point.price),
                  point.change ? changeText(point.change, tShort, format) : "",
                ],
              }))}
              data="trend"
            />
          </>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="prices-rises" title={t("prices.rises")} excel={download("priceRises")}>
          <p className="text-sm leading-5 text-muted-foreground">
            {t("prices.risesWindow", {
              first: format.date(block.riseWindow.first),
              last: format.date(block.riseWindow.last),
            })}
          </p>
          {block.rises.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("prices.risesEmpty")}</p>
          ) : (
            <Table
              headings={[
                t("prices.columns.product"),
                t("prices.columns.earlier"),
                t("prices.columns.newest"),
                t("prices.columns.rise"),
              ]}
              rows={block.rises.slice(0, TOP_PRICES).map((rise) => ({
                key: rise.variantId,
                cells: [
                  subtypeLabel(rise),
                  t("joined", {
                    first: format.money(rise.earlier.price),
                    second: format.date(rise.earlier.purchasedOn),
                  }),
                  t("joined", {
                    first: format.money(rise.newest.price),
                    second: format.date(rise.newest.purchasedOn),
                  }),
                  <Link
                    key="rise"
                    href={records(
                      { kind: "price", variant: rise.variantId, month: null, noSupplier: false },
                      filters,
                      {
                        choice: "custom",
                        from: rise.earlier.purchasedOn,
                        to: block.riseWindow.last,
                      },
                    )}
                    className="font-semibold whitespace-nowrap text-link underline-offset-2 hover:underline"
                  >
                    {t("prices.riseBy", {
                      amount: format.money(rise.rise.difference),
                      percent: format.quantity(rise.rise.percent ?? "0"),
                    })}
                  </Link>,
                ],
              }))}
              data="rises"
            />
          )}
        </Card>

        <Card id="prices-spread" title={t("prices.spread")} excel={download("priceSpread")}>
          {block.spreads.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("prices.spreadEmpty")}</p>
          ) : (
            <Table
              headings={[
                t("prices.columns.product"),
                t("prices.columns.cheapest"),
                t("prices.columns.dearest"),
                t("prices.columns.difference"),
              ]}
              rows={block.spreads.slice(0, TOP_PRICES).map((spread) => ({
                key: spread.variantId,
                cells: [
                  <Link
                    key="product"
                    href={records({
                      kind: "price",
                      variant: spread.variantId,
                      month: null,
                      noSupplier: false,
                    })}
                    className="font-semibold text-link underline-offset-2 hover:underline"
                  >
                    {subtypeLabel(spread)}
                  </Link>,
                  <PairCell
                    key="cheapest"
                    href={pairLink(spread.variantId, spread.cheapest)}
                    price={format.money(spread.cheapest.price)}
                    where={pairText(spread.cheapest)}
                  />,
                  <PairCell
                    key="dearest"
                    href={pairLink(spread.variantId, spread.dearest)}
                    price={format.money(spread.dearest.price)}
                    where={pairText(spread.dearest)}
                  />,
                  t("prices.riseBy", {
                    amount: format.money(spread.spread.difference),
                    percent: format.quantity(spread.spread.percent ?? "0"),
                  }),
                ],
              }))}
              data="spread"
            />
          )}
        </Card>
      </div>
    </section>
  );
}

function PairCell({ href, price, where }: { href: string; price: string; where: string }) {
  return (
    <>
      <Link
        href={href}
        className="font-semibold whitespace-nowrap text-link underline-offset-2 hover:underline"
      >
        {price}
      </Link>
      <span className="block text-small text-muted-foreground">{where}</span>
    </>
  );
}

/** A card of the block: its title, its Excel link, its content (10 point 4). */
export async function Card({
  id,
  title,
  excel,
  children,
}: {
  id: string;
  title: string;
  excel: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("analytics");
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
      data-chart-card={id}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`${id}-title`} className="text-subheading font-semibold">
          {title}
        </h3>
        <a
          href={excel}
          className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold underline-offset-2 hover:underline sm:min-h-0"
          data-excel={id}
        >
          {t("excel")}
        </a>
      </div>
      {children}
    </section>
  );
}

/**
 * A table of a card; the first cell heads the row. On a phone each row is a short card of label and
 * value (`table-cards`), so nothing is cut off at 375 px; wider screens keep the columns.
 */
export function Table({
  headings,
  rows,
  data,
}: {
  headings: string[];
  rows: { key: string; cells: React.ReactNode[] }[];
  data: string;
}) {
  return (
    // A table wider than a phone scrolls; the keyboard reaches it too (WCAG 2.1.1; plan of 9.1d).
    <div
      tabIndex={0}
      className="overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <table
        className="table-cards table-cards-flat w-full min-w-[32rem] border-collapse text-left text-sm leading-5"
        data-table={data}
      >
        <thead className="border-b border-border bg-muted text-xs font-medium text-muted-foreground">
          <tr>
            {headings.map((heading, index) => (
              <th
                key={heading}
                scope="col"
                className={index === 0 ? "px-3 py-2" : "px-3 py-2 text-right"}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t align-top" data-row={row.key}>
              {row.cells.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row" data-card="head" className="px-3 py-2 font-normal">
                    {cell}
                  </th>
                ) : (
                  <td
                    key={index}
                    data-label={headings[index]}
                    className="px-3 py-2 text-right tabular-nums"
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
