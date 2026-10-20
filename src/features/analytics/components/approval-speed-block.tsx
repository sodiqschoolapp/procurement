import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { WAITING_GROUP_KEYS } from "@/domain/analytics";
import { STUCK_STATUSES } from "@/domain/order-steps";
import { getFormatters } from "@/i18n/get-formatters";

import type { ApprovalSpeed, Hours } from "../queries/approval-speed";
import {
  type AnalyticsFilters,
  type DrillKey,
  type ExportBlock,
  type PeriodInput,
  analyticsSearch,
} from "../period-params";
import { countChangeText, hoursChangeText, shareChangeText } from "./change-text";
import { Card, Table } from "./prices-block";

// The Approval speed block of the Head's Analytics page (10-notifications-analytics-reports.md,
// Analytics page per role, Head: "Average hours at each step per branch; orders waiting now, by
// age; share sent back or rejected, with the most common reasons"; build-plan 6.4b; plan of 6.4b,
// decided items 6 to 12). Every number opens the stays or orders behind it on /analytics/approvals
// (point 3), a branch's cell with that filter set; every table exports to Excel (point 4); every
// number of the period shows its change (point 1), "waiting now" none (decided item 8). The page
// computes nothing: the numbers are the query's.

export async function ApprovalSpeedView({
  block,
  period,
  filters,
}: {
  block: ApprovalSpeed;
  period: PeriodInput;
  filters: AnalyticsFilters;
}) {
  const t = await getTranslations("analytics");
  const tShort = await getTranslations("analytics.short");
  const format = await getFormatters();
  const approvals = (key: DrillKey, scope: AnalyticsFilters = filters, reason?: string) =>
    `/analytics/approvals?${analyticsSearch(period, scope, { key, reason })}`;
  const download = (exportBlock: ExportBlock) =>
    `/analytics/download?${analyticsSearch(period, filters, { block: exportBlock })}`;
  const count = (value: number) => format.quantity(String(value));
  const link = (href: string, text: string) => (
    <Link
      href={href}
      className="font-semibold whitespace-nowrap text-link underline-offset-2 hover:underline"
    >
      {text}
    </Link>
  );
  const hoursCell = (hours: Hours, href: string) =>
    hours.hours === null ? (
      <span className="text-muted-foreground">{t("speed.noStay")}</span>
    ) : (
      <>
        {link(href, t("speed.hours", { hours: format.quantity(hours.hours) }))}
        <span className="block text-small text-muted-foreground">
          {t("joined", {
            first: t("speed.stays", { count: hours.count }),
            second: hoursChangeText(hours.change, tShort, format),
          })}
        </span>
      </>
    );
  const steps = STUCK_STATUSES;
  const stepNames = steps.map((step) => t(`speed.step.${step}`));

  return (
    <section
      aria-labelledby="speed-title"
      className="flex flex-col gap-4"
      data-analytics-block="speed"
    >
      <div className="flex flex-col gap-1">
        <h2 id="speed-title" className="text-heading font-semibold">
          {t("speed.title")}
        </h2>
        <p className="text-sm leading-5 text-muted-foreground">{t("speed.note")}</p>
      </div>

      <Card id="speed-hours" title={t("speed.byBranch")} excel={download("stepHours")}>
        <Table
          headings={[t("speed.columns.branch"), ...stepNames]}
          rows={[
            ...block.branches.map((row) => ({
              key: row.branchId,
              cells: [
                row.isActive ? row.name : t("inactive", { name: row.name }),
                ...steps.map((step) =>
                  hoursCell(
                    row.steps[step],
                    approvals(
                      { kind: "step", step, decision: null },
                      { ...filters, branch: row.branchId },
                    ),
                  ),
                ),
              ],
            })),
            {
              key: "all",
              cells: [
                <strong key="all">{t("speed.allBranches")}</strong>,
                ...steps.map((step) =>
                  hoursCell(block.all[step], approvals({ kind: "step", step, decision: null })),
                ),
              ],
            },
          ]}
          data="hours"
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="speed-waiting" title={t("speed.waiting")} excel={download("waiting")}>
          <p className="text-sm leading-5 text-muted-foreground">{t("speed.waitingNote")}</p>
          <Table
            headings={[
              t("speed.columns.step"),
              ...WAITING_GROUP_KEYS.map((group) => t(`speed.group.${group}`)),
              t("speed.columns.all"),
            ]}
            rows={[...steps, null].map((step) => ({
              key: step ?? "all",
              cells: [
                step ? t(`speed.step.${step}`) : <strong key="all">{t("speed.allSteps")}</strong>,
                ...[...WAITING_GROUP_KEYS, null].map((group) =>
                  link(
                    approvals({ kind: "waiting", step, group }),
                    count(block.waiting[step ?? "all"][group ?? "all"]),
                  ),
                ),
              ],
            }))}
            data="waiting"
          />
        </Card>

        <Card id="speed-decisions" title={t("speed.decisions")} excel={download("decisions")}>
          <Table
            headings={[
              t("speed.columns.step"),
              t("speed.columns.decisions"),
              t("speed.columns.sentBack"),
              t("speed.columns.rejected"),
            ]}
            rows={[...steps, null].map((step) => {
              const shares = block.shares[step ?? "all"];
              const part = (
                decision: "SEND_BACK" | "REJECT",
                value: (typeof shares)["sentBack"],
              ) => (
                <>
                  {link(
                    approvals({ kind: "step", step, decision }),
                    value.share === null
                      ? t("speed.noDecision")
                      : t("speed.share", {
                          share: format.quantity(value.share),
                          count: value.count,
                        }),
                  )}
                  <span className="block text-small text-muted-foreground">
                    {shareChangeText(value.change, tShort, format)}
                  </span>
                </>
              );
              return {
                key: step ?? "all",
                cells: [
                  step ? t(`speed.step.${step}`) : <strong key="all">{t("speed.allSteps")}</strong>,
                  link(approvals({ kind: "step", step, decision: null }), count(shares.decisions)),
                  part("SEND_BACK", shares.sentBack),
                  part("REJECT", shares.rejected),
                ],
              };
            })}
            data="decisions"
          />
        </Card>
      </div>

      <Card id="speed-reasons" title={t("speed.reasons")} excel={download("reasons")}>
        <div className="grid gap-4 lg:grid-cols-2">
          {(["SEND_BACK", "REJECT"] as const).map((decision) => (
            <div key={decision} className="flex min-w-0 flex-col gap-2" data-reasons={decision}>
              <h4 className="text-sm font-semibold">{t(`speed.reasonsOf.${decision}`)}</h4>
              {block.reasons[decision].length === 0 ? (
                <p className="text-sm leading-5 text-muted-foreground">{t("speed.noReasons")}</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {block.reasons[decision].map((reason) => (
                    <li key={reason.key} className="flex flex-col border-t pt-2" data-reason>
                      <span className="text-sm leading-5 break-words">{reason.text}</span>
                      <span className="text-sm leading-5 tabular-nums">
                        {link(
                          approvals({ kind: "step", step: null, decision }, filters, reason.key),
                          t("speed.times", { count: reason.count }),
                        )}{" "}
                        <span className="text-muted-foreground">
                          {countChangeText(reason.change, tShort, format)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
