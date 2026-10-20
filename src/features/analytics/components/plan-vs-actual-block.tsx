import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { BarChartBlock } from "@/components/charts/bar-chart";
import type { ChartPoint } from "@/components/charts/chart-point";
import { OutcomeLabel } from "@/components/status-label";
import type { Colour } from "@/domain/colours";
import { getFormatters } from "@/i18n/get-formatters";

import type { PlanVsActual, Tally } from "../queries/plan-vs-actual";
import {
  type AnalyticsFilters,
  type DrillKey,
  type ExportBlock,
  OUTCOME_COLOURS,
  type PeriodInput,
  analyticsSearch,
} from "../period-params";
import { changeText, countChangeText, shareChangeText } from "./change-text";

// The Plan vs actual block of the Head's Analytics page (10-notifications-analytics-reports.md,
// Analytics page per role, Head: "Share of orders ending green, orange and red; total overspent and
// total saved; by branch and by Manager"; build-plan 6.4a). Each colour carries its icon, word and
// amount (08 The three colours, bullet 3), its count, share and their changes (10 point 1; plan of
// 6.4, decided item 7); every number opens the orders behind it (point 3), a branch or Manager cell
// with that filter set, "Other owners" with `owner=other` (review of the plan, correction 1); the
// chart and both tables export to Excel (point 4). The page computes nothing: the numbers are the
// query's.

const AMOUNT: Record<Colour, (tally: Tally) => bigint> = {
  green: () => 0n,
  amber: (tally) => tally.saved.amount,
  red: (tally) => tally.overspent.amount,
};

export async function PlanVsActualView({
  block,
  period,
  filters,
}: {
  block: PlanVsActual;
  period: PeriodInput;
  filters: AnalyticsFilters;
}) {
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const orders = (key: DrillKey, scope: AnalyticsFilters = filters, otherOwners = false) =>
    `/analytics/orders?${analyticsSearch(period, scope, { key, otherOwners })}`;
  const download = (exportBlock: ExportBlock) =>
    `/analytics/download?${analyticsSearch(period, filters, { block: exportBlock })}`;
  const { total } = block;
  const empty = total.orders.count === 0 && total.orders.change.difference === 0n;
  const count = (value: number) => format.quantity(String(value));

  const points: ChartPoint[] = OUTCOME_COLOURS.map((colour) => ({
    key: colour,
    label: t(`plan.outcome.${colour}`),
    value: total.colours[colour].count,
    shown: count(total.colours[colour].count),
    change: countChangeText(total.colours[colour].change, t, format),
    href: orders({ kind: "colour", colour }),
  }));

  return (
    <section
      aria-labelledby="plan-title"
      className="flex flex-col gap-4"
      data-analytics-block="plan"
    >
      <div className="flex flex-col gap-1">
        <h2 id="plan-title" className="text-heading font-semibold">
          {t("plan.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("plan.note")}</p>
      </div>
      {empty ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground max-sm:p-4 sm:p-5">
          {t("plan.empty")}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tile
              label={t("plan.ended")}
              href={orders({ kind: "period" })}
              value={count(total.orders.count)}
              lines={[countChangeText(total.orders.change, t, format)]}
              data="ended"
            />
            {OUTCOME_COLOURS.map((colour) => {
              const each = total.colours[colour];
              return (
                <Tile
                  key={colour}
                  label={<OutcomeLabel colour={colour} amount={AMOUNT[colour](total)} />}
                  href={orders({ kind: "colour", colour })}
                  value={count(each.count)}
                  lines={[
                    each.share === null
                      ? t("plan.noShare")
                      : t("plan.share", { share: format.quantity(each.share) }),
                    countChangeText(each.change, t, format),
                    shareChangeText(each.shareChange, t, format),
                  ]}
                  data={colour}
                />
              );
            })}
            <Tile
              label={t("plan.overspent")}
              href={orders({ kind: "overspent" })}
              value={format.money(total.overspent.amount)}
              lines={[changeText(total.overspent.change, t, format)]}
              data="overspent"
            />
            <Tile
              label={t("plan.saved")}
              href={orders({ kind: "saved" })}
              value={format.money(total.saved.amount)}
              lines={[changeText(total.saved.change, t, format)]}
              data="saved"
            />
          </div>
          <Card id="plan-outcomes" title={t("plan.byOutcome")} excel={download("outcomes")}>
            <BarChartBlock points={points} label={t("plan.byOutcome")} />
          </Card>
          <Card id="plan-branches" title={t("plan.byBranch")} excel={download("outcomeBranches")}>
            <TallyTable
              firstColumn={t("plan.columns.branch")}
              rows={block.branches.map((row) => ({
                key: row.id,
                label: row.isActive ? row.name : t("inactive", { name: row.name }),
                tally: row,
                href: (key) => orders(key, { ...filters, branch: row.id }),
              }))}
            />
          </Card>
          <Card id="plan-managers" title={t("plan.byManager")} excel={download("outcomeManagers")}>
            <TallyTable
              firstColumn={t("plan.columns.manager")}
              rows={block.managers.map((row) => ({
                key: row.id ?? "other",
                label:
                  row.id === null
                    ? t("plan.otherOwners")
                    : row.isActive
                      ? row.name!
                      : t("inactive", { name: row.name! }),
                tally: row,
                href: (key) =>
                  row.id === null
                    ? orders(key, { ...filters, manager: null }, true)
                    : orders(key, { ...filters, manager: row.id }),
              }))}
            />
          </Card>
        </>
      )}
    </section>
  );
}

function Tile({
  label,
  href,
  value,
  lines,
  data,
}: {
  label: React.ReactNode;
  href: string;
  value: string;
  lines: string[];
  data: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 sm:p-5"
      data-plan-tile={data}
    >
      <div className="text-sm leading-5 font-semibold text-muted-foreground">{label}</div>
      <Link
        href={href}
        className="inline-flex min-h-11 min-w-11 items-center self-start text-title tabular-nums underline-offset-4 hover:underline"
        data-plan-number
      >
        {value}
      </Link>
      {lines.map((line) => (
        <p key={line} className="text-sm leading-5 text-muted-foreground tabular-nums">
          {line}
        </p>
      ))}
    </div>
  );
}

async function Card({
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

type TallyRow = { key: string; label: string; tally: Tally; href: (key: DrillKey) => string };

async function TallyTable({ firstColumn, rows }: { firstColumn: string; rows: TallyRow[] }) {
  const t = await getTranslations("analytics");
  const format = await getFormatters();
  const count = (value: number) => format.quantity(String(value));
  type Cell = { id: string; key: DrillKey; shown: string; change: string };
  const cells = (tally: Tally): Cell[] => [
    {
      id: "orders",
      key: { kind: "period" },
      shown: count(tally.orders.count),
      change: countChangeText(tally.orders.change, t, format),
    },
    ...OUTCOME_COLOURS.map((colour) => ({
      id: colour,
      key: { kind: "colour", colour } as const,
      shown: count(tally.colours[colour].count),
      change: countChangeText(tally.colours[colour].change, t, format),
    })),
    {
      id: "overspent",
      key: { kind: "overspent" },
      shown: format.money(tally.overspent.amount),
      change: changeText(tally.overspent.change, t, format),
    },
    {
      id: "saved",
      key: { kind: "saved" },
      shown: format.money(tally.saved.amount),
      change: changeText(tally.saved.change, t, format),
    },
  ];
  const headings = [
    t("plan.columns.orders"),
    t("plan.columns.green"),
    t("plan.columns.amber"),
    t("plan.columns.red"),
    t("plan.columns.overspent"),
    t("plan.columns.saved"),
  ];
  return (
    // A table wider than a phone scrolls; the keyboard reaches it too (WCAG 2.1.1; plan of 9.1d).
    <div
      tabIndex={0}
      className="overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <table className="w-full min-w-[48rem] border-collapse text-left text-sm leading-5">
        <thead className="bg-muted text-small font-semibold text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2">
              {firstColumn}
            </th>
            {headings.map((heading) => (
              <th key={heading} scope="col" className="px-3 py-2 text-right">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t align-top" data-tally-row={row.key}>
              <th scope="row" className="px-3 py-2 font-normal">
                {row.label}
              </th>
              {cells(row.tally).map((cell) => (
                <td key={cell.id} className="px-3 py-2 text-right tabular-nums" data-cell={cell.id}>
                  <Link
                    href={row.href(cell.key)}
                    className="font-semibold whitespace-nowrap text-link underline-offset-2 hover:underline"
                  >
                    {cell.shown}
                  </Link>
                  <span className="block text-small text-muted-foreground">{cell.change}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
